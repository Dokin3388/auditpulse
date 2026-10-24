// AuditPulse - Daily queue materialization integration tests (real PostgreSQL).
// Runs only with TEST_DATABASE_URL (never DATABASE_URL) and refuses Neon hosts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { materializeQueueForDate, recentAuditDates, vietnamBusinessDate } from '../../server/services/queueMaterializer.ts';

const TEST_URL = process.env.TEST_DATABASE_URL;
if (TEST_URL && /neon\.tech/i.test(TEST_URL)) throw new Error('Refusing to run against a Neon host.');
const liveTest = TEST_URL ? test : test.skip;
const pool = new pg.Pool({ connectionString: TEST_URL, max: 3 });

// ---------------------------------------------------------------- pure helpers
test('vietnamBusinessDate / recentAuditDates are Vietnam-calendar based', () => {
  assert.equal(vietnamBusinessDate(new Date('2026-10-23T18:30:00Z')), '2026-10-24');
  assert.deepEqual(recentAuditDates('2026-10-24', 3), ['2026-10-22', '2026-10-23', '2026-10-24']);
  assert.deepEqual(recentAuditDates('2026-03-01', 2), ['2026-02-28', '2026-03-01']);
});

// ---------------------------------------------------------------- fixtures
interface F { tag: string; team: string; sale: string; saleNoOwner: string; auditor: string; ids: Record<string, string> }

async function withFixtures(run: (f: F, c: pg.PoolClient) => Promise<void>) {
  const tag = `Q${randomUUID().slice(0, 8).toUpperCase()}`;
  const f: F = { tag, team: `TEAM-${tag}`, sale: `SALE-${tag}`, saleNoOwner: `SALE-${tag}-X`, auditor: `AUDITOR-${tag}`, ids: {} };
  const c = await pool.connect();
  const mk = (n: string) => (f.ids[n] = `CUS-${tag}-${n}`);
  try {
    await c.query(`INSERT INTO teams (id, code, name) VALUES ($1, $1, $2)`, [f.team, `Team ${tag}`]);
    await c.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1,$2,$3,'SALE')`, [f.sale, `s.${tag}@t.local`, `Sale ${tag}`]);
    await c.query(`INSERT INTO sales_profiles (id, sale_code, team_id) VALUES ($1,$2,$3)`, [f.sale, `${tag}-S`, f.team]);
    await c.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1,$2,$3,'AUDITOR')`, [f.auditor, `a.${tag}@t.local`, `Auditor ${tag}`]);
    await c.query(`INSERT INTO auditor_profiles (id, auditor_code) VALUES ($1,$2)`, [f.auditor, `${tag}-A`]);

    const cust = (n: string, firstSeen: string, owner: string | null) =>
      c.query(`INSERT INTO customers (id, code, name, first_seen_date, current_sale_id, current_team_id) VALUES ($1,$1,$2,$3::timestamptz,$4,$5)`,
        [mk(n), `Khach ${n} ${tag}`, firstSeen, owner, owner ? f.team : null]);
    await cust('NEW', '2026-10-23T03:00:00Z', f.sale);          // created "yesterday", no quote
    await cust('OLDNOQUOTE', '2026-09-01T03:00:00Z', f.sale);   // old, never quoted
    await cust('RECENT', '2026-10-20T03:00:00Z', f.sale);       // 4 days old, never quoted
    await cust('STALEQUOTE', '2026-07-01T03:00:00Z', f.sale);   // quoted long ago, no order
    await cust('QUOTED', '2026-09-01T03:00:00Z', f.sale);       // quoted, no order
    await cust('ORDERED', '2026-09-01T03:00:00Z', f.sale);      // quoted + valid order
    await cust('TODAY', '2026-10-24T03:00:00Z', f.sale);        // created on audit day itself
    await cust('NOOWNER', '2026-09-01T03:00:00Z', null);        // no sale -> cannot be queued
    const quote = (n: string, date: string) =>
      c.query(`INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status) VALUES ($1,$1,$2,$3,$4::timestamptz,1000,'PENDING')`,
        [`Q-${tag}-${n}`, f.ids[n], f.sale, date]);
    await quote('QUOTED', '2026-10-01T03:00:00Z');
    await quote('STALEQUOTE', '2026-08-01T03:00:00Z');
    await quote('ORDERED', '2026-10-01T03:00:00Z');
    await c.query(`INSERT INTO sales_orders (id, code, customer_id, sale_id, order_date, total_amount, status) VALUES ($1,$1,$2,$3,'2026-10-05T03:00:00Z',1000,'VALID')`,
      [`O-${tag}-ORDERED`, f.ids.ORDERED, f.sale]);
    await run(f, c);
  } finally {
    await c.query(`DELETE FROM audit_queue_items WHERE customer_id LIKE $1`, [`CUS-${tag}-%`]);
    await c.query(`DELETE FROM sales_orders WHERE id LIKE $1`, [`O-${tag}-%`]);
    await c.query(`DELETE FROM quotations WHERE id LIKE $1`, [`Q-${tag}-%`]);
    await c.query(`DELETE FROM customers WHERE id LIKE $1`, [`CUS-${tag}-%`]);
    await c.query(`DELETE FROM auditor_assignments WHERE sale_id = $1`, [f.sale]);
    await c.query(`DELETE FROM app_users WHERE id = ANY($1::text[])`, [[f.sale, f.auditor]]);
    await c.query(`DELETE FROM teams WHERE id = $1`, [f.team]);
    c.release();
  }
}

