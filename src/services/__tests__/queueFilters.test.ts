import assert from 'node:assert/strict';
import test from 'node:test';
import { auditorFilterValue, dedupeByCode, matchesAuditorFilter, matchesStatusFilter } from '../queueFilters.ts';

test('auditor filter uses the auditor code that queue rows carry, not the login id', () => {
  const user = { id: 'user-123', auditorId: 'A01' };
  assert.equal(auditorFilterValue(user), 'A01');
  assert.equal(matchesAuditorFilter('A01', auditorFilterValue(user)), true);
  assert.equal(matchesAuditorFilter('A02', auditorFilterValue(user)), false);
  assert.equal(auditorFilterValue({ id: 'only-id' }), 'only-id');
});

test('auditor filter: ALL passes everything, UNASSIGNED passes only rows without an auditor', () => {
  assert.equal(matchesAuditorFilter(null, 'ALL'), true);
  assert.equal(matchesAuditorFilter('A01', 'ALL'), true);
  assert.equal(matchesAuditorFilter(null, 'UNASSIGNED'), true);
  assert.equal(matchesAuditorFilter(undefined, 'UNASSIGNED'), true);
  assert.equal(matchesAuditorFilter('A01', 'UNASSIGNED'), false);
});

test('dedupeByCode keeps the first tag of each code', () => {
  const tags = [{ code: 'Y', n: 1 }, { code: 'N', n: 2 }, { code: 'Y', n: 3 }];
  assert.deepEqual(dedupeByCode(tags), [{ code: 'Y', n: 1 }, { code: 'N', n: 2 }]);
});

test('status filter "Chưa phân công" matches PENDING and UNASSIGNED rows', () => {
  assert.equal(matchesStatusFilter('UNASSIGNED', 'PENDING'), true);
  assert.equal(matchesStatusFilter('PENDING', 'PENDING'), true);
  assert.equal(matchesStatusFilter('ASSIGNED', 'PENDING'), false);
  assert.equal(matchesStatusFilter('ASSIGNED', 'ASSIGNED'), true);
  assert.equal(matchesStatusFilter('ASSIGNED', 'ALL'), true);
});
