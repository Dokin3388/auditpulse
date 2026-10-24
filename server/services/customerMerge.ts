// AuditPulse - one-time (and re-runnable) clean-up of duplicate customers.
//
// Before phone-first identity existed, one real customer could be stored many
// times: once under the phone (CRM row without a code), again under the code
// that appeared with the first quotation, and a placeholder customer for every
// quotation/order whose phone/code did not match byte-for-byte. This module
// groups customers that share a normalized PHONE (the primary key), keeps the
// best record, moves every quotation / order / action / queue item to it and
// removes the extra rows. A full snapshot of each removed row is kept in
// customer_merge_log. Nothing is written unless apply() is called.
import type pg from 'pg';
import {
  bindIdentifierBatch,
  ensureCustomerIdentitySchema,
  identitySignals,
  type IdentityKind,
} from './customerIdentity.ts';
import { boundedKey, normalizeGoogleSheetHeader, text } from './googleSheetsWebhook.ts';

/** A phone shared by more customers than this is not a person (switchboard, reseller). */
export const MAX_MERGE_CLUSTER_SIZE = 6;

export interface CustomerRecord {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  channel: string | null;
  currentSaleId: string | null;
  createdAt: string;
  quotes: number;
  orders: number;
}

export interface IdentityEdge {
  customerId: string;
  kind: IdentityKind;
  value: string;
}

export interface MergeClusterPlan {
  winnerId: string;
  loserIds: string[];
  phones: string[];
  members: Array<{ id: string; name: string; channel: string | null; quotes: number; orders: number; hasOwner: boolean }>;
  quotationsToMove: number;
  ordersToMove: number;
  ownerConflict: boolean;
}

export interface MergePlan {
  generatedAt: string;
  totals: {
    customers: number;
    clusters: number;
    customersToRemove: number;
    quotationsToMove: number;
    ordersToMove: number;
    ownerConflicts: number;
    identifiersToAdd: number;
    codesSharedByManyCustomers: number;
  };
  clusters: MergeClusterPlan[];
  /** Phones shared by too many customers: reported, never merged automatically. */
  needsReview: Array<{ phones: string[]; customerIds: string[] }>;
  sharedCodes: Array<{ code: string; customers: number }>;
}

// ------------------------------------------------------------------ pure planning

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cursor = x;
    while (cursor !== root) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Best record first: real CRM customer > has owner > most history > code id > oldest. */
export function rankCustomers(customers: CustomerRecord[]): CustomerRecord[] {
  const placeholder = (c: CustomerRecord) => (c.channel === 'HISTORICAL_TRANSACTION' ? 1 : 0);
  const phoneLikeId = (c: CustomerRecord) => (/^[\d\s.+()-]+$/.test(c.id) ? 1 : 0);
  return [...customers].sort(
    (a, b) =>
      placeholder(a) - placeholder(b) ||
      Number(Boolean(b.currentSaleId)) - Number(Boolean(a.currentSaleId)) ||
      b.quotes + b.orders - (a.quotes + a.orders) ||
      phoneLikeId(a) - phoneLikeId(b) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
  );
}

