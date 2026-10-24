// AuditPulse - Assignment date/timezone/identity rules + server-first save flow
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentMatchesSale,
  getDayBefore,
  getEffectiveAuditorForSale,
  normalizeDateOnly,
  resolveAssignmentChain,
  vietnamToday,
} from '../workflowRules.ts';
import { persistAssignments } from '../assignmentFlow.ts';
import { createAssignments } from '../api.ts';
import type { AuditorAssignment } from '../../types/index.ts';

const asg = (over: Partial<AuditorAssignment>): AuditorAssignment => ({
  id: 'A1',
  saleId: 'SALE-S20',
  saleCode: 'S20',
  saleName: 'Sale 20',
  teamName: 'B2B',
  auditorId: 'AUD-01',
  auditorUserId: 'AUDITOR-AUD-MAI-HOANG',
  auditorName: 'Mai Hoàng',
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  assignmentReason: 'r',
  createdBy: 'Head',
  createdAt: '2026-10-01T00:00:00Z',
  isActive: true,
  ...over,
});

const params = {
  saleId: 'S20',
  auditorId: 'AUD-02',
  reason: 'r',
  createdBy: 'Head',
  saleName: 'Sale 20',
  teamName: 'B2B',
  auditorName: 'Ngọc Nhi',
  todayStr: '2026-10-23',
};

// ---------------------------------------------------------------- timezone
test('Timezone: vietnamToday is the Vietnam calendar date, not the UTC date', () => {
  // 18:30 UTC on 22 Oct == 01:30 on 23 Oct in Vietnam
  assert.equal(vietnamToday(new Date('2026-10-22T18:30:00Z')), '2026-10-23');
  assert.equal(new Date('2026-10-22T18:30:00Z').toISOString().slice(0, 10), '2026-10-22'); // the old (buggy) behaviour
  // 16:59 UTC == 23:59 Vietnam (same day), 17:00 UTC == 00:00 next day
  assert.equal(vietnamToday(new Date('2026-10-23T16:59:59Z')), '2026-10-23');
  assert.equal(vietnamToday(new Date('2026-10-23T17:00:00Z')), '2026-10-24');
});