async function run(date: string) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await materializeQueueForDate(c, date);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

const items = async (f: F, date: string) =>
  (await pool.query(
    `SELECT customer_id, status, assigned_auditor_id, risk_tags FROM audit_queue_items WHERE audit_date = $1::date AND customer_id LIKE $2 ORDER BY customer_id`,
    [date, `CUS-${f.tag}-%`]
  )).rows;
const codes = (row: { risk_tags: Array<{ code: string }> }) => row.risk_tags.map((t) => t.code).sort();

liveTest('Daily rules: yesterday customers + no quotation + quoted-not-ordered land in the queue', async () => {
  await withFixtures(async (f) => {
    await run('2026-10-24');
    const rows = await items(f, '2026-10-24');
    const byId = Object.fromEntries(rows.map((r) => [r.customer_id.replace(`CUS-${f.tag}-`, ''), codes(r)]));
    assert.deepEqual(byId.NEW, ['NO_QUOTATION', 'YESTERDAY_CUSTOMERS']);
    assert.equal(byId.OLDNOQUOTE, undefined, 'never-quoted customers older than 7 days leave the daily queue');
    assert.deepEqual(byId.RECENT, ['NO_QUOTATION']);
    assert.equal(byId.STALEQUOTE, undefined, 'quotations older than 30 days are not chased any more');
    assert.deepEqual(byId.QUOTED, ['QUOTED_NOT_ORDERED']);
    assert.equal(byId.ORDERED, undefined, 'customer with quote AND valid order is not at risk');
    assert.equal(byId.TODAY, undefined, 'customer created on the audit day itself is not in that day yet');
    assert.equal(byId.NOOWNER, undefined, 'customer without an owner sale cannot be queued');
    assert.equal(rows.length, 3);
  });
});

liveTest('Next day picks up the customer created on the previous day (daily data appears automatically)', async () => {
  await withFixtures(async (f) => {
    await run('2026-10-25');
    const ids = (await items(f, '2026-10-25')).map((r) => r.customer_id.replace(`CUS-${f.tag}-`, ''));
    assert.ok(ids.includes('TODAY'), 'created 24/10 -> shows on 25/10');
    assert.ok(ids.includes('NEW'));
  });
});

liveTest('Back-filling a past date does not leak newer customers into it', async () => {
  await withFixtures(async (f) => {
    await run('2026-10-23');
    const ids = (await items(f, '2026-10-23')).map((r) => r.customer_id.replace(`CUS-${f.tag}-`, ''));
    assert.ok(!ids.includes('NEW'), 'NEW was created 23/10, so it is not in the 23/10 queue');
    assert.ok(!ids.includes('TODAY'));
    assert.ok(ids.includes('RECENT'));
  });
});

liveTest('Idempotent: running twice never duplicates rows', async () => {
  await withFixtures(async (f) => {
    const first = await run('2026-10-24');
    const before = (await items(f, '2026-10-24')).length;
    const second = await run('2026-10-24');
    assert.equal((await items(f, '2026-10-24')).length, before);
    assert.equal(first.ruleItems >= before, true);
    assert.equal(second.ruleItems >= before, true);
  });
});

liveTest('Assignment is date-effective: assigned from its effective date, unassigned before it', async () => {
  await withFixtures(async (f, c) => {
    await c.query(
      `INSERT INTO auditor_assignments (id, sale_id, auditor_id, effective_from, assignment_reason, created_by, is_active)
       VALUES ($1,$2,$3,'2026-10-24','t','t', false)`, // is_active=false on purpose: the stored flag must not matter
      [`ASG-${f.tag}`, f.sale, f.auditor]
    );
    await run('2026-10-23');
    await run('2026-10-24');
    const before = await items(f, '2026-10-23');
    const after = await items(f, '2026-10-24');
    assert.ok(before.length > 0 && before.every((r) => r.status === 'UNASSIGNED' && !r.assigned_auditor_id));
    assert.ok(after.length > 0 && after.every((r) => r.status === 'ASSIGNED' && r.assigned_auditor_id === f.auditor));
  });
});

liveTest('Vietnam calendar: a customer created 06:00 VN on 24/10 (23:00Z on 23/10) counts as 24/10, not 23/10', async () => {
  await withFixtures(async (f, c) => {
    await c.query(`UPDATE customers SET first_seen_date = '2026-10-23T23:00:00Z' WHERE id = $1`, [f.ids.TODAY]);
    await run('2026-10-24');
    const ids = (await items(f, '2026-10-24')).map((r) => r.customer_id.replace(`CUS-${f.tag}-`, ''));
    assert.ok(!ids.includes('TODAY'), 'created on 24/10 Vietnam time -> not part of 24/10 queue');
  });
});

test.after(async () => {
  await pool.end();
});