export function buildMergePlan(
  customers: CustomerRecord[],
  edges: IdentityEdge[],
  boundIdentifiers: Map<string, string>,
  generatedAt = new Date().toISOString()
): MergePlan {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const unique = new Map<string, IdentityEdge>();
  for (const edge of edges) {
    if (byId.has(edge.customerId)) unique.set(`${edge.kind}:${edge.value}:${edge.customerId}`, edge);
  }
  const allEdges = [...unique.values()];

  const finder = new UnionFind();
  const phoneOwner = new Map<string, string>();
  const phonesOf = new Map<string, Set<string>>();
  const codeCustomers = new Map<string, Set<string>>();
  for (const edge of allEdges) {
    if (edge.kind === 'PHONE') {
      finder.find(edge.customerId);
      const owner = phoneOwner.get(edge.value);
      if (owner) finder.union(owner, edge.customerId);
      else phoneOwner.set(edge.value, edge.customerId);
      if (!phonesOf.has(edge.customerId)) phonesOf.set(edge.customerId, new Set());
      phonesOf.get(edge.customerId)!.add(edge.value);
    } else {
      if (!codeCustomers.has(edge.value)) codeCustomers.set(edge.value, new Set());
      codeCustomers.get(edge.value)!.add(edge.customerId);
    }
  }

  const groups = new Map<string, string[]>();
  for (const customerId of phonesOf.keys()) {
    const root = finder.find(customerId);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(customerId);
  }

  const clusters: MergeClusterPlan[] = [];
  const needsReview: MergePlan['needsReview'] = [];
  for (const memberIds of groups.values()) {
    if (memberIds.length < 2) continue;
    const phones = [...new Set(memberIds.flatMap((id) => [...(phonesOf.get(id) ?? [])]))];
    if (memberIds.length > MAX_MERGE_CLUSTER_SIZE) {
      needsReview.push({ phones: phones.slice(0, 10), customerIds: memberIds.slice(0, 20) });
      continue;
    }
    const members = memberIds.map((id) => byId.get(id)!);
    const placeholders = members.filter((m) => m.channel === 'HISTORICAL_TRANSACTION').length;
    // A placeholder account (MISA code without CRM record) can carry rows with
    // several people's phones. If it links two real CRM customers it is a bridge,
    // not proof that they are the same person: leave the whole group for review.
    if (placeholders > 0 && members.length - placeholders >= 2) {
      needsReview.push({ phones: phones.slice(0, 10), customerIds: memberIds.slice(0, 20) });
      continue;
    }
    const ranked = rankCustomers(members);
    const [winner, ...losers] = ranked;
    const ownerIds = new Set(ranked.map((c) => c.currentSaleId).filter(Boolean));
    clusters.push({
      winnerId: winner.id,
      loserIds: losers.map((l) => l.id),
      phones,
      members: ranked.map((c) => ({
        id: c.id, name: c.name, channel: c.channel, quotes: c.quotes, orders: c.orders, hasOwner: Boolean(c.currentSaleId),
      })),
      quotationsToMove: losers.reduce((sum, l) => sum + l.quotes, 0),
      ordersToMove: losers.reduce((sum, l) => sum + l.orders, 0),
      ownerConflict: ownerIds.size > 1,
    });
  }
  clusters.sort((a, b) => b.quotationsToMove + b.ordersToMove - (a.quotationsToMove + a.ordersToMove) || a.winnerId.localeCompare(b.winnerId));

  // Customers that survive a merge keep every identifier of the removed rows.
  const loserToWinner = new Map<string, string>();
  clusters.forEach((cluster) => cluster.loserIds.forEach((id) => loserToWinner.set(id, cluster.winnerId)));
  const toAdd = new Set<string>();
  for (const edge of allEdges) {
    const key = `${edge.kind}:${edge.value}`;
    if (!boundIdentifiers.has(key)) toAdd.add(key);
  }

  const sharedCodes = [...codeCustomers.entries()]
    .filter(([, owners]) => new Set([...owners].map((id) => loserToWinner.get(id) ?? id)).size > 1)
    .map(([code, owners]) => ({ code, customers: owners.size }))
    .sort((a, b) => b.customers - a.customers)
    .slice(0, 30);

  return {
    generatedAt,
    totals: {
      customers: customers.length,
      clusters: clusters.length,
      customersToRemove: clusters.reduce((sum, c) => sum + c.loserIds.length, 0),
      quotationsToMove: clusters.reduce((sum, c) => sum + c.quotationsToMove, 0),
      ordersToMove: clusters.reduce((sum, c) => sum + c.ordersToMove, 0),
      ownerConflicts: clusters.filter((c) => c.ownerConflict).length,
      identifiersToAdd: toAdd.size,
      codesSharedByManyCustomers: sharedCodes.length,
    },
    clusters,
    needsReview,
    sharedCodes,
  };
}

