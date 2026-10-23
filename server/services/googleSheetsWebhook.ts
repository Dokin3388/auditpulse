import { createHash } from 'node:crypto';
import type pg from 'pg';

export interface GoogleSheetWebhookPayload {
  sourceId: string;
  sheetName: string;
  deliveryId: string;
  headers: string[];
  rows: unknown[][];
  rowStart?: number;
  spreadsheetId?: string;
}

export interface GoogleSheetSyncResult {
  duplicate: boolean;
  totalRows: number;
  appliedRows: number;
  skippedRows: number;
  runId: string;
}

const MAX_ROWS_PER_DELIVERY = 500;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

/** Keep normalized VARCHAR fields within their database contract. The full
 * source cell remains available in google_sheet_row_state for traceability.
 */
function boundedText(value: unknown, maxLength: number): string {
  return text(value).slice(0, maxLength);
}

/**
 * Keep source identifiers within the database VARCHAR(50) contract without
 * collapsing different long values onto the same truncated key. The complete
 * source value is still retained in google_sheet_row_state.payload.
 */
function boundedKey(value: unknown, maxLength = 50): string {
  const normalized = text(value);
  if (!normalized || normalized.length <= maxLength) return normalized;

  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  if (maxLength <= digest.length + 1) return digest.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - digest.length - 1)}-${digest}`;
}

export function normalizeGoogleSheetHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().toLowerCase().replace(/\s+/g, '_');
}

export function stableGoogleSheetHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function toGoogleSheetRow(headers: string[], cells: unknown[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [normalizeGoogleSheetHeader(header), text(cells[index])]));
}

export function googleSheetSourceRowKey(sheetName: string, row: Record<string, string>, fallbackIndex: number): string {
  const sheet = normalizeGoogleSheetHeader(sheetName);
  const pick = (...keys: string[]) => keys.map((key) => row[normalizeGoogleSheetHeader(key)]).find(Boolean) ?? '';

  if (sheet === 'data_team_sale') return pick('id_team');
  if (sheet === 'data_sale') return pick('id_sale');
  if (sheet === 'trang_tinh1') return pick('ten_auditor');
  if (sheet === 'data_customers' || sheet === 'tonghopkhachhang') return pick('ma_khach_hang', 'so_dien_thoai') || `${sheet}:${fallbackIndex}`;
  if (sheet === 'misa_bao_gia_ggs') return pick('so_bao_gia');
  if (sheet === 'misa_don_hang_ggs') return pick('so_chung_tu');
  if (sheet === 'dim_issue') return pick('issue_code');
  if (sheet === 'fact_issue_log') {
    return [pick('date'), pick('sale'), pick('sdt'), pick('issue_code'), pick('legacy_code')].join('|');
  }
  return `${sheet}:${fallbackIndex}`;
}

function dateOrNow(value: string): string {
  const raw = text(value);
  // Vietnamese source sheets use DD/MM/YYYY (and sometimes DD-MM-YYYY).
  // Date.parse is locale-dependent and silently turns 02/01/2026 into the
  // wrong month on a US-runtime, so parse these dates explicitly first.
  const vietnameseDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (vietnameseDate) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = vietnameseDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() === Number(month) - 1 && parsed.getUTCDate() === Number(day)) {
      return parsed.toISOString();
    }
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

export function googleSheetAmount(value: string): number {
  const digits = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * `customers.phone` represents one contact number. A few legacy rows contain
 * a newline/comma-separated contact list; retain the first phone rather than
 * attempting to store a contact list in a VARCHAR(50) field.
 */
export function primaryGoogleSheetPhone(value: string): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const firstPhone = !/[\n,;]/.test(normalized)
    ? normalized
    : normalized.split(/[\n,;]+/).map(text).find(Boolean) ?? '';
  return firstPhone ? boundedKey(firstPhone) : null;
}

function makePendingEmail(role: 'sale' | 'auditor', code: string): string {
  return `sync+${role}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown'}@pending.auditpulse.local`;
}

