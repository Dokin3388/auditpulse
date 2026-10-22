// AuditPulse - Unit Tests for Action Transitions & Assignment Intervals
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSaleMarkActionDone,
  canAuditorStartRecheck,
  canAuditorSubmitRecheck,
  canHeadAuditorWaiveAction,
  doIntervalsOverlap,
  getDayBefore,
  resolveAssignmentChain,
  getEffectiveAuditorForSale,
} from '../workflowRules.ts';
import type { AuditorAssignment, CorrectiveActionStatus } from '../../types/index.ts';

// ============================================================================
// SUITE 1: CORRECTIVE ACTION STATE TRANSITIONS
// ============================================================================

test('Action Transition: saleMarkActionDone only allows OPEN or REOPENED for assigned sale', () => {
  const baseAction = {
    saleId: 'SALE-01',
    saleName: 'Nam Vũ',
  };

  const saleOwner = { role: 'SALE' as const, saleId: 'SALE-01' };
  const otherSale = { role: 'SALE' as const, saleId: 'SALE-02' };
  const auditorUser = { role: 'AUDITOR' as const, auditorId: 'AUD-01' };

  // 1. Valid states
  assert.equal(
    canSaleMarkActionDone({ ...baseAction, status: 'OPEN' }, saleOwner).valid,
    true
  );
  assert.equal(
    canSaleMarkActionDone({ ...baseAction, status: 'REOPENED' }, saleOwner).valid,
    true
  );

  // 2. Disallowed states for sale
  const disallowedStatuses: CorrectiveActionStatus[] = [
    'SALE_MARKED_DONE',
    'IN_RECHECK',
    'VERIFIED_CLOSED',
    'WAIVED',
    'CANCELLED',
  ];

  for (const status of disallowedStatuses) {
    const res = canSaleMarkActionDone({ ...baseAction, status }, saleOwner);
    assert.equal(res.valid, false, `Should reject when status is ${status}`);
    assert.match(res.error || '', /Chuyển trạng thái không hợp lệ/);
  }

  // 3. Reject non-owner sale or other roles
  const resOther = canSaleMarkActionDone({ ...baseAction, status: 'OPEN' }, otherSale);
  assert.equal(resOther.valid, false);
  assert.match(resOther.error || '', /Từ chối quyền/);

  const resAuditor = canSaleMarkActionDone({ ...baseAction, status: 'OPEN' }, auditorUser);
  assert.equal(resAuditor.valid, false);
});

test('Action Transition: assigned auditor can start recheck without a sale self-confirmation', () => {
  const baseAction = {
    auditorId: 'AUD-01',
    auditorName: 'Linh Nguyễn',
  };

  const assignedAuditor = { role: 'AUDITOR' as const, auditorId: 'AUD-01' };
  const otherAuditor = { role: 'AUDITOR' as const, auditorId: 'AUD-02' };

  // 1. Valid: SALE_MARKED_DONE
  assert.equal(
    canAuditorStartRecheck({ ...baseAction, status: 'SALE_MARKED_DONE' }, assignedAuditor).valid,
    true
  );

  // 2. OPEN and REOPENED are also valid: Auditor owns the final verdict.
  assert.equal(canAuditorStartRecheck({ ...baseAction, status: 'OPEN' }, assignedAuditor).valid, true);
  assert.equal(canAuditorStartRecheck({ ...baseAction, status: 'REOPENED' }, assignedAuditor).valid, true);

  // 3. Disallowed states
  const invalidStatuses: CorrectiveActionStatus[] = [
    'IN_RECHECK',
    'VERIFIED_CLOSED',
    'WAIVED',
    'CANCELLED',
  ];

  for (const status of invalidStatuses) {
    const res = canAuditorStartRecheck({ ...baseAction, status }, assignedAuditor);
    assert.equal(res.valid, false, `Should reject when status is ${status}`);
    assert.match(res.error || '', /Chuyển trạng thái không hợp lệ/);
  }

  // 4. Other auditor
  const resOther = canAuditorStartRecheck({ ...baseAction, status: 'SALE_MARKED_DONE' }, otherAuditor);
  assert.equal(resOther.valid, false);
  assert.match(resOther.error || '', /Từ chối quyền/);
});