// ------------------------------------------------------------------ database access

async function loadSheetNames(client: pg.PoolClient): Promise<{ crm: string[]; quotes: string[]; orders: string[] }> {
  const result = await client.query(`SELECT DISTINCT sheet_name FROM google_sheet_row_state`);
  const pick = (...names: string[]) =>
    result.rows.map((row) => row.sheet_name as string).filter((name) => names.includes(normalizeGoogleSheetHeader(name)));
  return {
    crm: pick('data_customers', 'tonghopkhachhang'),
    quotes: pick('misa_bao_gia_ggs'),
    orders: pick('misa_don_hang_ggs'),
  };
}

export async function loadMergeInputs(client: pg.PoolClient) {
  const customerRows = await client.query(
    `SELECT c.id, c.code, c.name, c.phone, c.channel, c.current_sale_id, c.created_at,
            COALESCE(q.n, 0)::int AS quotes, COALESCE(o.n, 0)::int AS orders
     FROM customers c
     LEFT JOIN (SELECT customer_id, COUNT(*) AS n FROM quotations GROUP BY customer_id) q ON q.customer_id = c.id
     LEFT JOIN (SELECT customer_id, COUNT(*) AS n FROM sales_orders GROUP BY customer_id) o ON o.customer_id = c.id`
  );
  const sheets = await loadSheetNames(client);
  const bound = await client.query(`SELECT kind, value, customer_id FROM customer_identifiers`);

  const customers: CustomerRecord[] = customerRows.rows.map((row) => ({
    id: row.id, code: row.code, name: row.name, phone: row.phone, channel: row.channel,
    currentSaleId: row.current_sale_id, createdAt: new Date(row.created_at).toISOString(),
    quotes: row.quotes, orders: row.orders,
  }));

  const edges: IdentityEdge[] = [];
  const addSignals = (customerId: string, phoneCell: unknown, codeCell: unknown) => {
    const signals = identitySignals(phoneCell, codeCell);
    signals.phones.forEach((value) => edges.push({ customerId, kind: 'PHONE', value }));
    if (signals.code) edges.push({ customerId, kind: 'CODE', value: signals.code });
  };
  // 1) what the customer row itself says (phone column + key)
  customers.forEach((c) => addSignals(c.id, c.phone, c.code));

  // 2) the raw sheet rows kept in the sync ledger: every phone of the CRM cell,
  //    and the phone/code written on each quotation and order of the customer.
  if (sheets.crm.length > 0) {
    const crm = await client.query(
      `SELECT source_row_key, payload->>'so_dien_thoai' AS phone_cell, payload->>'ma_khach_hang' AS code_cell
       FROM google_sheet_row_state WHERE sheet_name = ANY($1::text[])`,
      [sheets.crm]
    );
    const known = new Set(customers.map((c) => c.id));
    for (const row of crm.rows) {
      const customerId = boundedKey(text(row.code_cell) || text(row.phone_cell) || row.source_row_key);
      if (known.has(customerId)) addSignals(customerId, row.phone_cell, row.code_cell);
    }
  }
  for (const [names, table] of [[sheets.quotes, 'quotations'], [sheets.orders, 'sales_orders']] as const) {
    if (names.length === 0) continue;
    const rows = await client.query(
      `SELECT t.customer_id, s.payload->>'sdt' AS phone_cell, s.payload->>'ma_khach_hang_unique' AS code_cell
       FROM google_sheet_row_state s JOIN ${table} t ON t.code = s.source_row_key
       WHERE s.sheet_name = ANY($1::text[])`,
      [names]
    );
    rows.rows.forEach((row) => addSignals(row.customer_id, row.phone_cell, row.code_cell));
  }

  const boundIdentifiers = new Map<string, string>(bound.rows.map((row) => [`${row.kind}:${row.value}`, row.customer_id]));
  return { customers, edges, boundIdentifiers };
}