async function resolveSaleId(client: pg.PoolClient, saleNameOrCode: string): Promise<string | null> {
  const value = text(saleNameOrCode);
  if (!value) return null;
  const result = await client.query(
    `SELECT sp.id
     FROM sales_profiles sp JOIN app_users u ON u.id = sp.id
     WHERE sp.sale_code = $1 OR lower(u.name) = lower($1)
     LIMIT 1`,
    [value]
  );
  return result.rows[0]?.id ?? null;
}

/** Preserve historical transaction ownership even when the current sales tab
 * no longer includes an employee who issued an old quotation/order. */
async function resolveOrCreateHistoricalSaleId(client: pg.PoolClient, saleNameOrCode: string): Promise<string | null> {
  const existingId = await resolveSaleId(client, saleNameOrCode);
  if (existingId) return existingId;

  const name = text(saleNameOrCode) || 'Sale lịch sử chưa xác định';
  const fingerprint = createHash('sha256').update((text(saleNameOrCode) || '__unknown__').toLowerCase()).digest('hex').slice(0, 32);
  const id = `SALE-LEGACY-${fingerprint}`;
  const code = `LEGACY-${fingerprint}`;
  await client.query(
    `INSERT INTO app_users (id, email, name, role, is_active, login_enabled)
     VALUES ($1, $2, $3, 'SALE', false, false)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, login_enabled = false` ,
    [id, makePendingEmail('sale', code), name]
  );
  await client.query(
    `INSERT INTO sales_profiles (id, sale_code, team_id, phone)
     VALUES ($1, $2, NULL, NULL)
     ON CONFLICT (sale_code) DO NOTHING`,
    [id, code]
  );
  return id;
}

async function resolveTeamId(client: pg.PoolClient, teamNameOrCode: string): Promise<string | null> {
  const value = text(teamNameOrCode);
  if (!value) return null;
  const result = await client.query(
    'SELECT id FROM teams WHERE code = $1 OR lower(name) = lower($1) LIMIT 1',
    [value]
  );
  return result.rows[0]?.id ?? null;
}

async function resolveCustomerId(client: pg.PoolClient, customerCode: string): Promise<string | null> {
  const value = text(customerCode);
  if (!value) return null;
  const result = await client.query('SELECT id FROM customers WHERE code = $1 OR phone = $1 LIMIT 1', [value]);
  return result.rows[0]?.id ?? null;
}

/** Keep every historical quotation/order even when its customer was not
 * present in the CRM customer tab. The transaction identity is still unique
 * by customer code/phone; only truly incomplete rows fall back to a stable
 * name+phone fingerprint instead of being silently dropped. */
async function resolveOrCreateHistoricalCustomerId(
  client: pg.PoolClient,
  customerCodeOrPhone: string,
  customerName: string,
  phone: string,
  firstSeenDate: string
): Promise<string | null> {
  const lookup = text(customerCodeOrPhone);
  const existingId = await resolveCustomerId(client, lookup);
  if (existingId) return existingId;

  const boundedLookup = boundedKey(lookup);
  if (boundedLookup && boundedLookup !== lookup) {
    const boundedExistingId = await resolveCustomerId(client, boundedLookup);
    if (boundedExistingId) return boundedExistingId;
  }

  const name = text(customerName) || 'Khách hàng lịch sử';
  const identity = lookup || `${name}|${primaryGoogleSheetPhone(phone) || ''}`;
  if (!identity) return null;
  const fingerprint = createHash('sha256').update(identity.toLowerCase()).digest('hex').slice(0, 24);
  const code = boundedKey(lookup || `LEGACY-CUSTOMER-${fingerprint}`);
  await client.query(
    `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
     VALUES ($1, $2, $3, $4, NULL, 'HISTORICAL_TRANSACTION', $5, NULL, NULL)
     ON CONFLICT (code) DO UPDATE SET name = COALESCE(NULLIF(customers.name, ''), EXCLUDED.name),
       phone = COALESCE(customers.phone, EXCLUDED.phone)`,
    [code, code, name, primaryGoogleSheetPhone(phone), dateOrNow(firstSeenDate)]
  );
  return code;
}

