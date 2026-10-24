// AuditPulse - Assignment service integration tests (real PostgreSQL).
//
// SAFETY: runs ONLY when TEST_DATABASE_URL is set, and refuses any Neon host.
// It never reads DATABASE_URL, so `npm test` can not touch production. The
// database must already have migrations 0001-0006 applied (db/migrations).
// All fixtures use a unique prefix and are removed in `finally`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  AssignmentError,
  createAssignmentsInTransaction,
  listAssignments,
  parseCreateInput,
  toAssignmentError,
} from '../../server/services/assignments.ts';

const TEST_URL = process.env.TEST_DATABASE_URL;
if (TEST_URL && /neon\.tech/i.test(TEST_URL)) {
  throw new Error('Refusing to run destructive integration tests against a Neon host.');
}
const liveTest = TEST_URL ? test : test.skip;
const pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });

// Replaced per test by a real app_users row (audit_trail_events.actor_user_id has an FK).
let actor = { id: 'HEAD-TEST', name: 'Head Test', role: 'HEAD_AUDITOR' };

async function withFixtures(run: (f: Fixtures) => Promise<void>) {
  const tag = `T${randomUUID().slice(0, 8).toUpperCase()}`;
  const f: Fixtures = {
    tag,
    teamId: `TEAM-${tag}`,
    sales: [`SALE-${tag}-1`, `SALE-${tag}-2`],
    saleCodes: [`${tag}-S1`, `${tag}-S2`],
    auditors: [`AUDITOR-${tag}-A`, `AUDITOR-${tag}-B`],
    auditorCodes: [`${tag}-AUD-A`, `${tag}-AUD-B`],
  };
  const c = await pool.connect();
  try {
    actor = { id: `HEAD-${tag}`, name: `Head ${tag}`, role: 'HEAD_AUDITOR' };
    await c.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, $3, 'HEAD_AUDITOR')`, [actor.id, `h.${tag}@t.local`, actor.name]);
    await c.query(`INSERT INTO teams (id, code, name) VALUES ($1, $1, $2)`, [f.teamId, `Team ${tag}`]);
    for (let i = 0; i < 2; i++) {
      await c.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, $3, 'SALE')`, [f.sales[i], `s${i}.${tag}@t.local`, `Sale ${tag} ${i + 1}`]);
      await c.query(`INSERT INTO sales_profiles (id, sale_code, team_id) VALUES ($1, $2, $3)`, [f.sales[i], f.saleCodes[i], f.teamId]);
      await c.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, $3, 'AUDITOR')`, [f.auditors[i], `a${i}.${tag}@t.local`, `Auditor ${tag} ${'AB'[i]}`]);
      await c.query(`INSERT INTO auditor_profiles (id, auditor_code) VALUES ($1, $2)`, [f.auditors[i], f.auditorCodes[i]]);
    }
    await run(f);
  } finally {
    await c.query(`DELETE FROM audit_trail_events WHERE metadata->>'saleId' = ANY($1::text[])`, [f.sales]);
    await c.query(`DELETE FROM auditor_assignments WHERE sale_id = ANY($1::text[])`, [f.sales]);
    await c.query(`DELETE FROM app_users WHERE id = ANY($1::text[])`, [[...f.sales, ...f.auditors, actor.id]]);
    await c.query(`DELETE FROM teams WHERE id = $1`, [f.teamId]);
    c.release();
  }
}
interface Fixtures {
  tag: string;
  teamId: string;
  sales: string[];
  saleCodes: string[];
  auditors: string[];
  auditorCodes: string[];
}

/** Runs the service exactly like the POST route: one transaction, COMMIT on success. */
async function commitCreate(input: Parameters<typeof createAssignmentsInTransaction>[1], now?: Date) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await createAssignmentsInTransaction(client, input, actor, now);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const rowsFor = async (f: Fixtures) =>
  (await pool.query(`SELECT * FROM auditor_assignments WHERE sale_id = ANY($1::text[]) ORDER BY effective_from`, [f.sales])).rows;

// ---------------------------------------------------------------- pure input validation (no DB)
test('parseCreateInput: validates and normalises the request body', () => {
  const ok = parseCreateInput({ saleId: ' S1 ', auditorId: 'AUD-01', effectiveFrom: '2026-10-23', reason: ' r ' });
  assert.deepEqual(ok, { saleRefs: ['S1'], auditorRef: 'AUD-01', effectiveFrom: '2026-10-23', reason: 'r' });
  assert.deepEqual(parseCreateInput({ saleIds: ['a', 'a', 'b'], auditorId: 'x', effectiveFrom: '2026-10-23', reason: 'r' }).saleRefs, ['a', 'b']);
  for (const bad of [
    { auditorId: 'x', effectiveFrom: '2026-10-23', reason: 'r' },
    { saleId: 's', effectiveFrom: '2026-10-23', reason: 'r' },
    { saleId: 's', auditorId: 'x', effectiveFrom: '2026-13-40', reason: 'r' },
    { saleId: 's', auditorId: 'x', effectiveFrom: '23/10/2026', reason: 'r' },
    { saleId: 's', auditorId: 'x', effectiveFrom: '2026-10-23', reason: '  ' },
  ]) {
    assert.throws(() => parseCreateInput(bad), AssignmentError);
  }
});

test('toAssignmentError: maps PostgreSQL constraint codes to 4xx with Vietnamese messages', () => {
  assert.equal(toAssignmentError({ code: '23P01' })?.status, 409);
  assert.equal(toAssignmentError({ code: '23503' })?.status, 400);
  assert.equal(toAssignmentError(new Error('boom')), null);
});

// ---------------------------------------------------------------- real database
liveTest('Create by UI CODES (AUD-xx / sale code) persists with canonical ids - the production bug', async () => {
  await withFixtures(async (f) => {
    const out = await commitCreate({ saleRefs: [f.saleCodes[0]], auditorRef: f.auditorCodes[0], effectiveFrom: '2026-10-23', reason: 'Luân chuyển' });
    assert.equal(out.assignments.length, 1);

    const rows = await rowsFor(f); // independent connection, after COMMIT
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sale_id, f.sales[0], 'stored as app_users.id');
    assert.equal(rows[0].auditor_id, f.auditors[0], 'stored as app_users.id, not the code');
    assert.equal(rows[0].effective_to, null);
  });
});

liveTest('Read-back after create: GET shape returns codes, plain YYYY-MM-DD dates and the same row', async () => {
  await withFixtures(async (f) => {
    const out = await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'r' }, new Date('2026-10-23T03:00:00Z'));
    const listed = (await listAssignments(pool, { saleRef: f.sales[0], today: '2026-10-23' }));
    assert.equal(listed.length, 1);
    const row = listed[0];
    assert.equal(row.id, out.assignments[0].id);
    assert.equal(row.auditorId, f.auditorCodes[0], 'UI key space = auditor code');
    assert.equal(row.auditorUserId, f.auditors[0]);
    assert.equal(row.saleCode, f.saleCodes[0]);
    assert.equal(row.effectiveFrom, '2026-10-23', 'DATE must be plain text, never an ISO timestamp');
    assert.equal(JSON.parse(JSON.stringify(row)).effectiveFrom, '2026-10-23');
    assert.equal(row.effectiveTo, null);
    assert.equal(row.isActive, true);
    // also reachable by sale CODE
    assert.equal((await listAssignments(pool, { saleRef: f.saleCodes[0], today: '2026-10-23' })).length, 1);
  });
});

liveTest('Reload simulation: a brand-new connection still sees the committed assignment', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditorCodes[1], effectiveFrom: '2026-10-23', reason: 'r' });
    const fresh = new pg.Pool({ connectionString: TEST_URL, max: 1 });
    try {
      const again = await listAssignments(fresh, { saleRef: f.sales[0], today: '2026-10-23' });
      assert.equal(again.length, 1);
      assert.equal(again[0].auditorName, `Auditor ${f.tag} B`);
    } finally {
      await fresh.end();
    }
  });
});

liveTest('Rotation: previous open assignment is closed at day-before; effective auditor is correct per date', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-01', reason: 'A' });
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[1], effectiveFrom: '2026-10-23', reason: 'B' });
    const rows = await pool.query(
      `SELECT auditor_id, to_char(effective_from,'YYYY-MM-DD') f, to_char(effective_to,'YYYY-MM-DD') t FROM auditor_assignments WHERE sale_id=$1 ORDER BY effective_from`,
      [f.sales[0]]
    );
    assert.deepEqual(rows.rows, [
      { auditor_id: f.auditors[0], f: '2026-10-01', t: '2026-10-22' },
      { auditor_id: f.auditors[1], f: '2026-10-23', t: null },
    ]);
    // Same lateral lookup the Audit Queue uses
    const effective = async (d: string) =>
      (await pool.query(
        `SELECT auditor_id FROM auditor_assignments a WHERE a.sale_id=$1 AND a.effective_from <= $2::date AND (a.effective_to IS NULL OR a.effective_to >= $2::date) ORDER BY a.effective_from DESC LIMIT 1`,
        [f.sales[0], d]
      )).rows[0]?.auditor_id;
    assert.equal(await effective('2026-10-22'), f.auditors[0]);
    assert.equal(await effective('2026-10-23'), f.auditors[1]);
    assert.equal(await effective('2026-10-30'), f.auditors[1]);
  });
});

liveTest('No duplicate: same auditor again on the same sale is rejected (409), nothing written', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-01', reason: 'r' });
    await assert.rejects(
      () => commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditorCodes[0], effectiveFrom: '2026-10-23', reason: 'r' }),
      (e: unknown) => e instanceof AssignmentError && e.status === 409 && e.code === 'DUPLICATE_ASSIGNMENT'
    );
    assert.equal((await rowsFor(f)).length, 1);
  });
});

liveTest('No overlap: same start date / earlier-than-open start are rejected (409), data unchanged', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-10', reason: 'r' });
    for (const date of ['2026-10-10', '2026-10-05']) {
      await assert.rejects(
        () => commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[1], effectiveFrom: date, reason: 'r' }),
        (e: unknown) => e instanceof AssignmentError && e.status === 409
      );
    }
    const rows = await rowsFor(f);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].effective_to, null, 'existing open assignment must not be altered by a rejected request');
  });
});

liveTest('DB exclusion constraint is still the last line of defence (23P01 -> 409)', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-01', reason: 'r' });
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO auditor_assignments (id, sale_id, auditor_id, effective_from, assignment_reason, created_by) VALUES ($1,$2,$3,'2026-10-15','x','t')`,
          [`ASG-RAW-${f.tag}`, f.sales[0], f.auditors[1]]
        ),
      (e: unknown) => toAssignmentError(e)?.status === 409
    );
  });
});