export async function planCustomerMerge(client: pg.PoolClient): Promise<MergePlan> {
  await ensureCustomerIdentitySchema(client);
  const { customers, edges, boundIdentifiers } = await loadMergeInputs(client);
  return buildMergePlan(customers, edges, boundIdentifiers);
}

// ------------------------------------------------------------------ apply

export interface MergeApplyResult {
  merged: number;
  customersRemoved: number;
  quotationsMoved: number;
  ordersMoved: number;
  failed: Array<{ winnerId: string; error: string }>;
  remaining: number;
  identifiersAdded: number;
  done: boolean;
}

const MOVED_TABLES = [
  ['quotations', 'quotations'],
  ['sales_orders', 'sales_orders'],
  ['corrective_actions', 'corrective_actions'],
  ['rescued_orders', 'rescued_orders'],
  ['audit_queue_items', 'audit_queue_items'],
] as const;

interface MergePair {
  winnerId: string;
  loserId: string;
}

/**
 * Merge many (winner, loser) pairs with a fixed number of set-based statements,
 * so the cost does not grow with the number of clusters (matters on a remote
 * database). Runs inside the caller's savepoint.
 */
async function mergePairs(client: pg.PoolClient, pairs: MergePair[], actor: string): Promise<{ quotes: number; orders: number }> {
  const winners = pairs.map((pair) => pair.winnerId);
  const losers = pairs.map((pair) => pair.loserId);
  const map = `WITH m AS (SELECT * FROM unnest($1::text[], $2::text[]) AS t(winner_id, loser_id))`;

  // What will move, per removed customer, for the audit log.
  const moved = new Map<string, Record<string, number>>(losers.map((id) => [id, {}]));
  for (const [label, table] of MOVED_TABLES) {
    const counts = await client.query(
      `SELECT customer_id, COUNT(*)::int AS n FROM ${table} WHERE customer_id = ANY($1::text[]) GROUP BY customer_id`,
      [losers]
    );
    counts.rows.forEach((row) => (moved.get(row.customer_id)![label] = row.n));
  }

  for (const table of ['quotations', 'sales_orders', 'corrective_actions', 'rescued_orders']) {
    await client.query(`${map} UPDATE ${table} t SET customer_id = m.winner_id FROM m WHERE t.customer_id = m.loser_id`, [winners, losers]);
  }
  // Queue items: move one per (winner, day) that the winner does not already have.
  await client.query(
    `${map},
     pick AS (
       SELECT DISTINCT ON (m.winner_id, i.audit_date) i.id, m.winner_id
       FROM audit_queue_items i JOIN m ON i.customer_id = m.loser_id
       WHERE NOT EXISTS (SELECT 1 FROM audit_queue_items x WHERE x.customer_id = m.winner_id AND x.audit_date = i.audit_date)
       ORDER BY m.winner_id, i.audit_date, i.id
     )
     UPDATE audit_queue_items i SET customer_id = pick.winner_id FROM pick WHERE i.id = pick.id`,
    [winners, losers]
  );
  // Same-day duplicates are dropped; the database refuses if an audit case points at one.
  await client.query(`DELETE FROM audit_queue_items WHERE customer_id = ANY($1::text[])`, [losers]);

  await client.query(
    `${map},
     agg AS (
       SELECT m.winner_id,
              MIN(l.first_seen_date) AS first_seen,
              (ARRAY_AGG(l.phone) FILTER (WHERE l.phone IS NOT NULL))[1] AS phone,
              (ARRAY_AGG(l.current_sale_id) FILTER (WHERE l.current_sale_id IS NOT NULL))[1] AS sale_id,
              (ARRAY_AGG(l.current_team_id) FILTER (WHERE l.current_team_id IS NOT NULL))[1] AS team_id,
              (ARRAY_AGG(l.channel) FILTER (WHERE l.channel IS NOT NULL AND l.channel <> 'HISTORICAL_TRANSACTION'))[1] AS channel
       FROM m JOIN customers l ON l.id = m.loser_id GROUP BY m.winner_id
     )
     UPDATE customers w SET
       first_seen_date = LEAST(w.first_seen_date, agg.first_seen),
       phone = COALESCE(w.phone, agg.phone),
       current_sale_id = COALESCE(w.current_sale_id, agg.sale_id),
       current_team_id = COALESCE(w.current_team_id, agg.team_id),
       channel = CASE WHEN w.channel = 'HISTORICAL_TRANSACTION' AND agg.channel IS NOT NULL THEN agg.channel ELSE w.channel END
     FROM agg WHERE w.id = agg.winner_id`,
    [winners, losers]
  );
  await client.query(
    `${map} UPDATE customer_identifiers i SET customer_id = m.winner_id FROM m WHERE i.customer_id = m.loser_id`,
    [winners, losers]
  );
  await client.query(
    `INSERT INTO customer_merge_log (id, winner_id, loser_id, loser_snapshot, moved, merged_by)
     SELECT 'MRG-' || gen_random_uuid()::text, t.winner_id, l.id, to_jsonb(l), t.moved, $4
     FROM unnest($1::text[], $2::text[], $3::jsonb[]) AS t(winner_id, loser_id, moved)
     JOIN customers l ON l.id = t.loser_id`,
    [winners, losers, losers.map((id) => JSON.stringify(moved.get(id))), actor]
  );
  await client.query(`DELETE FROM customers WHERE id = ANY($1::text[])`, [losers]);

  let quotes = 0;
  let orders = 0;
  moved.forEach((counts) => {
    quotes += counts.quotations ?? 0;
    orders += counts.sales_orders ?? 0;
  });
  return { quotes, orders };
}

