// AuditPulse - Customer identity mapping integration tests (real PostgreSQL).
// Runs only with TEST_DATABASE_URL (never DATABASE_URL) and refuses Neon hosts.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { customerIdentityReport, ensureCustomerIdentitySchema } from '../../server/services/customerIdentity.ts';
import { applyCustomerMerge, planCustomerMerge } from '../../server/services/customerMerge.ts';
import { syncGoogleSheetWebhook } from '../../server/services/googleSheetsWebhook.ts';

const TEST_URL = process.env.TEST_DATABASE_URL;
if (TEST_URL && /neon\.tech/i.test(TEST_URL)) throw new Error('Refusing to run against a Neon host.');
const liveTest = TEST_URL ? test : test.skip;
const pool = new pg.Pool({ connectionString: TEST_URL, max: 3 });

const CRM_HEADERS = ['Mã khách hàng', 'Tên KH', 'Số điện thoại', 'Người phụ trách', 'Team', 'Nguồn khách hàng', 'Thời gian'];
const QUOTE_HEADERS = ['So bao gia', 'Ma khach hang unique', 'SDT', 'Khach hang', 'Nhan vien', 'Ngay bao gia', 'Tong tien'];
const ORDER_HEADERS = ['So chung tu', 'Ma khach hang unique', 'SDT', 'Ten khach hang', 'Ten nhan vien', 'Ngay chung tu', 'Tong thanh toan'];

interface Fx {
  tag: string;
  sale: string;
  saleCode: string;
  client: pg.PoolClient;
  phone: () => string;
  trackedCustomerIds: Set<string>;
  send: (sheet: string, headers: string[], rows: string[][]) => ReturnType<typeof syncGoogleSheetWebhook>;
}

async function withFixtures(run: (fx: Fx) => Promise<void>) {
  const tag = `IDT${randomUUID().slice(0, 8).toUpperCase()}`;
  const client = await pool.connect();
  const sale = `SALE-${tag}`;
  const saleCode = `${tag}-S`;
  const trackedCustomerIds = new Set<string>();
  const usedPhones: string[] = [];
  const phone = () => {
    const value = `09${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
    usedPhones.push(value);
    trackedCustomerIds.add(value);
    return value;
  };
  try {
    await ensureCustomerIdentitySchema(client);
    await client.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1,$2,$3,'SALE')`, [sale, `s.${tag}@t.local`, `Sale ${tag}`]);
    await client.query(`INSERT INTO sales_profiles (id, sale_code) VALUES ($1,$2)`, [sale, saleCode]);
    const send: Fx['send'] = (sheet, headers, rows) =>
      syncGoogleSheetWebhook(client, { sourceId: `T-${tag}`, sheetName: sheet, deliveryId: randomUUID(), headers, rows, rowStart: 2 });
    await run({ tag, sale, saleCode, client, phone, trackedCustomerIds, send });
  } finally {
    const ids = [...trackedCustomerIds];
    await client.query(`DELETE FROM unmatched_transactions WHERE source_code LIKE $1`, [`%${tag}%`]);
    await client.query(`DELETE FROM sales_orders WHERE code LIKE $1`, [`%${tag}%`]);
    await client.query(`DELETE FROM quotations WHERE code LIKE $1`, [`%${tag}%`]);
    await client.query(`DELETE FROM customer_merge_log WHERE winner_id = ANY($1::text[]) OR loser_id = ANY($1::text[])`, [ids]);
    await client.query(
      `DELETE FROM customers WHERE id = ANY($1::text[]) OR code LIKE $2 OR phone = ANY($3::text[]) OR id LIKE $2`,
      [ids, `%${tag}%`, usedPhones]
    );
    await client.query(`DELETE FROM google_sheet_row_state WHERE source_id = $1`, [`T-${tag}`]);
    await client.query(`DELETE FROM google_sheet_sync_runs WHERE source_id = $1`, [`T-${tag}`]);
    await client.query(`DELETE FROM app_users WHERE id = $1`, [sale]);
    client.release();
  }
}