liveTest('Batch is atomic: one invalid sale -> NO sale is assigned', async () => {
  await withFixtures(async (f) => {
    await assert.rejects(
      () => commitCreate({ saleRefs: [f.sales[0], `GHOST-${f.tag}`], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'r' }),
      (e: unknown) => e instanceof AssignmentError && e.status === 404
    );
    assert.equal((await rowsFor(f)).length, 0);

    // conflict on the 2nd sale also rolls back the 1st
    await commitCreate({ saleRefs: [f.sales[1]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'r' });
    await assert.rejects(
      () => commitCreate({ saleRefs: [f.sales[0], f.sales[1]], auditorRef: f.auditors[1], effectiveFrom: '2026-10-23', reason: 'r' }),
      (e: unknown) => e instanceof AssignmentError && e.status === 409
    );
    const rows = await rowsFor(f);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sale_id, f.sales[1]);
  });
});

liveTest('Batch happy path writes every sale with distinct ids (no Date.now() collisions)', async () => {
  await withFixtures(async (f) => {
    const out = await commitCreate({ saleRefs: f.sales, auditorRef: f.auditorCodes[0], effectiveFrom: '2026-10-23', reason: 'r' });
    assert.equal(out.assignments.length, 2);
    assert.equal(new Set(out.assignments.map((a) => a.id)).size, 2);
    assert.equal((await rowsFor(f)).length, 2);
  });
});

