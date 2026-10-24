// AuditPulse - Daily audit queue materialization (server side).
//
// Builds the queue for ONE audit date (Vietnam business date) in set-based SQL so it
// stays fast for thousands of customers, and is idempotent: running it again only
// refreshes tags/assignments, never duplicates (unique audit_date + customer_id).
//
// Candidate rules for audit date D (all evaluated "as of the end of D-1"):
//   YESTERDAY_CUSTOMERS  customer first seen between D-2 and D-1
//   NO_QUOTATION         customer has NO quotation dated up to D-1
//   QUOTED_NOT_ORDERED   customer has a quotation up to D-1 with no valid order since it
// Customers created after D-1 never appear on day D, so back-filling a past date does
// not leak newer customers into it.
import { createHash } from 'node:crypto';
import type pg from 'pg';

export interface MaterializeResult {
  auditDate: string;
  ruleItems: number;
  sheetItems: number;
  queueItems: number;
  skipped: number;
}

export const AUDIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today's business date in Vietnam. */
export function vietnamBusinessDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

/** The last `days` business dates ending at `today`, oldest first. */
export function recentAuditDates(today: string, days: number): string[] {
  const base = new Date(`${today}T00:00:00Z`);
  const result: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - offset);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/** Set-based creation of rule-driven queue items. Returns the number of rows written. */
export async function materializeRuleItems(client: pg.PoolClient, auditDate: string): Promise<number> {
  const compact = auditDate.replaceAll('-', '');
  const runId = `RUN-AUTO-${compact}`;
  await client.query(
    `INSERT INTO audit_queue_runs (id, run_date, rule_version, total_items, status)
     VALUES ($1, $2::date, 'auto-rules-v1', 0, 'COMPLETED')
     ON CONFLICT (id) DO NOTHING`,
    [runId, auditDate]
  );

  const result = await client.query(
    `WITH p AS (SELECT $1::date AS d),
     candidates AS (
       SELECT
         c.id AS customer_id, c.name AS customer_name,
         u.id AS sale_id, u.name AS sale_name,
         t.id AS team_id, t.name AS team_name,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN (c.first_seen_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p.d - 2 AND p.d - 1 THEN 'YESTERDAY_CUSTOMERS' END,
           CASE WHEN NOT EXISTS (
                  SELECT 1 FROM quotations q0
                  WHERE q0.customer_id = c.id AND (q0.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p.d - 1
                ) THEN 'NO_QUOTATION' END,
           CASE WHEN EXISTS (
                  SELECT 1 FROM quotations q1
                  WHERE q1.customer_id = c.id AND (q1.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p.d - 1
                    AND NOT EXISTS (
                      SELECT 1 FROM sales_orders so
                      WHERE so.customer_id = c.id AND so.status = 'VALID'
                        AND (so.order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= (q1.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                        AND (so.order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p.d
                    )
                ) THEN 'QUOTED_NOT_ORDERED' END
         ]::text[], NULL) AS rule_codes
       FROM customers c
       CROSS JOIN p
       LEFT JOIN LATERAL (
         SELECT q.sale_id FROM quotations q WHERE q.customer_id = c.id ORDER BY q.quote_date DESC LIMIT 1
       ) latest_quote_owner ON true
       LEFT JOIN LATERAL (
         SELECT so.sale_id FROM sales_orders so WHERE so.customer_id = c.id ORDER BY so.order_date DESC LIMIT 1
       ) latest_order_owner ON true
       JOIN app_users u
         ON u.id = COALESCE(c.current_sale_id, latest_quote_owner.sale_id, latest_order_owner.sale_id)
        AND u.role = 'SALE' AND u.is_active = TRUE
       JOIN sales_profiles sp ON sp.id = u.id
       JOIN teams t ON t.id = COALESCE(c.current_team_id, sp.team_id)
       WHERE (c.first_seen_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p.d - 1
     ),
     picked AS (
       SELECT * FROM candidates WHERE cardinality(rule_codes) > 0
     )
     INSERT INTO audit_queue_items (
       id, queue_run_id, audit_date, customer_id, sale_id, team_id,
       assigned_auditor_id, status, risk_tags, active_action_id, rule_version,
       sync_timestamp, assigned_at, shared_work, snapshot_customer_name,
       snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
     )
     SELECT
       'QUEUE-SHEET-' || substr(encode(sha256(convert_to(p.d::text || '|' || k.customer_id, 'UTF8')), 'hex'), 1, 24),
       $2, p.d, k.customer_id, k.sale_id, k.team_id,
       asg.auditor_id,
       CASE WHEN asg.auditor_id IS NOT NULL THEN 'ASSIGNED' ELSE 'UNASSIGNED' END,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'source', 'fact_issue_log')), '[]'::jsonb)
          FROM unnest(k.rule_codes) AS code),
       NULL, 'auto-rules-v1', NOW(),
       CASE WHEN asg.auditor_id IS NOT NULL THEN p.d::timestamptz END,
       false, k.customer_name, k.sale_name, k.team_name, asg.auditor_name
     FROM picked k
     CROSS JOIN p
     LEFT JOIN LATERAL (
       SELECT a.auditor_id, COALESCE(a.snapshot_auditor_name, au.name) AS auditor_name
       FROM auditor_assignments a
       JOIN app_users au ON au.id = a.auditor_id
       WHERE a.sale_id = k.sale_id
         AND a.effective_from <= p.d
         AND (a.effective_to IS NULL OR a.effective_to >= p.d)
       ORDER BY a.effective_from DESC
       LIMIT 1
     ) asg ON true
     ON CONFLICT (audit_date, customer_id) DO UPDATE SET
       risk_tags = EXCLUDED.risk_tags,
       assigned_auditor_id = COALESCE(audit_queue_items.assigned_auditor_id, EXCLUDED.assigned_auditor_id),
       assigned_at = COALESCE(audit_queue_items.assigned_at, EXCLUDED.assigned_at),
       status = CASE WHEN audit_queue_items.status IN ('COMPLETED_PASS', 'COMPLETED_FAIL', 'SKIPPED')
                     THEN audit_queue_items.status ELSE EXCLUDED.status END,
       snapshot_sale_name = EXCLUDED.snapshot_sale_name,
       team_id = EXCLUDED.team_id,
       snapshot_team_name = EXCLUDED.snapshot_team_name,
       snapshot_auditor_name = COALESCE(audit_queue_items.snapshot_auditor_name, EXCLUDED.snapshot_auditor_name),
       sync_timestamp = NOW()`,
    [auditDate, runId]
  );
  await client.query(
    `UPDATE audit_queue_runs SET total_items = (SELECT COUNT(*) FROM audit_queue_items WHERE queue_run_id = $1) WHERE id = $1`,
    [runId]
  );
  return result.rowCount ?? 0;
}