async function applyOperationalRow(client: pg.PoolClient, sheetName: string, row: Record<string, string>): Promise<boolean> {
  const sheet = normalizeGoogleSheetHeader(sheetName);

  if (sheet === 'data_team_sale') {
    const code = row.id_team;
    if (!code || !row.name_team) throw new Error('Thiếu id_team hoặc name_team.');
    await client.query(
      `INSERT INTO teams (id, code, name) VALUES ($1, $1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [code, row.name_team]
    );
    return true;
  }

  if (sheet === 'data_sale') {
    const code = row.id_sale;
    const teamId = await resolveTeamId(client, row.id_team);
    if (!code || !row.full_name || !teamId) throw new Error('Sale thiếu mã/tên hoặc team chưa được đồng bộ.');
    const id = `SALE-${code}`;
    const normalizedStatus = normalizeGoogleSheetHeader(row.status);
    const inactiveStatuses = new Set(['inactive', 'dung_hoat_dong', 'nghi', 'ngung_hoat_dong', 'da_nghi', 'false', '0', 'no']);
    await client.query(
      `INSERT INTO app_users (id, email, name, role, is_active, login_enabled)
       VALUES ($1, $2, $3, 'SALE', $4, false)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active, login_enabled = false`,
      [id, makePendingEmail('sale', code), row.full_name, !inactiveStatuses.has(normalizedStatus)]
    );
    await client.query(
      `INSERT INTO sales_profiles (id, sale_code, team_id, phone) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sale_code) DO UPDATE SET team_id = EXCLUDED.team_id, phone = EXCLUDED.phone`,
      [id, code, teamId, row.phone || null]
    );
    return true;
  }

  if (sheet === 'trang_tinh1') {
    const name = row.ten_auditor;
    if (!name) throw new Error('Thiếu Tên Auditor.');
    const code = `AUD-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toUpperCase()}`;
    const id = `AUDITOR-${code}`;
    await client.query(
      `INSERT INTO app_users (id, email, name, role, is_active, login_enabled)
       VALUES ($1, $2, $3, 'AUDITOR', true, true)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, login_enabled = true`,
      [id, makePendingEmail('auditor', code), name]
    );
    await client.query(
      `INSERT INTO auditor_profiles (id, auditor_code) VALUES ($1, $2)
       ON CONFLICT (auditor_code) DO NOTHING`,
      [id, code]
    );
    return true;
  }

  if (sheet === 'data_customers' || sheet === 'tonghopkhachhang') {
    const sourceCode = row.ma_khach_hang || row.so_dien_thoai;
    const code = boundedKey(sourceCode);
    if (!sourceCode || !code || !row.ten_kh) return false;
    const saleId = await resolveSaleId(client, row.nguoi_phu_trach);
    const teamId = await resolveTeamId(client, row.team);
    await client.query(
      `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
       VALUES ($1, $1, $2, $3, NULL, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name, phone = EXCLUDED.phone, channel = EXCLUDED.channel,
         current_sale_id = EXCLUDED.current_sale_id, current_team_id = EXCLUDED.current_team_id`,
      [code, row.ten_kh, primaryGoogleSheetPhone(row.so_dien_thoai), boundedText(row.nguon_khach_hang, 100) || null, dateOrNow(row.thoi_gian), saleId, teamId]
    );
    return true;
  }

  if (sheet === 'misa_bao_gia_ggs') {
    const code = row.so_bao_gia;
    const customerKey = row.ma_khach_hang_unique || row.sdt;
    const customerId = await resolveOrCreateHistoricalCustomerId(client, customerKey, row.khach_hang, row.sdt, row.ngay_bao_gia);
    const saleId = await resolveOrCreateHistoricalSaleId(client, row.nhan_vien);
    if (!code || !customerId || !saleId) return false;
    await client.query(
      `INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status)
       VALUES ($1, $1, $2, $3, $4, $5, 'PENDING')
       ON CONFLICT (code) DO UPDATE SET customer_id = EXCLUDED.customer_id, sale_id = EXCLUDED.sale_id,
         quote_date = EXCLUDED.quote_date, total_amount = EXCLUDED.total_amount`,
      [code, customerId, saleId, dateOrNow(row.ngay_bao_gia), googleSheetAmount(row.tong_tien)]
    );
    return true;
  }

  if (sheet === 'misa_don_hang_ggs') {
    const code = row.so_chung_tu;
    const customerKey = row.ma_khach_hang_unique || row.sdt;
    const customerId = await resolveOrCreateHistoricalCustomerId(client, customerKey, row.ten_khach_hang, row.sdt, row.ngay_chung_tu);
    const saleId = await resolveOrCreateHistoricalSaleId(client, row.ten_nhan_vien);
    if (!code || !customerId || !saleId) return false;
    await client.query(
      `INSERT INTO sales_orders (id, code, customer_id, sale_id, order_date, total_amount, status)
       VALUES ($1, $1, $2, $3, $4, $5, 'VALID')
       ON CONFLICT (code) DO UPDATE SET customer_id = EXCLUDED.customer_id, sale_id = EXCLUDED.sale_id,
         order_date = EXCLUDED.order_date, total_amount = EXCLUDED.total_amount`,
      [code, customerId, saleId, dateOrNow(row.ngay_chung_tu), googleSheetAmount(row.tong_thanh_toan)]
    );
    return true;
  }

  // Chấm lỗi được lưu nguyên trạng ở ledger. Chỉ dim_issue được phép cập nhật catalog.
  if (sheet === 'dim_issue') {
    const code = row.issue_code;
    if (!code || !row.issue_name) throw new Error('Danh mục lỗi thiếu issue_code hoặc issue_name.');
    const severity = ['LOW', 'MEDIUM', 'HIGH'].includes(row.severity.toUpperCase()) ? row.severity.toUpperCase() : 'MEDIUM';
    await client.query(
      `INSERT INTO issue_definitions (id, issue_code, issue_name, issue_group_code, issue_group_name, severity,
          hard_fail, is_definition_complete, is_current, version)
       VALUES ($1, $1, $2, $3, $4, $5, $6, false, true, 'sheet-sync')
       ON CONFLICT (issue_code) DO UPDATE SET issue_name = EXCLUDED.issue_name, severity = EXCLUDED.severity,
          issue_group_code = EXCLUDED.issue_group_code, issue_group_name = EXCLUDED.issue_group_name`,
      [code, row.issue_name, row.group || 'UNGROUPED', row.group || 'Ungrouped', severity, ['true', '1', 'yes'].includes(row.hard_fail.toLowerCase())]
    );
    return true;
  }

  return false;
}

type PendingGoogleSheetRow = {
  row: Record<string, string>;
  rowKey: string;
  hash: string;
};

/**
 * The customer tab is large enough that one network round-trip per row will
 * exceed a serverless request timeout. Resolve its small reference catalogs
 * once, then upsert the whole incoming chunk in one statement.
 */
async function applyCustomerRows(
  client: pg.PoolClient,
  rows: PendingGoogleSheetRow[]
): Promise<boolean[]> {
  const validRows = rows.filter(({ row }) => {
    const sourceCode = row.ma_khach_hang || row.so_dien_thoai;
    return Boolean(sourceCode && boundedKey(sourceCode) && row.ten_kh);
  });
  if (validRows.length === 0) return rows.map(() => false);

  const [sales, teams] = await Promise.all([
    client.query(`SELECT sp.id, sp.sale_code, u.name FROM sales_profiles sp JOIN app_users u ON u.id = sp.id`),
    client.query(`SELECT id, code, name FROM teams`),
  ]);
  const saleIds = new Map<string, string>();
  sales.rows.forEach((sale) => {
    saleIds.set(text(sale.sale_code).toLowerCase(), sale.id);
    saleIds.set(text(sale.name).toLowerCase(), sale.id);
  });
  const teamIds = new Map<string, string>();
  teams.rows.forEach((team) => {
    teamIds.set(text(team.code).toLowerCase(), team.id);
    teamIds.set(text(team.name).toLowerCase(), team.id);
  });

  // The source can have multiple historical rows for one customer code. An
  // INSERT ... ON CONFLICT statement may update each target at most once, so
  // retain the latest row from this delivery for every customer identity.
  const rowsByCustomerCode = new Map<string, PendingGoogleSheetRow>();
  for (const pendingRow of validRows) {
    const code = boundedKey(pendingRow.row.ma_khach_hang || pendingRow.row.so_dien_thoai);
    rowsByCustomerCode.set(code, pendingRow);
  }

  const parameters: unknown[] = [];
  const valueGroups = [...rowsByCustomerCode.entries()].map(([code, { row }], index) => {
    const base = index * 7;
    parameters.push(
      code,
      row.ten_kh,
      primaryGoogleSheetPhone(row.so_dien_thoai),
      boundedText(row.nguon_khach_hang, 100) || null,
      dateOrNow(row.thoi_gian),
      saleIds.get(text(row.nguoi_phu_trach).toLowerCase()) || null,
      teamIds.get(text(row.team).toLowerCase()) || null
    );
    return `($${base + 1}, $${base + 1}, $${base + 2}, $${base + 3}, NULL, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });

  await client.query(
    `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
     VALUES ${valueGroups.join(', ')}
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone, channel = EXCLUDED.channel,
       current_sale_id = EXCLUDED.current_sale_id, current_team_id = EXCLUDED.current_team_id`,
    parameters
  );

  const validSet = new Set(validRows);
  return rows.map((pendingRow) => validSet.has(pendingRow));
}