liveTest('Concurrent identical requests: exactly one assignment is created', async () => {
  await withFixtures(async (f) => {
    const attempt = () => commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'r' });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await rowsFor(f)).length, 1);
  });
});

liveTest('Unknown / inactive / wrong-role auditor is rejected with 404 and nothing is written', async () => {
  await withFixtures(async (f) => {
    for (const ref of ['AUD-DOES-NOT-EXIST', f.sales[1] /* a SALE user, wrong role */]) {
      await assert.rejects(
        () => commitCreate({ saleRefs: [f.sales[0]], auditorRef: ref, effectiveFrom: '2026-10-23', reason: 'r' }),
        (e: unknown) => e instanceof AssignmentError && e.status === 404
      );
    }
    assert.equal((await rowsFor(f)).length, 0);
  });
});

liveTest('Vietnam timezone: 01:30 on 23 Oct (VN) is already 23 Oct -> assignment effective 23 Oct is active', async () => {
  await withFixtures(async (f) => {
    // 2026-10-22T18:30Z is 2026-10-23 01:30 in Vietnam (UTC would still say 22 Oct)
    const out = await commitCreate(
      { saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'r' },
      new Date('2026-10-22T18:30:00Z')
    );
    assert.equal(out.assignments[0].isActive, true);
    assert.equal((await rowsFor(f))[0].is_active, true);
    // a future-dated assignment (24 Oct) is not active yet on 23 Oct VN
    const later = await commitCreate(
      { saleRefs: [f.sales[1]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-24', reason: 'r' },
      new Date('2026-10-22T18:30:00Z')
    );
    assert.equal(later.assignments[0].isActive, false);
  });
});

liveTest('Audit trail event is written in the same transaction with the real actor role', async () => {
  await withFixtures(async (f) => {
    await commitCreate({ saleRefs: [f.sales[0]], auditorRef: f.auditors[0], effectiveFrom: '2026-10-23', reason: 'Lý do kiểm tra' });
    const ev = await pool.query(`SELECT actor_role, action_type, details FROM audit_trail_events WHERE metadata->>'saleId' = $1`, [f.sales[0]]);
    assert.equal(ev.rows.length, 1);
    assert.equal(ev.rows[0].action_type, 'AUDITOR_ASSIGNMENT_UPDATED');
    assert.equal(ev.rows[0].actor_role, 'HEAD_AUDITOR');
  });
});

test.after(async () => {
  await pool.end();
});
