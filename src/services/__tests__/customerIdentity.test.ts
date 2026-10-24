import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CUSTOMER_IDENTITY_SCHEMA_SQL,
  chooseCustomer,
  extractPhones,
  identitySignals,
  normalizeCustomerCode,
  normalizePhone,
} from '../../../server/services/customerIdentity.ts';
import { buildMergePlan, rankCustomers, type CustomerRecord, type IdentityEdge } from '../../../server/services/customerMerge.ts';
import { parseSheetDate } from '../../../server/services/googleSheetsWebhook.ts';

test('normalizePhone: every common way of typing one number gives the same key', () => {
  for (const raw of ['0901234567', '0901 234 567', '090.123.4567', '090-123-4567', '+84901234567', '+84 901 234 567', '84901234567', '0084901234567', '901234567', 901234567, '9.01234567E8']) {
    assert.equal(normalizePhone(raw), '0901234567', String(raw));
  }
});

test('normalizePhone: landlines keep their area code and junk is rejected', () => {
  assert.equal(normalizePhone('028 3822 1234'), '02838221234');
  assert.equal(normalizePhone('2838221234'), '02838221234');
  assert.equal(normalizePhone('+84 28 3822 1234'), '02838221234');
  for (const bad of ['', '   ', 'chưa có', '12345', '0901', '090123456789012', null, undefined]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test('extractPhones: keeps order, de-duplicates and splits lists written in any style', () => {
  assert.deepEqual(extractPhones('0901234567\n0912345678'), ['0901234567', '0912345678']);
  assert.deepEqual(extractPhones('0901234567, 0912345678; +84901234567'), ['0901234567', '0912345678']);
  assert.deepEqual(extractPhones('0901 234 567 0912 345 678'), ['0901234567', '0912345678']);
  assert.deepEqual(extractPhones('0901234567 - 0912345678'), ['0901234567', '0912345678']);
  assert.deepEqual(extractPhones('Zalo 0901234567 / anh Nam'), ['0901234567']);
  assert.deepEqual(extractPhones('Anh Nam 2 0901234567'), ['0901234567']);
  assert.deepEqual(extractPhones(''), []);
  assert.deepEqual(extractPhones('không có'), []);
});

test('normalizeCustomerCode: case/space-insensitive and placeholders are not codes', () => {
  assert.equal(normalizeCustomerCode('  kh 0012 '), 'KH 0012');
  assert.equal(normalizeCustomerCode('KH0012'), 'KH0012');
  for (const empty of ['', ' ', '-', 'N/A', 'null', '0', 'không', null]) assert.equal(normalizeCustomerCode(empty), null, String(empty));
});

test('identitySignals: a phone typed in the code column is a phone, not a code', () => {
  assert.deepEqual(identitySignals('', '0901 234 567'), { phones: ['0901234567'], code: null });
  assert.deepEqual(identitySignals('+84901234567', 'kh001'), { phones: ['0901234567'], code: 'KH001' });
  assert.deepEqual(identitySignals('', ''), { phones: [], code: null });
});

test('chooseCustomer: phone wins over code; code is the fallback; conflicts are flagged', () => {
  const signals = { phones: ['0901234567', '0912345678'], code: 'KH001' };
  assert.deepEqual(chooseCustomer(signals, []), { customerId: null, via: null, conflict: false });
  assert.deepEqual(chooseCustomer(signals, [{ kind: 'CODE', value: 'KH001', customer_id: 'B' }]), { customerId: 'B', via: 'CODE', conflict: false });
  assert.deepEqual(
    chooseCustomer(signals, [{ kind: 'PHONE', value: '0912345678', customer_id: 'A' }]),
    { customerId: 'A', via: 'PHONE', conflict: false }
  );
  assert.deepEqual(
    chooseCustomer(signals, [
      { kind: 'PHONE', value: '0901234567', customer_id: 'A' },
      { kind: 'CODE', value: 'KH001', customer_id: 'B' },
    ]),
    { customerId: 'A', via: 'PHONE', conflict: true }
  );
});

test('parseSheetDate: DD/MM/YYYY is read as day-first; unreadable dates are null (never "now")', () => {
  assert.equal(parseSheetDate('02/01/2026'), '2026-01-02T00:00:00.000Z');
  assert.equal(parseSheetDate('31/02/2026'), null);
  assert.equal(parseSheetDate(''), null);
  assert.equal(parseSheetDate('abc'), null);
});

test('schema SQL embedded in the server matches migration 0007', () => {
  const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ').trim();
  const file = fs.readFileSync(new URL('../../../db/migrations/0007_customer_identity.sql', import.meta.url), 'utf8');
  assert.equal(strip(CUSTOMER_IDENTITY_SCHEMA_SQL), strip(file));
});

// ---------------------------------------------------------------- merge planning

const customer = (id: string, extra: Partial<CustomerRecord> = {}): CustomerRecord => ({
  id, code: id, name: `Khach ${id}`, phone: null, channel: null, currentSaleId: null,
  createdAt: '2026-01-01T00:00:00.000Z', quotes: 0, orders: 0, ...extra,
});
const phoneEdge = (customerId: string, value: string): IdentityEdge => ({ customerId, kind: 'PHONE', value });

test('rankCustomers: real CRM customer beats placeholder, owner beats none, history beats none', () => {
  const ghost = customer('G', { channel: 'HISTORICAL_TRANSACTION', quotes: 9, orders: 9 });
  const real = customer('R', { quotes: 0 });
  assert.equal(rankCustomers([ghost, real])[0].id, 'R');
  const owned = customer('O', { currentSaleId: 'S1' });
  assert.equal(rankCustomers([real, owned])[0].id, 'O');
  const busy = customer('B', { quotes: 2 });
  assert.equal(rankCustomers([real, busy])[0].id, 'B');
  assert.equal(rankCustomers([customer('0901234567'), customer('KH001')])[0].id, 'KH001');
});

test('buildMergePlan: phone-key row, code-key row and placeholder of one person form one cluster', () => {
  const customers = [
    customer('0901234567', { phone: '0901234567', currentSaleId: 'S1' }),
    customer('KH001', { phone: '0901234567', currentSaleId: 'S1', quotes: 1 }),
    customer('KH-GHOST', { channel: 'HISTORICAL_TRANSACTION', quotes: 3, orders: 5 }),
    customer('OTHER', { phone: '0999999999' }),
  ];
  const edges = [
    phoneEdge('0901234567', '0901234567'),
    phoneEdge('KH001', '0901234567'),
    phoneEdge('KH-GHOST', '0901234567'),
    phoneEdge('OTHER', '0999999999'),
  ];
  const plan = buildMergePlan(customers, edges, new Map(), '2026-10-24T00:00:00.000Z');
  assert.equal(plan.totals.clusters, 1);
  assert.equal(plan.clusters[0].winnerId, 'KH001');
  assert.deepEqual([...plan.clusters[0].loserIds].sort(), ['0901234567', 'KH-GHOST']);
  assert.equal(plan.totals.quotationsToMove, 3);
  assert.equal(plan.totals.ordersToMove, 5);
  assert.equal(plan.totals.customersToRemove, 2);
});

test('buildMergePlan: a phone shared by too many customers is reported, not merged', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const plan = buildMergePlan(ids.map((id) => customer(id)), ids.map((id) => phoneEdge(id, '0900000000')), new Map());
  assert.equal(plan.totals.clusters, 0);
  assert.equal(plan.needsReview.length, 1);
});

test('buildMergePlan: a generic customer code shared by different people never merges them', () => {
  const customers = [customer('A'), customer('B')];
  const edges: IdentityEdge[] = [
    phoneEdge('A', '0901111111'), phoneEdge('B', '0902222222'),
    { customerId: 'A', kind: 'CODE', value: 'KHACH LE' }, { customerId: 'B', kind: 'CODE', value: 'KHACH LE' },
  ];
  const plan = buildMergePlan(customers, edges, new Map());
  assert.equal(plan.totals.clusters, 0);
  assert.deepEqual(plan.sharedCodes, [{ code: 'KHACH LE', customers: 2 }]);
});

test('buildMergePlan: a placeholder account that bridges two real customers is left for review', () => {
  const customers = [
    customer('REAL-1', { phone: '0901111111' }),
    customer('REAL-2', { phone: '0902222222' }),
    customer('MISA-ACCOUNT', { channel: 'HISTORICAL_TRANSACTION', quotes: 4 }),
  ];
  const edges: IdentityEdge[] = [
    phoneEdge('REAL-1', '0901111111'), phoneEdge('REAL-2', '0902222222'),
    phoneEdge('MISA-ACCOUNT', '0901111111'), phoneEdge('MISA-ACCOUNT', '0902222222'),
  ];
  const plan = buildMergePlan(customers, edges, new Map());
  assert.equal(plan.totals.clusters, 0);
  assert.equal(plan.needsReview.length, 1);
});
