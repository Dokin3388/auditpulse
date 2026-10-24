import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  bindIdentifiers,
  chooseCustomer,
  ensureCustomerIdentitySchema,
  hasIdentity,
  identitySignals,
  markUnmatchedResolved,
  reconcileUnmatchedTransactions,
  recordUnmatchedTransaction,
  resolveCustomerBySignals,
  type IdentitySignals,
  type TransactionKind,
} from './customerIdentity.ts';

export interface GoogleSheetWebhookPayload {
  sourceId: string;
  sheetName: string;
  deliveryId: string;
  headers: string[];
  rows: unknown[][];
  rowStart?: number;
  spreadsheetId?: string;
}

/** Per-delivery data-quality counters, stored in google_sheet_sync_runs.metadata.identity. */
export interface IdentityStats {
  customersCreated: number;
  customersMatched: number;
  customerRowsRejected: number;
  identifiersBound: number;
  identityConflicts: number;
  unmatchedQuotations: number;
  unmatchedOrders: number;
  noIdentifier: number;
  reconciled: number;
  invalidDates: number;
  ownerUnresolved: number;
}

export function newIdentityStats(): IdentityStats {
  return {
    customersCreated: 0, customersMatched: 0, customerRowsRejected: 0, identifiersBound: 0, identityConflicts: 0,
    unmatchedQuotations: 0, unmatchedOrders: 0, noIdentifier: 0, reconciled: 0, invalidDates: 0, ownerUnresolved: 0,
  };
}

export interface GoogleSheetSyncResult {
  duplicate: boolean;
  totalRows: number;
  appliedRows: number;
  skippedRows: number;
  runId: string;
  identity?: IdentityStats;
}

const MAX_ROWS_PER_DELIVERY = 500;

