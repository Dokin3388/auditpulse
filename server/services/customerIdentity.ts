// AuditPulse - Customer identity resolution (phone-first).
//
// Why this exists: customers, quotations and orders arrive from three different
// Google Sheets. The CRM sheet identifies a customer by phone until the first
// quotation exists (the customer code is only issued by the quotation system),
// so the same person used to be stored under several keys. Every sheet is now
// resolved through one table of normalized identifiers instead:
//
//   PHONE  canonical 10/11-digit national number (0901234567)  -> primary key
//   CODE   customer code ("ma_khach_hang"), learned from quotations/orders
//
// One identifier belongs to exactly one customer (primary key). A transaction
// that cannot be resolved is parked in unmatched_transactions and retried when
// the customer shows up. Nothing here ever invents a placeholder customer.
import { createHash } from 'node:crypto';
import type pg from 'pg';

export type IdentityKind = 'PHONE' | 'CODE';
export type TransactionKind = 'QUOTATION' | 'ORDER';

export interface IdentitySignals {
  phones: string[];
  code: string | null;
}

export interface ResolvedCustomer {
  customerId: string | null;
  via: IdentityKind | null;
  /** True when the signals point at more than one existing customer. */
  conflict: boolean;
}

// ------------------------------------------------------------------ normalizers

const PLACEHOLDER_CODES = /^(?:-+|n\/?a|#n\/a|null|none|nan|0|khong|không)$/i;

/** Canonical national phone number: digits only, leading 0, 10 or 11 digits. */
export function normalizePhone(raw: unknown): string | null {
  let source = String(raw ?? '').trim();
  if (!source) return null;
  // Spreadsheet number cells can arrive in scientific notation (9.01234567E8).
  if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(source)) {
    const asNumber = Number(source);
    if (Number.isFinite(asNumber)) source = String(Math.round(asNumber));
  }
  const hasPlus = /^\+/.test(source);
  let digits = source.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0084')) digits = digits.slice(4);
  else if (digits.startsWith('84') && (hasPlus || digits.length === 11 || digits.length === 12)) digits = digits.slice(2);
  else if (digits.startsWith('0')) return /^0\d{9,10}$/.test(digits) ? digits : null;

  // International form or a number whose leading zero was lost (Sheets numbers).
  if (digits.length === 9 || digits.length === 10) digits = `0${digits}`;
  return /^0\d{9,10}$/.test(digits) ? digits : null;
}

/**
 * Every distinct valid phone found in a cell, in the order written (the first
 * one is the contact's primary number). Handles separators (newline , ; / |),
 * several numbers separated only by spaces, and stray text around a number.
 */
export function extractPhones(raw: unknown): string[] {
  const found: string[] = [];
  const push = (value: string | null) => {
    if (value && !found.includes(value)) found.push(value);
  };
  for (const piece of String(raw ?? '').split(/[\n\r;,/|]+/)) {
    const whole = normalizePhone(piece);
    if (whole) {
      push(whole);
      continue;
    }
    const tokens = piece.trim().split(/\s+/).filter((token) => /\d/.test(token));
    const before = found.length;
    let current = '';
    for (const token of tokens) {
      const startsNumber = token.startsWith('+') || /^(?:0|84)/.test(token.replace(/\D/g, ''));
      if (current && startsNumber && current.replace(/\D/g, '').length >= 9) {
        push(normalizePhone(current));
        current = token;
      } else {
        current += token;
      }
    }
    if (current) push(normalizePhone(current));
    if (found.length === before) tokens.forEach((token) => push(normalizePhone(token)));
  }
  return found;
}

/** Customer codes are compared case-insensitively with inner spaces collapsed. */
export function normalizeCustomerCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!code || PLACEHOLDER_CODES.test(code)) return null;
  return code.slice(0, 100);
}