test('Timezone: getDayBefore is pure calendar arithmetic under any runtime TZ', () => {
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.equal(getDayBefore('2026-10-23'), '2026-10-22', tz);
      assert.equal(getDayBefore('2026-03-01'), '2026-02-28', tz);
      assert.equal(getDayBefore('2026-01-01'), '2025-12-31', tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('Dates: normalizeDateOnly accepts DATE text, ISO timestamps and Date objects', () => {
  assert.equal(normalizeDateOnly('2026-10-23'), '2026-10-23');
  assert.equal(normalizeDateOnly('2026-10-23T00:00:00.000Z'), '2026-10-23');
  assert.equal(normalizeDateOnly(new Date('2026-10-23T00:00:00Z')), '2026-10-23');
  assert.equal(normalizeDateOnly(null), '');
});

test('Effective date: an ISO-timestamp effectiveFrom (old API shape) still resolves on its own day', () => {
  const rows = [asg({ effectiveFrom: '2026-10-23T00:00:00.000Z' })];
  // string-compare on raw values would fail: '2026-10-23T00:00:00.000Z' > '2026-10-23'
  const resolved = resolveAssignmentChain(rows, { ...params, effectiveFrom: '2026-10-24' });
  assert.equal(resolved.success, true);
});

// ---------------------------------------------------------------- identity
test('Identity: sale matches by canonical id or by sale code', () => {
  assert.equal(assignmentMatchesSale(asg({}), 'SALE-S20'), true);
  assert.equal(assignmentMatchesSale(asg({}), 'S20'), true);
  assert.equal(assignmentMatchesSale(asg({}), 'S21'), false);
  assert.equal(getEffectiveAuditorForSale([asg({})], 'S20', '2026-10-23')?.auditorName, 'Mai Hoàng');
  assert.equal(getEffectiveAuditorForSale([asg({})], 'SALE-S20', '2026-10-23')?.auditorName, 'Mai Hoàng');
});

// ---------------------------------------------------------------- overlap rules (kept)
test('Overlap: cannot start on the same day as an existing assignment', () => {
  const res = resolveAssignmentChain([asg({ effectiveFrom: '2026-10-23' })], { ...params, effectiveFrom: '2026-10-23' });
  assert.equal(res.success, false);
  assert.match(res.message, /Xung đột ngày hiệu lực/);
});

test('Overlap: cannot insert an open-ended assignment before the current open-ended one', () => {
  const res = resolveAssignmentChain([asg({ effectiveFrom: '2026-10-10' })], { ...params, effectiveFrom: '2026-10-05' });
  assert.equal(res.success, false);
});

test('Rotation: new open-ended assignment closes the previous at day-before; history is kept', () => {
  const res = resolveAssignmentChain([asg({ effectiveFrom: '2026-10-01' })], { ...params, effectiveFrom: '2026-10-23' });
  assert.equal(res.success, true);
  const list = res.updatedAssignments ?? [];
  assert.equal(list.length, 2);
  const closed = list.find((a) => a.id === 'A1');
  assert.equal(closed?.effectiveTo, '2026-10-22');
  assert.equal(getEffectiveAuditorForSale(list, 'S20', '2026-10-22')?.auditorId, 'AUD-01');
  assert.equal(getEffectiveAuditorForSale(list, 'S20', '2026-10-23')?.auditorId, 'AUD-02');
});

// ---------------------------------------------------------------- server-first flow
const serverRow = asg({ id: 'ASG-NEW', auditorId: 'AUD-02', auditorName: 'Ngọc Nhi', effectiveFrom: '2026-10-23' });
const request = { saleIds: ['SALE-S20'], auditorId: 'AUDITOR-AUD-NGOC-NHI', effectiveFrom: '2026-10-23', reason: 'r' };

test('Flow: success -> list comes from a server reload (equals what a hard refresh shows)', async () => {
  const afterReload = [serverRow, asg({ effectiveTo: '2026-10-22', isActive: false })];
  const out = await persistAssignments(
    { create: async () => ({ message: 'ok', assignments: [serverRow] }), reload: async () => afterReload },
    request,
    []
  );
  assert.equal(out.success, true);
  if (out.success) {
    assert.deepEqual(out.assignments, afterReload);
    assert.equal(out.reloaded, true);
  }
});

test('Flow: backend error -> failure with the REAL message and NO assignment list is produced', async () => {
  let reloaded = false;
  const out = await persistAssignments(
    {
      create: async () => {
        throw new Error('Sale hoặc Auditor không hợp lệ');
      },
      reload: async () => {
        reloaded = true;
        return [];
      },
    },
    request,
    []
  );
  assert.equal(out.success, false);
  assert.equal(out.message, 'Sale hoặc Auditor không hợp lệ');
  assert.equal('assignments' in out, false, 'a failed save must not yield a list to display');
  assert.equal(reloaded, false);
});

test('Flow: saved but reload failed -> only server-returned rows are merged, previous kept', async () => {
  const previous = [asg({ id: 'OLD' })];
  const out = await persistAssignments(
    {
      create: async () => ({ message: 'ok', assignments: [serverRow] }),
      reload: async () => {
        throw new Error('network');
      },
    },
    request,
    previous
  );
  assert.equal(out.success, true);
  if (out.success) {
    assert.deepEqual(out.assignments.map((a) => a.id), ['ASG-NEW', 'OLD']);
    assert.equal(out.reloaded, false);
  }
});

// ---------------------------------------------------------------- HTTP client (fetch mocked)
const realFetch = globalThis.fetch;
const mockFetch = (impl: typeof fetch) => {
  globalThis.fetch = impl;
};

test('Client: createAssignments resolves with server rows on 201', async () => {
  mockFetch((async () =>
    new Response(JSON.stringify({ success: true, message: 'Đã lưu', data: [serverRow] }), { status: 201 })) as typeof fetch);
  try {
    const res = await createAssignments(request);
    assert.equal(res.assignments[0].id, 'ASG-NEW');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Client: HTTP 500 rejects with the server message (not swallowed, not a fake success)', async () => {
  mockFetch((async () => new Response(JSON.stringify({ error: 'violates foreign key constraint' }), { status: 500 })) as typeof fetch);
  try {
    await assert.rejects(() => createAssignments(request), /violates foreign key constraint/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Client: HTTP 409 conflict message is surfaced', async () => {
  mockFetch((async () => new Response(JSON.stringify({ error: 'Xung đột ngày hiệu lực', code: 'ASSIGNMENT_CONFLICT' }), { status: 409 })) as typeof fetch);
  try {
    await assert.rejects(() => createAssignments(request), /Xung đột ngày hiệu lực/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Client: network failure rejects and says the assignment was NOT saved', async () => {
  mockFetch((async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch);
  try {
    await assert.rejects(() => createAssignments(request), /CHƯA được lưu/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Client: 2xx without rows is NOT treated as success', async () => {
  mockFetch((async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch);
  try {
    await assert.rejects(() => createAssignments(request), /không thể xác nhận đã lưu/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