export function text(value: unknown): string {
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
export function boundedKey(value: unknown, maxLength = 50): string {
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

/** Parse a sheet date (DD/MM/YYYY first, then ISO-like). Null when unreadable. */
export function parseSheetDate(value: string): string | null {
  const raw = text(value);
  if (!raw) return null;
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
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Unreadable dates fall back to "now" (columns are NOT NULL) but are counted. */
function dateOrNow(value: string, stats?: IdentityStats): string {
  const parsed = parseSheetDate(value);
  if (parsed) return parsed;
  if (stats) stats.invalidDates++;
  return new Date().toISOString();
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

/** Accent/case-insensitive key so "Nguyễn  Văn A" and "nguyen van a" match. */
function nameKey(value: unknown): string {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve the customer of a quotation/order through normalized identifiers
 * (phone first, customer code second). Never invents a customer: a row that
 * cannot be resolved is parked in unmatched_transactions and retried when the
 * customer appears in the CRM sheet.
 */
async function resolveTransactionCustomer(
  client: pg.PoolClient,
  input: { kind: TransactionKind; sheetName: string; sourceCode: string; row: Record<string, string>; phoneCell: string; codeCell: string },
  stats: IdentityStats
): Promise<{ customerId: string; signals: IdentitySignals } | null> {
  const signals = identitySignals(input.phoneCell, input.codeCell);
  const resolved = await resolveCustomerBySignals(client, signals);
  if (!resolved.customerId) {
    await recordUnmatchedTransaction(client, {
      kind: input.kind, sheetName: normalizeGoogleSheetHeader(input.sheetName), sourceCode: input.sourceCode, signals, row: input.row,
    });
    if (input.kind === 'QUOTATION') stats.unmatchedQuotations++;
    else stats.unmatchedOrders++;
    if (!hasIdentity(signals)) stats.noIdentifier++;
    return null;
  }
  // Learn the phone <-> code link: a quotation is where a code is first issued.
  const bound = await bindIdentifiers(client, resolved.customerId, signals, input.kind);
  stats.identifiersBound += bound.bound;
  if (bound.conflicts > 0) stats.identityConflicts++;
  return { customerId: resolved.customerId, signals };
}

async function applyOperationalRow(
  client: pg.PoolClient,
  sheetName: string,
  row: Record<string, string>,
  stats: IdentityStats = newIdentityStats()
): Promise<boolean> {
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
    const [handled] = await applyCustomerRows(client, [{ row, rowKey: '', hash: '' }], stats);
    return handled;
  }

  if (sheet === 'misa_bao_gia_ggs') {
    const code = row.so_bao_gia;
    if (!code) return false;
    const match = await resolveTransactionCustomer(
      client, { kind: 'QUOTATION', sheetName, sourceCode: code, row, phoneCell: row.sdt, codeCell: row.ma_khach_hang_unique }, stats
    );
    if (!match) return false;
    const saleId = await resolveOrCreateHistoricalSaleId(client, row.nhan_vien);
    if (!saleId) return false;
    await client.query(
      `INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status)
       VALUES ($1, $1, $2, $3, $4, $5, 'PENDING')
       ON CONFLICT (code) DO UPDATE SET customer_id = EXCLUDED.customer_id, sale_id = EXCLUDED.sale_id,
         quote_date = EXCLUDED.quote_date, total_amount = EXCLUDED.total_amount`,
      [code, match.customerId, saleId, dateOrNow(row.ngay_bao_gia, stats), googleSheetAmount(row.tong_tien)]
    );
    await markUnmatchedResolved(client, 'QUOTATION', code, match.customerId);
    return true;
  }

  if (sheet === 'misa_don_hang_ggs') {
    const code = row.so_chung_tu;
    if (!code) return false;
    const match = await resolveTransactionCustomer(
      client, { kind: 'ORDER', sheetName, sourceCode: code, row, phoneCell: row.sdt, codeCell: row.ma_khach_hang_unique }, stats
    );
    if (!match) return false;
    const saleId = await resolveOrCreateHistoricalSaleId(client, row.ten_nhan_vien);
    if (!saleId) return false;
    await client.query(
      `INSERT INTO sales_orders (id, code, customer_id, sale_id, order_date, total_amount, status)
       VALUES ($1, $1, $2, $3, $4, $5, 'VALID')
       ON CONFLICT (code) DO UPDATE SET customer_id = EXCLUDED.customer_id, sale_id = EXCLUDED.sale_id,
         order_date = EXCLUDED.order_date, total_amount = EXCLUDED.total_amount`,
      [code, match.customerId, saleId, dateOrNow(row.ngay_chung_tu, stats), googleSheetAmount(row.tong_thanh_toan)]
    );
    await markUnmatchedResolved(client, 'ORDER', code, match.customerId);
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
 * exceed a serverless request timeout, so the whole delivery is resolved with a
 * handful of set-based statements.
 *
 * Identity: a CRM row is matched to an existing customer by normalized phone
 * (any of its phones) and then by customer code. Only when neither is known is
 * a new customer created, so a code that appears later (it is issued with the
 * first quotation) enriches the same customer instead of creating a second one.
 * The sale owner is kept when the cell names someone we cannot resolve.
 */
async function applyCustomerRows(
  client: pg.PoolClient,
  rows: PendingGoogleSheetRow[],
  stats: IdentityStats = newIdentityStats()
): Promise<boolean[]> {
  const prepared = rows.map(({ row }) => {
    const signals = identitySignals(row.so_dien_thoai, row.ma_khach_hang);
    return { row, signals, valid: Boolean(text(row.ten_kh) && hasIdentity(signals)) };
  });
  const validRows = prepared.filter((item) => item.valid);
  stats.customerRowsRejected += prepared.length - validRows.length;
  if (validRows.length === 0) return rows.map(() => false);

  const sales = await client.query(`SELECT sp.id, sp.sale_code, u.name FROM sales_profiles sp JOIN app_users u ON u.id = sp.id`);
  const teams = await client.query(`SELECT id, code, name FROM teams`);
  const hits = await client.query(
    `SELECT kind, value, customer_id FROM customer_identifiers
     WHERE (kind = 'PHONE' AND value = ANY($1::text[])) OR (kind = 'CODE' AND value = ANY($2::text[]))`,
    [
      [...new Set(validRows.flatMap((item) => item.signals.phones))],
      [...new Set(validRows.map((item) => item.signals.code).filter((code): code is string => Boolean(code)))],
    ]
  );
  const saleIds = new Map<string, string>();
  sales.rows.forEach((sale) => {
    saleIds.set(nameKey(sale.sale_code), sale.id);
    saleIds.set(nameKey(sale.name), sale.id);
  });
  const teamIds = new Map<string, string>();
  teams.rows.forEach((team) => {
    teamIds.set(nameKey(team.code), team.id);
    teamIds.set(nameKey(team.name), team.id);
  });
  const hitOwner = new Map<string, string>(hits.rows.map((hit) => [`${hit.kind}:${hit.value}`, hit.customer_id]));

  interface Entity {
    id: string;
    isNew: boolean;
    phones: string[];
    code: string | null;
    row: Record<string, string>;
  }
  const entities = new Map<string, Entity>();
  const newEntityByIdentifier = new Map<string, Entity>();

  for (const { row, signals } of validRows) {
    const rowHits = [
      ...signals.phones.flatMap((value) => (hitOwner.has(`PHONE:${value}`) ? [{ kind: 'PHONE' as const, value, customer_id: hitOwner.get(`PHONE:${value}`)! }] : [])),
      ...(signals.code && hitOwner.has(`CODE:${signals.code}`) ? [{ kind: 'CODE' as const, value: signals.code, customer_id: hitOwner.get(`CODE:${signals.code}`)! }] : []),
    ];
    const resolved = chooseCustomer(signals, rowHits);
    let entity: Entity | undefined;
    if (resolved.customerId) {
      entity = entities.get(resolved.customerId);
      if (!entity) {
        entity = { id: resolved.customerId, isNew: false, phones: [], code: null, row };
        entities.set(entity.id, entity);
      }
    } else {
      entity = [...signals.phones.map((value) => `PHONE:${value}`), ...(signals.code ? [`CODE:${signals.code}`] : [])]
        .map((key) => newEntityByIdentifier.get(key))
        .find(Boolean);
      if (!entity) {
        // Same id scheme as before (code, else phone) so existing links stay valid.
        const id = boundedKey(signals.code ? text(row.ma_khach_hang) : signals.phones[0]);
        entity = entities.get(id) ?? { id, isNew: true, phones: [], code: null, row };
        entities.set(id, entity);
      }
    }
    for (const phone of signals.phones) if (!entity.phones.includes(phone)) entity.phones.push(phone);
    if (signals.code && !entity.code) entity.code = signals.code;
    entity.row = row; // the latest row of this delivery wins
    if (entity.isNew) {
      entity.phones.forEach((phone) => newEntityByIdentifier.set(`PHONE:${phone}`, entity!));
      if (entity.code) newEntityByIdentifier.set(`CODE:${entity.code}`, entity);
    }
  }

  const existing = [...entities.values()].filter((entity) => !entity.isNew);
  const created = [...entities.values()].filter((entity) => entity.isNew);
  stats.customersMatched += existing.length;
  stats.customersCreated += created.length;

  const columns = (list: Entity[]) => {
    const ownerCells = list.map((entity) => text(entity.row.nguoi_phu_trach));
    const teamCells = list.map((entity) => text(entity.row.team));
    const saleResolved = ownerCells.map((cell) => saleIds.get(nameKey(cell)) ?? null);
    stats.ownerUnresolved += ownerCells.filter((cell, index) => cell && !saleResolved[index]).length;
    return {
      ids: list.map((entity) => entity.id),
      names: list.map((entity) => text(entity.row.ten_kh)),
      phones: list.map((entity) => entity.phones[0] ?? primaryGoogleSheetPhone(entity.row.so_dien_thoai)),
      channels: list.map((entity) => boundedText(entity.row.nguon_khach_hang, 100) || null),
      firstSeen: list.map((entity) => dateOrNow(entity.row.thoi_gian, stats)),
      saleIds: saleResolved,
      teamIds: teamCells.map((cell) => teamIds.get(nameKey(cell)) ?? null),
      ownerBlank: ownerCells.map((cell) => !cell),
      teamBlank: teamCells.map((cell) => !cell),
    };
  };

  if (existing.length > 0) {
    const c = columns(existing);
    await client.query(
      `UPDATE customers cu SET
         name = v.name, phone = COALESCE(v.phone, cu.phone), channel = v.channel,
         current_sale_id = CASE WHEN v.sale_id IS NOT NULL THEN v.sale_id WHEN v.owner_blank THEN NULL ELSE cu.current_sale_id END,
         current_team_id = CASE WHEN v.team_id IS NOT NULL THEN v.team_id WHEN v.team_blank THEN NULL ELSE cu.current_team_id END
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[], $8::boolean[])
         AS v(id, name, phone, channel, sale_id, team_id, owner_blank, team_blank)
       WHERE cu.id = v.id`,
      [c.ids, c.names, c.phones, c.channels, c.saleIds, c.teamIds, c.ownerBlank, c.teamBlank]
    );
  }
  if (created.length > 0) {
    const c = columns(created);
    await client.query(
      `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
       SELECT v.id, v.id, v.name, v.phone, NULL, v.channel, v.first_seen, v.sale_id, v.team_id
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::text[], $7::text[])
         AS v(id, name, phone, channel, first_seen, sale_id, team_id)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone), channel = EXCLUDED.channel,
         current_sale_id = COALESCE(EXCLUDED.current_sale_id, customers.current_sale_id),
         current_team_id = COALESCE(EXCLUDED.current_team_id, customers.current_team_id)`,
      [c.ids, c.names, c.phones, c.channels, c.firstSeen, c.saleIds, c.teamIds]
    );
  }

  const kinds: string[] = [];
  const values: string[] = [];
  const owners: string[] = [];
  for (const entity of entities.values()) {
    for (const phone of entity.phones) { kinds.push('PHONE'); values.push(phone); owners.push(entity.id); }
    if (entity.code) { kinds.push('CODE'); values.push(entity.code); owners.push(entity.id); }
  }
  if (values.length > 0) {
    const bound = await client.query(
      `WITH ins AS (
         INSERT INTO customer_identifiers (kind, value, customer_id, source)
         SELECT k, v, c, 'CRM' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, v, c)
         ON CONFLICT (kind, value) DO NOTHING RETURNING 1
       )
       SELECT (SELECT COUNT(*) FROM ins)::int AS bound,
              (SELECT COUNT(*) FROM customer_identifiers i
                 JOIN unnest($1::text[], $2::text[], $3::text[]) AS t(k, v, c) ON i.kind = t.k AND i.value = t.v
                WHERE i.customer_id <> t.c)::int AS conflicts`,
      [kinds, values, owners]
    );
    stats.identifiersBound += bound.rows[0].bound;
    stats.identityConflicts += bound.rows[0].conflicts;
  }

  const validSet = new Set(validRows.map((item) => item.row));
  return rows.map(({ row }) => validSet.has(row));
}

async function applyOperationalRows(
  client: pg.PoolClient,
  sheetName: string,
  rows: PendingGoogleSheetRow[],
  stats: IdentityStats
): Promise<boolean[]> {
  // Retried batches can contain only rows that are already recorded in the
  // row-state table. Do not generate an empty INSERT ... VALUES ON CONFLICT.
  if (rows.length === 0) return [];

  const normalizedSheetName = normalizeGoogleSheetHeader(sheetName);
  if (normalizedSheetName === 'data_customers' || normalizedSheetName === 'tonghopkhachhang') {
    const handled = await applyCustomerRows(client, rows, stats);
    // New customers may be the missing half of earlier unmatched quotations/orders.
    stats.reconciled += await reconcileUnmatchedTransactions(
      client,
      (unmatchedSheet, unmatchedRow) => applyOperationalRow(client, unmatchedSheet, unmatchedRow, stats)
    );
    return handled;
  }
  const handled: boolean[] = [];
  for (const { row } of rows) handled.push(await applyOperationalRow(client, sheetName, row, stats));
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
  const stats = newIdentityStats();

  // DDL/seeding must not run inside the delivery transaction (see ensure*).
  await ensureCustomerIdentitySchema(client);
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
    const handledRows = await applyOperationalRows(client, payload.sheetName, changedRows, stats);
    await upsertGoogleSheetRowState(client, payload.sourceId, payload.sheetName, changedRows);
    const appliedRows = handledRows.filter(Boolean).length;
    const skippedRows = payload.rows.length - appliedRows;

    await client.query(
      `UPDATE google_sheet_sync_runs SET status = 'COMPLETED', completed_at = NOW(), applied_rows = $1, skipped_rows = $2,
         metadata = metadata || jsonb_build_object('identity', $4::jsonb)
       WHERE id = $3`,
      [appliedRows, skippedRows, runId, JSON.stringify(stats)]
    );
    await client.query('COMMIT');
    return { duplicate: false, totalRows: payload.rows.length, appliedRows, skippedRows, runId, identity: stats };
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