async function applyOperationalRows(
  client: pg.PoolClient,
  sheetName: string,
  rows: PendingGoogleSheetRow[]
): Promise<boolean[]> {
  // Retried batches can contain only rows that are already recorded in the
  // row-state table. Do not generate an empty INSERT ... VALUES ON CONFLICT.
  if (rows.length === 0) return [];

  const normalizedSheetName = normalizeGoogleSheetHeader(sheetName);
  if (normalizedSheetName === 'data_customers' || normalizedSheetName === 'tonghopkhachhang') {
    return applyCustomerRows(client, rows);
  }
  const handled: boolean[] = [];
  for (const { row } of rows) handled.push(await applyOperationalRow(client, sheetName, row));
  return handled;
}

async function upsertGoogleSheetRowState(
  client: pg.PoolClient,
  sourceId: string,
  sheetName: string,
  rows: PendingGoogleSheetRow[]
): Promise<void> {
  if (rows.length === 0) return;
  // A source sheet may repeat its business key. The state table uses that key
  // as its primary identity too, so write only the final row for each key.
  const latestRowsByKey = new Map<string, PendingGoogleSheetRow>();
  for (const pendingRow of rows) latestRowsByKey.set(pendingRow.rowKey, pendingRow);
  const uniqueRows = [...latestRowsByKey.values()];
  const parameters: unknown[] = [];
  const values = uniqueRows.map(({ rowKey, hash, row }, index) => {
    const base = index * 5;
    parameters.push(sourceId, sheetName, rowKey, hash, JSON.stringify(row));
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  await client.query(
    `INSERT INTO google_sheet_row_state (source_id, sheet_name, source_row_key, content_hash, payload)
     VALUES ${values.join(', ')}
     ON CONFLICT (source_id, sheet_name, source_row_key) DO UPDATE SET
       content_hash = EXCLUDED.content_hash, payload = EXCLUDED.payload, last_synced_at = NOW()`,
    parameters
  );
}

export async function syncGoogleSheetWebhook(
  client: pg.PoolClient,
  payload: GoogleSheetWebhookPayload
): Promise<GoogleSheetSyncResult> {
  if (!payload.sourceId || !payload.sheetName || !payload.deliveryId) throw new Error('Thiếu sourceId, sheetName hoặc deliveryId.');
  if (!Array.isArray(payload.headers) || payload.headers.length === 0) throw new Error('Thiếu headers.');
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) throw new Error('Không có dòng dữ liệu để đồng bộ.');
  if (payload.rows.length > MAX_ROWS_PER_DELIVERY) throw new Error(`Mỗi lần gửi tối đa ${MAX_ROWS_PER_DELIVERY} dòng.`);

  const runId = `GSS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const headers = payload.headers.map(text);

  await client.query('BEGIN');
  try {
    const inserted = await client.query(
      `INSERT INTO google_sheet_sync_runs (id, source_id, sheet_name, delivery_id, status, total_rows, metadata)
       VALUES ($1, $2, $3, $4, 'RECEIVED', $5, $6)
       ON CONFLICT (source_id, delivery_id) DO NOTHING
       RETURNING id`,
      [runId, payload.sourceId, payload.sheetName, payload.deliveryId, payload.rows.length, JSON.stringify({ spreadsheetId: payload.spreadsheetId, rowStart: payload.rowStart })]
    );
    if (inserted.rowCount === 0) {
      await client.query('COMMIT');
      return { duplicate: true, totalRows: payload.rows.length, appliedRows: 0, skippedRows: payload.rows.length, runId };
    }

    const normalizedRows: PendingGoogleSheetRow[] = [];
    for (let index = 0; index < payload.rows.length; index++) {
      const row = toGoogleSheetRow(headers, payload.rows[index]);
      const rowKey = googleSheetSourceRowKey(payload.sheetName, row, (payload.rowStart ?? 2) + index);
      if (!rowKey) throw new Error(`Không xác định được khóa dòng ở dòng ${(payload.rowStart ?? 2) + index}.`);
      normalizedRows.push({ row, rowKey, hash: stableGoogleSheetHash(row) });
    }

    const existing = await client.query(
      `SELECT source_row_key, content_hash FROM google_sheet_row_state
       WHERE source_id = $1 AND sheet_name = $2 AND source_row_key = ANY($3::varchar[])`,
      [payload.sourceId, payload.sheetName, normalizedRows.map((row) => row.rowKey)]
    );
    const existingHashes = new Map(existing.rows.map((row) => [row.source_row_key, row.content_hash]));
    const changedRows = normalizedRows.filter((row) => existingHashes.get(row.rowKey) !== row.hash);
    const handledRows = await applyOperationalRows(client, payload.sheetName, changedRows);
    await upsertGoogleSheetRowState(client, payload.sourceId, payload.sheetName, changedRows);
    const appliedRows = handledRows.filter(Boolean).length;
    const skippedRows = payload.rows.length - appliedRows;

    await client.query(
      `UPDATE google_sheet_sync_runs SET status = 'COMPLETED', completed_at = NOW(), applied_rows = $1, skipped_rows = $2 WHERE id = $3`,
      [appliedRows, skippedRows, runId]
    );
    await client.query('COMMIT');
    return { duplicate: false, totalRows: payload.rows.length, appliedRows, skippedRows, runId };
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Unknown Google Sheets sync error';
    // The business data rolls back as one unit, but the failed delivery remains
    // visible to Head Auditor for retry and troubleshooting.
    await client.query(
      `INSERT INTO google_sheet_sync_runs (id, source_id, sheet_name, delivery_id, status, total_rows, error_message, metadata)
       VALUES ($1, $2, $3, $4, 'FAILED', $5, $6, $7)
       ON CONFLICT (source_id, delivery_id) DO NOTHING`,
      [runId, payload.sourceId, payload.sheetName, payload.deliveryId, payload.rows.length, message, JSON.stringify({ spreadsheetId: payload.spreadsheetId, rowStart: payload.rowStart })]
    );
    throw error;
  }
}