const spaced = (p: string) => `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;
const international = (p: string) => `+84 ${p.slice(1, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;
const count = async (fx: Fx, sql: string, params: unknown[] = []) => Number((await fx.client.query(sql, params)).rows[0].n);

liveTest('one customer across CRM, quotation and order even when the phone is typed three ways and the code appears late', async () => {
  await withFixtures(async (fx) => {
    const p = fx.phone();
    const code = `KH-${fx.tag}`;

    // 1) CRM knows the customer only by phone (no code yet).
    const crm1 = await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách A', spaced(p), fx.saleCode, '', 'Facebook', '20/10/2026']]);
    assert.equal(crm1.identity?.customersCreated, 1);
    const created = await fx.client.query(`SELECT id, current_sale_id FROM customers WHERE phone = $1`, [p]);
    assert.equal(created.rowCount, 1);
    assert.equal(created.rows[0].current_sale_id, fx.sale);
    const customerId = created.rows[0].id as string;
    fx.trackedCustomerIds.add(customerId);

    // 2) The quotation (phone in international format) issues the code.
    const quote = await fx.send('misa_bao_gia_ggs', QUOTE_HEADERS, [[`Q-${fx.tag}`, code, international(p), 'Khách A', fx.saleCode, '21/10/2026', '1.000.000']]);
    assert.equal(quote.appliedRows, 1);
    assert.equal((await fx.client.query(`SELECT customer_id FROM quotations WHERE code = $1`, [`Q-${fx.tag}`])).rows[0].customer_id, customerId);
    assert.equal(
      (await fx.client.query(`SELECT customer_id FROM customer_identifiers WHERE kind = 'CODE' AND value = $1`, [code])).rows[0].customer_id,
      customerId,
      'the code is learned from the quotation'
    );

    // 3) The order carries only the code: it still resolves to the same customer.
    const order = await fx.send('misa_don_hang_ggs', ORDER_HEADERS, [[`O-${fx.tag}`, code, '', 'Khách A', fx.saleCode, '22/10/2026', '900.000']]);
    assert.equal(order.appliedRows, 1);
    assert.equal((await fx.client.query(`SELECT customer_id FROM sales_orders WHERE code = $1`, [`O-${fx.tag}`])).rows[0].customer_id, customerId);

    // 4) The CRM row now carries the code: no second customer is created.
    const crm2 = await fx.send('TongHopKhachHang', CRM_HEADERS, [[code.toLowerCase(), 'Khách A (đã báo giá)', p, fx.saleCode, '', 'Facebook', '20/10/2026']]);
    assert.equal(crm2.identity?.customersCreated, 0);
    assert.equal(crm2.identity?.customersMatched, 1);
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE phone = $1 OR id = $2 OR id = $3`, [p, code, code.toLowerCase()]), 1);
    assert.equal((await fx.client.query(`SELECT name FROM customers WHERE id = $1`, [customerId])).rows[0].name, 'Khách A (đã báo giá)');

    // Nothing was invented along the way.
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE channel = 'HISTORICAL_TRANSACTION' AND (id LIKE $1 OR phone = $2)`, [`%${fx.tag}%`, p]), 0);
  });
});

liveTest('the owner is kept when the sheet names someone we cannot resolve, and cleared only when the cell is blank', async () => {
  await withFixtures(async (fx) => {
    const p = fx.phone();
    await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách B', p, fx.saleCode, '', '', '20/10/2026']]);
    const owner = async () => (await fx.client.query(`SELECT current_sale_id FROM customers WHERE phone = $1`, [p])).rows[0].current_sale_id;
    assert.equal(await owner(), fx.sale);

    const typo = await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách B', p, `Nguoi Khong Ton Tai ${fx.tag}`, '', '', '20/10/2026']]);
    assert.equal(typo.identity?.ownerUnresolved, 1);
    assert.equal(await owner(), fx.sale, 'an unresolvable name must not wipe the owner');

    await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách B', p, '', '', '', '20/10/2026']]);
    assert.equal(await owner(), null, 'a blank cell means the customer is unassigned');
  });
});