/**
 * Full materialization for one date inside the caller's transaction:
 * rule-driven items (bulk) + items promoted from the fact_issue_log sheet rows.
 * `auditDate` null means today in Vietnam.
 */
export async function materializeQueueForDate(client: pg.PoolClient, auditDate: string | null): Promise<MaterializeResult> {
  const date = auditDate && AUDIT_DATE_PATTERN.test(auditDate) ? auditDate : vietnamBusinessDate();
  const ruleItems = await materializeRuleItems(client, date);

  const [sourceRows, customers, sales, assignments] = await Promise.all([
    client.query<{ payload: Record<string, string> }>(
      `SELECT payload FROM google_sheet_row_state
       WHERE source_id = 'sale-issues' AND sheet_name = 'fact_issue_log'`
    ),
    client.query<{ id: string; code: string; name: string; phone: string | null }>(
      `SELECT id, code, name, phone FROM customers`
    ),
    client.query<{ id: string; name: string; saleCode: string; teamId: string | null; teamName: string | null }>(
      `SELECT u.id, u.name, sp.sale_code AS "saleCode", sp.team_id AS "teamId", t.name AS "teamName"
       FROM app_users u JOIN sales_profiles sp ON sp.id = u.id
       LEFT JOIN teams t ON t.id = sp.team_id
       WHERE u.role = 'SALE'`
    ),
    client.query<{ saleId: string; auditorId: string; effectiveFrom: string; effectiveTo: string | null; auditorName: string; auditorTeam: string | null }>(
      // Date-based (not the stored is_active flag, which goes stale and ignores future-dated rows).
      `SELECT a.sale_id AS "saleId", a.auditor_id AS "auditorId",
              to_char(a.effective_from, 'YYYY-MM-DD') AS "effectiveFrom", to_char(a.effective_to, 'YYYY-MM-DD') AS "effectiveTo",
              u.name AS "auditorName", NULL::text AS "auditorTeam"
       FROM auditor_assignments a JOIN app_users u ON u.id = a.auditor_id`
    ),
  ]);

  const normalizeLookupKey = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (/^\d+$/.test(trimmed)) return trimmed.replace(/^0+/, '') || '0';
    return trimmed.replace(/\s+/g, ' ');
  };
  const byCustomer = new Map<string, { id: string; name: string; phone: string | null }>();
  for (const customer of customers.rows) {
    for (const key of [customer.code, customer.phone, customer.name]) {
      if (key?.trim()) byCustomer.set(normalizeLookupKey(key), customer);
    }
  }
  const bySale = new Map<string, { id: string; name: string; saleCode: string; teamId: string | null; teamName: string | null }>();
  for (const sale of sales.rows) {
    for (const key of [sale.name, sale.saleCode]) {
      if (key?.trim()) bySale.set(key.trim().toLowerCase(), sale);
    }
  }

  type Group = {
    customer: { id: string; name: string; phone: string | null };
    sale: { id: string; name: string };
    team: { id: string; name: string };
    issueCodes: Set<string>;
  };
  const groups = new Map<string, Group>();
  let skipped = 0;

  // Issue-log rows are optional enrichment for the requested date only. Re-promoting every
  // historical date on every call would make a daily job needlessly slow.
  for (const sourceRow of sourceRows.rows) {
    const row = sourceRow.payload || {};
    const rowDate = String(row.date || '').trim().slice(0, 10);
    if (rowDate !== date) continue;
    const customerKey = normalizeLookupKey(String(row.sdt || row.ma_khach_hang || row.khach || ''));
    const saleKey = String(row.sale || row.sale_name || row.ten_sale || '').trim().toLowerCase();
    const customer = byCustomer.get(customerKey);
    const sale = bySale.get(saleKey);
    // Team ownership is canonical in data_sale/sales_profiles. The issue
    // log may contain an old or mistyped team label, so never let it
    // overwrite the current master assignment.
    const team = sale?.teamId && sale.teamName ? { id: sale.teamId, name: sale.teamName } : undefined;
    if (!customer || !sale || !team) {
      skipped += 1;
      continue;
    }
    const group = groups.get(customer.id) || { customer, sale, team, issueCodes: new Set<string>() };
    const issueCode = String(row.issue_code || row.ma_loi || '').trim();
    if (issueCode) group.issueCodes.add(issueCode);
    groups.set(customer.id, group);
  }

  const runId = `RUN-AUTO-${date.replaceAll('-', '')}`;
  let sheetItems = 0;
  for (const group of groups.values()) {
    const assignment = assignments.rows.find((item) => item.saleId === group.sale.id &&
      item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date));
    const queueId = `QUEUE-SHEET-${createHash('sha256').update(`${date}|${group.customer.id}`).digest('hex').slice(0, 24)}`;
    const riskTags = JSON.stringify([...group.issueCodes].map((code) => ({ code, source: 'fact_issue_log' })));
    await client.query(
      `INSERT INTO audit_queue_items (
         id, queue_run_id, audit_date, customer_id, sale_id, team_id,
         assigned_auditor_id, status, risk_tags, active_action_id, rule_version,
         sync_timestamp, assigned_at, shared_work, snapshot_customer_name,
         snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
       ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, NULL, 'auto-rules-v1', NOW(), $10, false, $11, $12, $13, $14)
       ON CONFLICT (audit_date, customer_id) DO UPDATE SET
         risk_tags = (
           SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
           FROM jsonb_array_elements(COALESCE(audit_queue_items.risk_tags, '[]'::jsonb) || EXCLUDED.risk_tags) AS t
         ),
         sync_timestamp = NOW()`,
      [
        queueId, runId, date, group.customer.id, group.sale.id, group.team.id,
        assignment?.auditorId || null,
        assignment ? 'ASSIGNED' : 'UNASSIGNED',
        riskTags,
        assignment ? date : null,
        group.customer.name, group.sale.name, group.team.name,
        assignment?.auditorName || null,
      ]
    );
    sheetItems += 1;
  }
  if (sheetItems > 0) {
    await client.query(
      `UPDATE audit_queue_runs SET total_items = (SELECT COUNT(*) FROM audit_queue_items WHERE queue_run_id = $1) WHERE id = $1`,
      [runId]
    );
  }
  return { auditDate: date, ruleItems, sheetItems, queueItems: ruleItems + sheetItems, skipped };
}