/**
 * Merge duplicate clusters in set-based chunks. If a chunk is refused by the
 * database (for example a protected audit case) it is retried cluster by
 * cluster so only the blocked cluster is left behind and reported. Time-boxed
 * to fit a serverless request; call again until `done`.
 */
export async function applyCustomerMerge(
  client: pg.PoolClient,
  options: { actor: string; chunkSize?: number; budgetMs?: number }
): Promise<MergeApplyResult> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 7000;
  const chunkSize = options.chunkSize ?? 400;
  const plan = await planCustomerMerge(client);
  const result: MergeApplyResult = {
    merged: 0, customersRemoved: 0, quotationsMoved: 0, ordersMoved: 0, failed: [], remaining: 0, identifiersAdded: 0, done: false,
  };

  const attempt = async (clusters: MergeClusterPlan[]): Promise<boolean> => {
    const pairs = clusters.flatMap((cluster) => cluster.loserIds.map((loserId) => ({ winnerId: cluster.winnerId, loserId })));
    await client.query('SAVEPOINT merge_step');
    try {
      const moved = await mergePairs(client, pairs, options.actor);
      await client.query('RELEASE SAVEPOINT merge_step');
      result.merged += clusters.length;
      result.customersRemoved += pairs.length;
      result.quotationsMoved += moved.quotes;
      result.ordersMoved += moved.orders;
      return true;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT merge_step');
      if (clusters.length === 1) {
        result.failed.push({ winnerId: clusters[0].winnerId, error: error instanceof Error ? error.message : String(error) });
      }
      return false;
    }
  };

  await client.query('BEGIN');
  try {
    let processed = 0;
    while (processed < plan.clusters.length && Date.now() - started <= budgetMs) {
      const chunk = plan.clusters.slice(processed, processed + chunkSize);
      if (!(await attempt(chunk))) for (const cluster of chunk) await attempt([cluster]);
      processed += chunk.length;
    }
    result.remaining = plan.clusters.length - processed;

    if (result.remaining === 0) {
      // Every cluster handled: index every phone/code known for the survivors.
      const survivors = await loadMergeInputs(client);
      const entries = survivors.edges.map((edge) => ({ kind: edge.kind, value: edge.value, customerId: edge.customerId }));
      result.identifiersAdded = (await bindIdentifierBatch(client, entries, 'MERGE')).bound;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  result.done = result.remaining === 0 && result.failed.length === 0;
  return result;
}