liveTest('rows of one delivery that describe the same person (phone list, other format) become one customer', async () => {
  await withFixtures(async (fx) => {
    const p1 = fx.phone();
    const p2 = fx.phone();
    const result = await fx.send('TongHopKhachHang', CRM_HEADERS, [
      ['', 'Khách C', `${p1}\n${p2}`, fx.saleCode, '', '', '20/10/2026'],
      ['', 'Khách C (dòng 2)', international(p2), fx.saleCode, '', '', '20/10/2026'],
    ]);
    assert.equal(result.identity?.customersCreated, 1);
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE phone = ANY($1::text[])`, [[p1, p2]]), 1);
    const bound = await fx.client.query(`SELECT value FROM customer_identifiers WHERE kind = 'PHONE' AND value = ANY($1::text[])`, [[p1, p2]]);
    assert.equal(bound.rowCount, 2, 'every phone of the cell is indexed');
  });
});

liveTest('a quotation with an unknown customer is parked, not turned into a placeholder, and applied when the CRM row arrives', async () => {
  await withFixtures(async (fx) => {
    const p = fx.phone();
    const early = await fx.send('misa_bao_gia_ggs', QUOTE_HEADERS, [[`Q-${fx.tag}`, `KH-${fx.tag}`, p, 'Khách D', fx.saleCode, '21/10/2026', '500.000']]);
    assert.equal(early.appliedRows, 0);
    assert.equal(early.identity?.unmatchedQuotations, 1);
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE phone = $1 OR id LIKE $2`, [p, `%${fx.tag}%`]), 0, 'no placeholder customer');
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM quotations WHERE code = $1`, [`Q-${fx.tag}`]), 0);
    const parked = await fx.client.query(`SELECT reason, resolved_at FROM unmatched_transactions WHERE source_code = $1`, [`Q-${fx.tag}`]);
    assert.equal(parked.rows[0].reason, 'NO_MATCH');
    assert.equal(parked.rows[0].resolved_at, null);

    const noId = await fx.send('misa_don_hang_ggs', ORDER_HEADERS, [[`O-${fx.tag}`, '', '', 'Khách ẩn danh', fx.saleCode, '21/10/2026', '1']]);
    assert.equal(noId.identity?.noIdentifier, 1);
    assert.equal((await fx.client.query(`SELECT reason FROM unmatched_transactions WHERE source_code = $1`, [`O-${fx.tag}`])).rows[0].reason, 'NO_IDENTIFIER');

    const report = await customerIdentityReport(fx.client);
    assert.ok(report.unmatched.quotations >= 1 && report.unmatched.noIdentifier >= 1);

    const crm = await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách D', international(p), fx.saleCode, '', '', '20/10/2026']]);
    assert.equal(crm.identity?.reconciled, 1, 'the parked quotation is applied once its customer exists');
    const customerId = (await fx.client.query(`SELECT id FROM customers WHERE phone = $1`, [p])).rows[0].id as string;
    fx.trackedCustomerIds.add(customerId);
    assert.equal((await fx.client.query(`SELECT customer_id FROM quotations WHERE code = $1`, [`Q-${fx.tag}`])).rows[0].customer_id, customerId);
    assert.ok((await fx.client.query(`SELECT resolved_at FROM unmatched_transactions WHERE source_code = $1`, [`Q-${fx.tag}`])).rows[0].resolved_at);
  });
});

liveTest('legacy duplicates (phone-keyed row + placeholder with history) merge into one customer; preview changes nothing', async () => {
  await withFixtures(async (fx) => {
    const p = fx.phone();
    const rawId = spaced(p);
    const ghostId = `KH-G-${fx.tag}`;
    fx.trackedCustomerIds.add(rawId).add(ghostId);
    const real = await fx.client.query(
      `INSERT INTO customers (id, code, name, phone, channel, first_seen_date, current_sale_id)
       VALUES ($1,$1,'Khách E',$2,'Facebook','2026-10-01T03:00:00Z',$3)`,
      [rawId, rawId, fx.sale]
    );
    assert.equal(real.rowCount, 1);
    await fx.client.query(
      `INSERT INTO customers (id, code, name, phone, channel, first_seen_date)
       VALUES ($1,$1,'Khách E (lịch sử)',$2,'HISTORICAL_TRANSACTION','2026-10-05T03:00:00Z')`,
      [ghostId, international(p)]
    );
    await fx.client.query(
      `INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status)
       VALUES ($1,$1,$2,$3,'2026-10-06T03:00:00Z',1000,'PENDING')`,
      [`Q-${fx.tag}`, ghostId, fx.sale]
    );
    await fx.client.query(
      `INSERT INTO sales_orders (id, code, customer_id, sale_id, order_date, total_amount, status)
       VALUES ($1,$1,$2,$3,'2026-10-07T03:00:00Z',1000,'VALID')`,
      [`O-${fx.tag}`, ghostId, fx.sale]
    );

    const plan = await planCustomerMerge(fx.client);
    const cluster = plan.clusters.find((c) => c.members.some((m) => m.id === ghostId));
    assert.ok(cluster, 'duplicate group is detected');
    assert.equal(cluster.winnerId, rawId, 'the real CRM customer wins over the placeholder');
    assert.deepEqual(cluster.loserIds, [ghostId]);
    assert.equal(cluster.quotationsToMove, 1);
    assert.equal(cluster.ordersToMove, 1);
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE id = $1`, [ghostId]), 1, 'preview must not write');

    const applied = await applyCustomerMerge(fx.client, { actor: 'test', maxClusters: 100_000, budgetMs: 120_000 });
    assert.deepEqual(applied.failed, []);
    assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE id = $1`, [ghostId]), 0);
    assert.equal((await fx.client.query(`SELECT customer_id FROM quotations WHERE code = $1`, [`Q-${fx.tag}`])).rows[0].customer_id, rawId);
    assert.equal((await fx.client.query(`SELECT customer_id FROM sales_orders WHERE code = $1`, [`O-${fx.tag}`])).rows[0].customer_id, rawId);
    const log = await fx.client.query(`SELECT loser_snapshot->>'name' AS name, moved FROM customer_merge_log WHERE loser_id = $1`, [ghostId]);
    assert.equal(log.rows[0].name, 'Khách E (lịch sử)');
    assert.equal(log.rows[0].moved.quotations, 1);
    assert.equal((await fx.client.query(`SELECT customer_id FROM customer_identifiers WHERE kind = 'PHONE' AND value = $1`, [p])).rows[0].customer_id, rawId);

    // The next CRM delivery maps to the survivor instead of creating a new row.
    const after = await fx.send('TongHopKhachHang', CRM_HEADERS, [['', 'Khách E', p, fx.saleCode, '', 'Facebook', '01/10/2026']]);
    assert.equal(after.identity?.customersCreated, 0);
    assert.equal(after.identity?.customersMatched, 1);

    const again = await planCustomerMerge(fx.client);
    assert.equal(again.clusters.some((c) => c.members.some((m) => m.id === rawId)), false, 'merging is idempotent');
  });
});

liveTest('a cluster the database refuses to merge is reported and rolled back without blocking the others', async () => {
  await withFixtures(async (fx) => {
    // Cluster 1 (mergeable) and cluster 2 (both rows own the same active action => unique violation).
    const mk = async (id: string, name: string, phone: string, channel: string | null) => {
      fx.trackedCustomerIds.add(id);
      await fx.client.query(
        `INSERT INTO customers (id, code, name, phone, channel, first_seen_date, current_sale_id) VALUES ($1,$1,$2,$3,$4,'2026-10-01T03:00:00Z',$5)`,
        [id, name, phone, channel, fx.sale]
      );
    };
    const okPhone = fx.phone();
    const blockedPhone = fx.phone();
    await mk(`OK-W-${fx.tag}`, 'ok winner', okPhone, 'Facebook');
    await mk(`OK-L-${fx.tag}`, 'ok loser', international(okPhone), 'HISTORICAL_TRANSACTION');
    await mk(`BL-W-${fx.tag}`, 'blocked winner', blockedPhone, 'Facebook');
    await mk(`BL-L-${fx.tag}`, 'blocked loser', international(blockedPhone), 'HISTORICAL_TRANSACTION');

    const auditor = `AUDITOR-${fx.tag}`;
    await fx.client.query(`INSERT INTO app_users (id, email, name, role) VALUES ($1,$2,'Auditor','AUDITOR')`, [auditor, `a.${fx.tag}@t.local`]);
    try {
      for (const [suffix, customerId] of [['1', `BL-W-${fx.tag}`], ['2', `BL-L-${fx.tag}`]] as const) {
        await fx.client.query(
          `INSERT INTO corrective_actions (id, code, customer_id, sale_id, auditor_id, issue_code, issue_name, severity, status, due_date,
             sla_rule_version, completion_criteria, snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name)
           VALUES ($1,$1,$2,$3,$4,'ISSUE-X','x','LOW','OPEN',NOW(),'v1','x','c','s','t','a')`,
          [`CA-${fx.tag}-${suffix}`, customerId, fx.sale, auditor]
        );
      }
      const applied = await applyCustomerMerge(fx.client, { actor: 'test', budgetMs: 120_000 });
      assert.equal(applied.failed.some((f) => f.winnerId === `BL-W-${fx.tag}`), true, 'the blocked cluster is reported');
      assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE id = $1`, [`OK-L-${fx.tag}`]), 0, 'the healthy cluster still merged');
      assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM customers WHERE id = $1`, [`BL-L-${fx.tag}`]), 1, 'the blocked cluster is untouched');
      assert.equal(await count(fx, `SELECT COUNT(*) AS n FROM corrective_actions WHERE customer_id = $1`, [`BL-L-${fx.tag}`]), 1);
      assert.equal(applied.done, false);
    } finally {
      await fx.client.query(`DELETE FROM corrective_actions WHERE id LIKE $1`, [`CA-${fx.tag}-%`]);
      await fx.client.query(`DELETE FROM app_users WHERE id = $1`, [auditor]);
    }
  });
});

after(async () => {
  await pool.end();
});