test('Action Transition: auditorSubmitRecheck only allows IN_RECHECK, IMPROVED -> VERIFIED_CLOSED, NOT_IMPROVED -> REOPENED with nextDueDate', () => {
  const baseAction = {
    auditorId: 'AUD-01',
    auditorName: 'Linh Nguyễn',
  };

  const assignedAuditor = { role: 'AUDITOR' as const, auditorId: 'AUD-01' };

  // 1. Valid IMPROVED from IN_RECHECK
  const resImproved = canAuditorSubmitRecheck(
    { ...baseAction, status: 'IN_RECHECK' },
    assignedAuditor,
    'IMPROVED'
  );
  assert.equal(resImproved.valid, true);

  // 2. Valid NOT_IMPROVED with valid nextDueDate
  const resNotImproved = canAuditorSubmitRecheck(
    { ...baseAction, status: 'IN_RECHECK' },
    assignedAuditor,
    'NOT_IMPROVED',
    '2026-10-25'
  );
  assert.equal(resNotImproved.valid, true);

  // 3. Invalid NOT_IMPROVED without nextDueDate
  const resNoDueDate = canAuditorSubmitRecheck(
    { ...baseAction, status: 'IN_RECHECK' },
    assignedAuditor,
    'NOT_IMPROVED',
    ''
  );
  assert.equal(resNoDueDate.valid, false);
  assert.match(resNoDueDate.error || '', /bắt buộc phải có ngày hạn xử lý mới/);

  // 4. Disallowed starting statuses (not IN_RECHECK)
  const invalidStatuses: CorrectiveActionStatus[] = [
    'OPEN',
    'SALE_MARKED_DONE',
    'REOPENED',
    'VERIFIED_CLOSED',
  ];

  for (const status of invalidStatuses) {
    const res = canAuditorSubmitRecheck({ ...baseAction, status }, assignedAuditor, 'IMPROVED');
    assert.equal(res.valid, false, `Should reject submission when status is ${status}`);
    assert.match(res.error || '', /Chuyển trạng thái không hợp lệ/);
  }
});

test('Action Transition: canHeadAuditorWaiveAction restricts role and closed states', () => {
  const headAuditor = { role: 'HEAD_AUDITOR' as const };
  const auditorUser = { role: 'AUDITOR' as const };

  assert.equal(canHeadAuditorWaiveAction({ status: 'OPEN' }, headAuditor, 'Miễn trừ do đổi quy trình').valid, true);
  assert.equal(canHeadAuditorWaiveAction({ status: 'OPEN' }, auditorUser, 'Reason').valid, false);
  assert.equal(canHeadAuditorWaiveAction({ status: 'VERIFIED_CLOSED' }, headAuditor, 'Reason').valid, false);
  assert.equal(canHeadAuditorWaiveAction({ status: 'OPEN' }, headAuditor, '').valid, false);
});

// ============================================================================
// SUITE 2: AUDITOR ASSIGNMENT INTERVALS & OVERLAP GUARANTEES
// ============================================================================

test('Interval Overlap Logic: doIntervalsOverlap correctly checks date bounds', () => {
  // getDayBefore helper
  assert.equal(getDayBefore('2026-10-27'), '2026-10-26');
  assert.equal(getDayBefore('2026-11-01'), '2026-10-31');

  // Adjacent non-overlapping
  assert.equal(doIntervalsOverlap('2026-08-01', '2026-10-26', '2026-10-27', null), false);
  assert.equal(doIntervalsOverlap('2026-10-27', '2026-11-02', '2026-11-03', null), false);

  // Overlapping on exact day
  assert.equal(doIntervalsOverlap('2026-08-01', '2026-10-27', '2026-10-27', null), true);

  // Fully contained
  assert.equal(doIntervalsOverlap('2026-08-01', null, '2026-09-01', '2026-09-15'), true);

  // Disjoint in past
  assert.equal(doIntervalsOverlap('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28'), false);
});

