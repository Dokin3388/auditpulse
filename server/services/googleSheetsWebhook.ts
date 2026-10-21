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
  if (sheet === 'data_customers') return pick('ma_khach_hang', 'so_dien_thoai');
  if (sheet === 'misa_bao_gia_ggs') return pick('so_bao_gia');
  if (sheet === 'misa_don_hang_ggs') return pick('so_chung_tu');
  if (sheet === 'dim_issue') return pick('issue_code');
  if (sheet === 'fact_issue_log') {
    return [pick('date'), pick('sale'), pick('sdt'), pick('issue_code'), pick('legacy_code')].join('|');
  }
  return `${sheet}:${fallbackIndex}`;
}

function dateOrNow(value: string): string {
  const parsed = Date.parse(value);
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
  if (!/[\n,;]/.test(normalized)) return normalized;
  return normalized.split(/[\n,;]+/).map(text).find(Boolean) ?? null;
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
  const result = await client.query('SELECT id FROM customers WHERE code = $1 LIMIT 1', [value]);
  return result.rows[0]?.id ?? null;
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
    await client.query(
      `INSERT INTO app_users (id, email, name, role, is_active)
       VALUES ($1, $2, $3, 'SALE', $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active`,
      [id, makePendingEmail('sale', code), row.full_name, row.status.toLowerCase() !== 'inactive']
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
      `INSERT INTO app_users (id, email, name, role, is_active)
       VALUES ($1, $2, $3, 'AUDITOR', true)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [id, makePendingEmail('auditor', code), name]
    );
    await client.query(
      `INSERT INTO auditor_profiles (id, auditor_code) VALUES ($1, $2)
       ON CONFLICT (auditor_code) DO NOTHING`,
      [id, code]
    );
    return true;
  }

  if (sheet === 'data_customers') {
    const code = row.ma_khach_hang || row.so_dien_thoai;
    if (!code || !row.ten_kh) throw new Error('Khách hàng thiếu Mã khách hàng/Số điện thoại hoặc Tên KH.');
    const saleId = await resolveSaleId(client, row.nguoi_phu_trach);
    const teamId = await resolveTeamId(client, row.team);
    await client.query(
      `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
       VALUES ($1, $1, $2, $3, NULL, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name, phone = EXCLUDED.phone, channel = EXCLUDED.channel,
         current_sale_id = EXCLUDED.current_sale_id, current_team_id = EXCLUDED.current_team_id`,
      [code, row.ten_kh, primaryGoogleSheetPhone(row.so_dien_thoai), row.nguon_khach_hang || null, dateOrNow(row.thoi_gian), saleId, teamId]
    );
    return true;
  }

  if (sheet === 'misa_bao_gia_ggs') {
    const code = row.so_bao_gia;
    const customerId = await resolveCustomerId(client, row.ma_khach_hang_unique);
    const saleId = await resolveSaleId(client, row.nhan_vien);
    if (!code || !customerId || !saleId) throw new Error('Báo giá chưa nối được khách hàng hoặc sale.');
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
    const customerId = await resolveCustomerId(client, row.ma_khach_hang_unique);
    const saleId = await resolveSaleId(client, row.ten_nhan_vien);
    if (!code || !customerId || !saleId) throw new Error('Đơn hàng chưa nối được khách hàng hoặc sale.');
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
): Promise<void> {
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
  for (const pendingRow of rows) {
    const code = pendingRow.row.ma_khach_hang || pendingRow.row.so_dien_thoai;
    if (!code || !pendingRow.row.ten_kh) throw new Error('Khách hàng thiếu Mã khách hàng/Số điện thoại hoặc Tên KH.');
    rowsByCustomerCode.set(code, pendingRow);
  }

  const parameters: unknown[] = [];
  const valueGroups = [...rowsByCustomerCode.values()].map(({ row }, index) => {
    const code = row.ma_khach_hang || row.so_dien_thoai;
    const base = index * 7;
    parameters.push(
      code,
      row.ten_kh,
      primaryGoogleSheetPhone(row.so_dien_thoai),
      row.nguon_khach_hang || null,
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
}

async function applyOperationalRows(
  client: pg.PoolClient,
  sheetName: string,
  rows: PendingGoogleSheetRow[]
): Promise<boolean[]> {
  // Retried batches can contain only rows that are already recorded in the
  // row-state table. Do not generate an empty INSERT ... VALUES ON CONFLICT.
  if (rows.length === 0) return [];

  if (normalizeGoogleSheetHeader(sheetName) === 'data_customers') {
    await applyCustomerRows(client, rows);
    return rows.map(() => true);
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
  const parameters: unknown[] = [];
  const values = rows.map(({ rowKey, hash, row }, index) => {
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