export function identitySignals(phoneCell: unknown, codeCell: unknown): IdentitySignals {
  const phones = extractPhones(phoneCell);
  let code = normalizeCustomerCode(codeCell);
  // The CRM used the phone number as the code until a real code existed, so a
  // phone-looking code is a phone, not a customer code.
  if (code && /^[\d\s.+()-]+$/.test(code)) {
    const asPhone = normalizePhone(code);
    if (asPhone) {
      if (!phones.includes(asPhone)) phones.push(asPhone);
      code = null;
    }
  }
  return { phones, code };
}

export function hasIdentity(signals: IdentitySignals): boolean {
  return signals.phones.length > 0 || signals.code !== null;
}

function signalPairs(signals: IdentitySignals): { kinds: IdentityKind[]; values: string[] } {
  const kinds: IdentityKind[] = [];
  const values: string[] = [];
  for (const phone of signals.phones) {
    kinds.push('PHONE');
    values.push(phone);
  }
  if (signals.code) {
    kinds.push('CODE');
    values.push(signals.code);
  }
  return { kinds, values };
}

// ------------------------------------------------------------------ schema

export const CUSTOMER_IDENTITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customer_identifiers (
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('PHONE', 'CODE')),
  value VARCHAR(100) NOT NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL DEFAULT 'SYNC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, value)
);
CREATE INDEX IF NOT EXISTS idx_customer_identifiers_customer ON customer_identifiers (customer_id);
CREATE TABLE IF NOT EXISTS unmatched_transactions (
  id VARCHAR(80) PRIMARY KEY,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('QUOTATION', 'ORDER')),
  source_code VARCHAR(100) NOT NULL,
  sheet_name VARCHAR(150) NOT NULL,
  reason VARCHAR(30) NOT NULL CHECK (reason IN ('NO_IDENTIFIER', 'NO_MATCH')),
  phones TEXT[] NOT NULL DEFAULT '{}',
  customer_code VARCHAR(100),
  payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_customer_id VARCHAR(50),
  CONSTRAINT unique_unmatched_transaction UNIQUE (kind, source_code)
);
CREATE INDEX IF NOT EXISTS idx_unmatched_transactions_open
  ON unmatched_transactions (kind, last_seen_at DESC) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS customer_merge_log (
  id VARCHAR(80) PRIMARY KEY,
  winner_id VARCHAR(50) NOT NULL,
  loser_id VARCHAR(50) NOT NULL,
  loser_snapshot JSONB NOT NULL,
  moved JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by VARCHAR(100),
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_merge_log_winner ON customer_merge_log (winner_id);
`;

let schemaReady: Promise<void> | null = null;

/**
 * Production databases are migrated by hand, so the first call in a process
 * makes sure the identity tables exist and (once) seeds them from the customers
 * already stored. Both steps are idempotent and serialized by an advisory lock.
 * Must be called outside any open transaction.
 */
export function ensureCustomerIdentitySchema(client: pg.PoolClient): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      // Transaction-scoped lock: safe behind a transaction-mode connection pooler.
      await client.query('BEGIN');
      try {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('auditpulse:customer-identity-schema'))`);
        await client.query(CUSTOMER_IDENTITY_SCHEMA_SQL);
        const seeded = await client.query(`SELECT EXISTS (SELECT 1 FROM customer_identifiers) AS seeded`);
        if (!seeded.rows[0].seeded) await seedIdentifiersFromCustomers(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Test hook: forget that the schema was verified in this process. */
export function resetCustomerIdentitySchemaCache(): void {
  schemaReady = null;
}

/** Customers created by older code were keyed by raw phone/code; index them. */
export async function seedIdentifiersFromCustomers(client: pg.PoolClient): Promise<number> {
  const customers = await client.query(
    `SELECT id, code, phone FROM customers
     ORDER BY (channel = 'HISTORICAL_TRANSACTION') NULLS FIRST, (current_sale_id IS NULL), created_at, id`
  );
  const kinds: IdentityKind[] = [];
  const values: string[] = [];
  const owners: string[] = [];
  for (const row of customers.rows) {
    const signals = identitySignals(row.phone, row.code);
    const pairs = signalPairs(signals);
    pairs.kinds.forEach((kind, index) => {
      kinds.push(kind);
      values.push(pairs.values[index]);
      owners.push(row.id);
    });
  }
  let inserted = 0;
  const CHUNK = 2000;
  for (let start = 0; start < values.length; start += CHUNK) {
    const result = await client.query(
      `INSERT INTO customer_identifiers (kind, value, customer_id, source)
       SELECT k, v, c, 'SEED' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, v, c)
       ON CONFLICT (kind, value) DO NOTHING`,
      [kinds.slice(start, start + CHUNK), values.slice(start, start + CHUNK), owners.slice(start, start + CHUNK)]
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

// ------------------------------------------------------------------ resolution

/** Phone wins over code (the customer code does not exist before a quotation). */
export function chooseCustomer(
  signals: IdentitySignals,
  hits: Array<{ kind: IdentityKind; value: string; customer_id: string }>
): ResolvedCustomer {
  const phoneOwner = new Map<string, string>();
  let codeOwner: string | null = null;
  for (const hit of hits) {
    if (hit.kind === 'PHONE') phoneOwner.set(hit.value, hit.customer_id);
    else codeOwner = hit.customer_id;
  }
  const phoneCustomers = signals.phones.map((phone) => phoneOwner.get(phone)).filter((id): id is string => Boolean(id));
  if (phoneCustomers.length > 0) {
    const chosen = phoneCustomers[0];
    const conflict = phoneCustomers.some((id) => id !== chosen) || (codeOwner !== null && codeOwner !== chosen);
    return { customerId: chosen, via: 'PHONE', conflict };
  }
  if (codeOwner) return { customerId: codeOwner, via: 'CODE', conflict: false };
  return { customerId: null, via: null, conflict: false };
}

export async function resolveCustomerBySignals(client: pg.PoolClient, signals: IdentitySignals): Promise<ResolvedCustomer> {
  if (!hasIdentity(signals)) return { customerId: null, via: null, conflict: false };
  const result = await client.query(
    `SELECT kind, value, customer_id FROM customer_identifiers
     WHERE (kind = 'PHONE' AND value = ANY($1::text[])) OR (kind = 'CODE' AND value = $2)`,
    [signals.phones, signals.code ?? '']
  );
  return chooseCustomer(signals, result.rows);
}

/** Bind identifiers to a customer. Existing bindings are never stolen. */
export async function bindIdentifiers(
  client: pg.PoolClient,
  customerId: string,
  signals: IdentitySignals,
  source: string
): Promise<{ bound: number; conflicts: number }> {
  const { kinds, values } = signalPairs(signals);
  if (values.length === 0) return { bound: 0, conflicts: 0 };
  const result = await client.query(
    `WITH ins AS (
       INSERT INTO customer_identifiers (kind, value, customer_id, source)
       SELECT k, v, $1, $4 FROM unnest($2::text[], $3::text[]) AS t(k, v)
       ON CONFLICT (kind, value) DO NOTHING RETURNING 1
     )
     SELECT (SELECT COUNT(*) FROM ins)::int AS bound,
            (SELECT COUNT(*) FROM customer_identifiers i
               JOIN unnest($2::text[], $3::text[]) AS t(k, v) ON i.kind = t.k AND i.value = t.v
              WHERE i.customer_id <> $1)::int AS conflicts`,
    [customerId, kinds, values, source]
  );
  return { bound: result.rows[0].bound, conflicts: result.rows[0].conflicts };
}

/** Bind many (kind, value, customer) triples at once; existing bindings win. */
export async function bindIdentifierBatch(
  client: pg.PoolClient,
  entries: Array<{ kind: IdentityKind; value: string; customerId: string }>,
  source: string
): Promise<{ bound: number; conflicts: number }> {
  let bound = 0;
  let conflicts = 0;
  const CHUNK = 2000;
  for (let start = 0; start < entries.length; start += CHUNK) {
    const part = entries.slice(start, start + CHUNK);
    const args = [part.map((e) => e.kind), part.map((e) => e.value), part.map((e) => e.customerId), source];
    const result = await client.query(
      `WITH ins AS (
         INSERT INTO customer_identifiers (kind, value, customer_id, source)
         SELECT k, v, c, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, v, c)
         ON CONFLICT (kind, value) DO NOTHING RETURNING 1
       )
       SELECT (SELECT COUNT(*) FROM ins)::int AS bound,
              (SELECT COUNT(*) FROM customer_identifiers i
                 JOIN unnest($1::text[], $2::text[], $3::text[]) AS t(k, v, c) ON i.kind = t.k AND i.value = t.v
                WHERE i.customer_id <> t.c)::int AS conflicts`,
      args
    );
    bound += result.rows[0].bound;
    conflicts += result.rows[0].conflicts;
  }
  return { bound, conflicts };
}

// ------------------------------------------------------------------ unmatched ledger

function unmatchedId(kind: TransactionKind, sourceCode: string): string {
  return `UNM-${kind === 'QUOTATION' ? 'Q' : 'O'}-${createHash('sha256').update(sourceCode).digest('hex').slice(0, 32)}`;
}

export async function recordUnmatchedTransaction(
  client: pg.PoolClient,
  input: {
    kind: TransactionKind;
    sheetName: string;
    sourceCode: string;
    signals: IdentitySignals;
    row: Record<string, string>;
  }
): Promise<void> {
  const reason = hasIdentity(input.signals) ? 'NO_MATCH' : 'NO_IDENTIFIER';
  await client.query(
    `INSERT INTO unmatched_transactions (id, kind, source_code, sheet_name, reason, phones, customer_code, payload)
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8::jsonb)
     ON CONFLICT (kind, source_code) DO UPDATE SET
       reason = EXCLUDED.reason, phones = EXCLUDED.phones, customer_code = EXCLUDED.customer_code,
       payload = EXCLUDED.payload, sheet_name = EXCLUDED.sheet_name, last_seen_at = NOW(),
       resolved_at = NULL, resolved_customer_id = NULL`,
    [
      unmatchedId(input.kind, input.sourceCode), input.kind, input.sourceCode.slice(0, 100), input.sheetName, reason,
      input.signals.phones, input.signals.code, JSON.stringify(input.row),
    ]
  );
}

export async function markUnmatchedResolved(
  client: pg.PoolClient,
  kind: TransactionKind,
  sourceCode: string,
  customerId: string
): Promise<void> {
  await client.query(
    `UPDATE unmatched_transactions SET resolved_at = NOW(), resolved_customer_id = $3
     WHERE kind = $1 AND source_code = $2 AND resolved_at IS NULL`,
    [kind, sourceCode.slice(0, 100), customerId]
  );
}

/**
 * Re-apply parked transactions whose customer is now resolvable. `apply`
 * receives the original sheet row and returns true when it was stored.
 */
export async function reconcileUnmatchedTransactions(
  client: pg.PoolClient,
  apply: (sheetName: string, row: Record<string, string>) => Promise<boolean>,
  limit = 500
): Promise<number> {
  const candidates = await client.query(
    `SELECT u.sheet_name, u.payload FROM unmatched_transactions u
     WHERE u.resolved_at IS NULL
       AND EXISTS (
         SELECT 1 FROM customer_identifiers i
         WHERE (i.kind = 'PHONE' AND i.value = ANY(u.phones)) OR (i.kind = 'CODE' AND i.value = u.customer_code)
       )
     ORDER BY u.last_seen_at LIMIT $1`,
    [limit]
  );
  let applied = 0;
  for (const candidate of candidates.rows) {
    if (await apply(candidate.sheet_name, candidate.payload as Record<string, string>)) applied++;
  }
  return applied;
}

// ------------------------------------------------------------------ quality report

export interface CustomerIdentityReport {
  generatedAt: string;
  customers: { total: number; placeholder: number; withoutIdentifier: number; withoutPhone: number; suspectCreatedDate: number };
  identifiers: { phone: number; code: number };
  duplicates: { phoneGroups: number; customersInvolved: number };
  transactions: {
    quotations: { total: number; onPlaceholder: number };
    orders: { total: number; onPlaceholder: number };
  };
  unmatched: { quotations: number; orders: number; noIdentifier: number; sample: Array<Record<string, unknown>> };
  lastSyncs: Array<Record<string, unknown>>;
}

export async function customerIdentityReport(client: pg.PoolClient): Promise<CustomerIdentityReport> {
  await ensureCustomerIdentitySchema(client);
  // One client runs one query at a time.
  const customers = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE channel = 'HISTORICAL_TRANSACTION')::int AS placeholder,
            COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM customer_identifiers i WHERE i.customer_id = c.id))::int AS without_identifier,
            COUNT(*) FILTER (WHERE phone IS NULL OR phone = '')::int AS without_phone,
            COUNT(*) FILTER (WHERE channel IS DISTINCT FROM 'HISTORICAL_TRANSACTION'
                               AND ABS(EXTRACT(EPOCH FROM created_at - first_seen_date)) < 60)::int AS suspect_dates
     FROM customers c`
  );
  const identifiers = await client.query(`SELECT kind, COUNT(*)::int AS n FROM customer_identifiers GROUP BY kind`);
  const duplicates = await client.query(
    `WITH n AS (
       SELECT id, RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 9) AS p9 FROM customers
     ), g AS (SELECT p9, COUNT(*) AS n FROM n WHERE LENGTH(p9) = 9 GROUP BY p9 HAVING COUNT(*) > 1)
     SELECT COUNT(*)::int AS groups, COALESCE(SUM(n), 0)::int AS customers FROM g`
  );
  const quotes = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE c.channel = 'HISTORICAL_TRANSACTION')::int AS on_placeholder
     FROM quotations q JOIN customers c ON c.id = q.customer_id`
  );
  const orders = await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE c.channel = 'HISTORICAL_TRANSACTION')::int AS on_placeholder
     FROM sales_orders o JOIN customers c ON c.id = o.customer_id`
  );
  const unmatched = await client.query(
    `SELECT COUNT(*) FILTER (WHERE kind = 'QUOTATION')::int AS quotations,
            COUNT(*) FILTER (WHERE kind = 'ORDER')::int AS orders,
            COUNT(*) FILTER (WHERE reason = 'NO_IDENTIFIER')::int AS no_identifier
     FROM unmatched_transactions WHERE resolved_at IS NULL`
  );
  const sample = await client.query(
    `SELECT kind, source_code AS "sourceCode", reason, phones, customer_code AS "customerCode", last_seen_at AS "lastSeenAt"
     FROM unmatched_transactions WHERE resolved_at IS NULL ORDER BY last_seen_at DESC LIMIT 20`
  );
  const syncs = await client.query(
    `SELECT sheet_name AS "sheetName", received_at AS "receivedAt", status, total_rows AS "totalRows",
            applied_rows AS "appliedRows", skipped_rows AS "skippedRows", metadata->'identity' AS identity
     FROM google_sheet_sync_runs ORDER BY received_at DESC LIMIT 15`
  );
  const kindCount = (kind: string) => identifiers.rows.find((row) => row.kind === kind)?.n ?? 0;
  const c = customers.rows[0];
  return {
    generatedAt: new Date().toISOString(),
    customers: {
      total: c.total, placeholder: c.placeholder, withoutIdentifier: c.without_identifier,
      withoutPhone: c.without_phone, suspectCreatedDate: c.suspect_dates,
    },
    identifiers: { phone: kindCount('PHONE'), code: kindCount('CODE') },
    duplicates: { phoneGroups: duplicates.rows[0].groups, customersInvolved: duplicates.rows[0].customers },
    transactions: {
      quotations: { total: quotes.rows[0].total, onPlaceholder: quotes.rows[0].on_placeholder },
      orders: { total: orders.rows[0].total, onPlaceholder: orders.rows[0].on_placeholder },
    },
    unmatched: {
      quotations: unmatched.rows[0].quotations, orders: unmatched.rows[0].orders,
      noIdentifier: unmatched.rows[0].no_identifier, sample: sample.rows,
    },
    lastSyncs: syncs.rows,
  };
}