test('Assignment Chaining Scenario: A hiện hành -> B hiệu lực tuần sau -> C hiệu lực hai tuần sau without overlap', () => {
  const todayStr = '2026-10-20';

  // Initial State: Assignment A (Linh Nguyễn) active since 2026-08-01, open-ended
  const initialA: AuditorAssignment = {
    id: 'ASG-A',
    saleId: 'SALE-TEST',
    saleName: 'Test Sale',
    teamName: 'Team Test',
    auditorId: 'AUD-01',
    auditorName: 'Nguyễn Thùy Linh',
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    assignmentReason: 'Assignment A ban đầu',
    createdBy: 'Head Auditor',
    createdAt: '2026-08-01T08:00:00Z',
    isActive: true,
  };

  let assignments: AuditorAssignment[] = [initialA];

  // STEP 1: Head Auditor creates B starting next week (2026-10-27)
  const step1 = resolveAssignmentChain(assignments, {
    saleId: 'SALE-TEST',
    saleName: 'Test Sale',
    teamName: 'Team Test',
    auditorId: 'AUD-02',
    auditorName: 'Trần Quang Huy',
    effectiveFrom: '2026-10-27',
    reason: 'Chuyển giao B cho Huy TQ từ tuần sau',
    createdBy: 'Head Auditor',
    todayStr,
  });

  assert.equal(step1.success, true);
  assignments = step1.updatedAssignments!;
  assert.equal(assignments.length, 2);

  const asgAAfterStep1 = assignments.find((a) => a.id === 'ASG-A')!;
  const asgBAfterStep1 = assignments.find((a) => a.auditorId === 'AUD-02')!;

  // A must be closed at 2026-10-26 (day before B starts)
  assert.equal(asgAAfterStep1.effectiveTo, '2026-10-26');
  // A is still active today (2026-10-20 <= 2026-10-26)
  assert.equal(asgAAfterStep1.isActive, true);

  // B starts at 2026-10-27 and is open-ended
  assert.equal(asgBAfterStep1.effectiveFrom, '2026-10-27');
  assert.equal(asgBAfterStep1.effectiveTo, null);
  assert.equal(asgBAfterStep1.isActive, false); // future assignment

  // Zero overlap between A and B
  assert.equal(
    doIntervalsOverlap(
      asgAAfterStep1.effectiveFrom,
      asgAAfterStep1.effectiveTo,
      asgBAfterStep1.effectiveFrom,
      asgBAfterStep1.effectiveTo
    ),
    false
  );

  // STEP 2: Head Auditor creates C starting two weeks later (2026-11-03)
  const step2 = resolveAssignmentChain(assignments, {
    saleId: 'SALE-TEST',
    saleName: 'Test Sale',
    teamName: 'Team Test',
    auditorId: 'AUD-03',
    auditorName: 'Đỗ Thu Trang',
    effectiveFrom: '2026-11-03',
    reason: 'Chuyển giao C cho Trang ĐT từ tuần thứ hai',
    createdBy: 'Head Auditor',
    todayStr,
  });

  assert.equal(step2.success, true);
  assignments = step2.updatedAssignments!;
  assert.equal(assignments.length, 3);

  const finalA = assignments.find((a) => a.id === 'ASG-A')!;
  const finalB = assignments.find((a) => a.auditorId === 'AUD-02')!;
  const finalC = assignments.find((a) => a.auditorId === 'AUD-03')!;

  // Verify intervals:
  // A: [2026-08-01, 2026-10-26]
  assert.equal(finalA.effectiveFrom, '2026-08-01');
  assert.equal(finalA.effectiveTo, '2026-10-26');
  assert.equal(finalA.isActive, true);

  // B: [2026-10-27, 2026-11-02]
  assert.equal(finalB.effectiveFrom, '2026-10-27');
  assert.equal(finalB.effectiveTo, '2026-11-02');
  assert.equal(finalB.isActive, false);

  // C: [2026-11-03, null]
  assert.equal(finalC.effectiveFrom, '2026-11-03');
  assert.equal(finalC.effectiveTo, null);
  assert.equal(finalC.isActive, false);

  // Invariant 1: Exactly ONE assignment is open-ended (+inf)
  const openEndedList = assignments.filter((a) => !a.effectiveTo);
  assert.equal(openEndedList.length, 1);
  assert.equal(openEndedList[0].id, finalC.id);

  // Invariant 2: ZERO overlap among any pair
  assert.equal(doIntervalsOverlap(finalA.effectiveFrom, finalA.effectiveTo, finalB.effectiveFrom, finalB.effectiveTo), false);
  assert.equal(doIntervalsOverlap(finalB.effectiveFrom, finalB.effectiveTo, finalC.effectiveFrom, finalC.effectiveTo), false);
  assert.equal(doIntervalsOverlap(finalA.effectiveFrom, finalA.effectiveTo, finalC.effectiveFrom, finalC.effectiveTo), false);

  // Invariant 3: Querying effective auditor at different calendar dates
  // Today (2026-10-20) -> Auditor A (Linh Nguyễn)
  const auditorToday = getEffectiveAuditorForSale(assignments, 'SALE-TEST', '2026-10-20');
  assert.equal(auditorToday?.auditorId, 'AUD-01');

  // Next week (2026-10-28) -> Auditor B (Huy Trần)
  const auditorNextWeek = getEffectiveAuditorForSale(assignments, 'SALE-TEST', '2026-10-28');
  assert.equal(auditorNextWeek?.auditorId, 'AUD-02');

  // Two weeks later (2026-11-05) -> Auditor C (Trang Đỗ)
  const auditorTwoWeeks = getEffectiveAuditorForSale(assignments, 'SALE-TEST', '2026-11-05');
  assert.equal(auditorTwoWeeks?.auditorId, 'AUD-03');
});

test('Assignment Chaining: Rejects invalid overlap collisions', () => {
  const existing: AuditorAssignment[] = [
    {
      id: 'ASG-1',
      saleId: 'SALE-COLLISION',
      saleName: 'Sale Collision',
      teamName: 'Team',
      auditorId: 'AUD-01',
      auditorName: 'Linh',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-10-26',
      assignmentReason: 'R1',
      createdBy: 'Admin',
      createdAt: '2026-08-01',
      isActive: true,
    },
    {
      id: 'ASG-2',
      saleId: 'SALE-COLLISION',
      saleName: 'Sale Collision',
      teamName: 'Team',
      auditorId: 'AUD-02',
      auditorName: 'Huy',
      effectiveFrom: '2026-10-27',
      effectiveTo: null,
      assignmentReason: 'R2',
      createdBy: 'Admin',
      createdAt: '2026-10-18',
      isActive: false,
    },
  ];

  // 1. Same start date as existing
  const resSameStart = resolveAssignmentChain(existing, {
    saleId: 'SALE-COLLISION',
    saleName: 'Sale Collision',
    teamName: 'Team',
    auditorId: 'AUD-03',
    auditorName: 'Trang',
    effectiveFrom: '2026-10-27',
    reason: 'Trùng ngày bắt đầu',
    createdBy: 'Admin',
  });
  assert.equal(resSameStart.success, false);
  assert.match(resSameStart.message, /Đã có phân công khác/);

  // 2. Start date in the past before current open assignment
  const resPastStart = resolveAssignmentChain(existing, {
    saleId: 'SALE-COLLISION',
    saleName: 'Sale Collision',
    teamName: 'Team',
    auditorId: 'AUD-03',
    auditorName: 'Trang',
    effectiveFrom: '2026-09-15',
    reason: 'Trùng vào khoảng quá khứ',
    createdBy: 'Admin',
  });
  assert.equal(resPastStart.success, false);
});
