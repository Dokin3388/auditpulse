// AuditPulse - Pure Business Logic & Invariant Validation Layer
// Compliant with AuditFlow Operating Specification v1.1
import type {
  CorrectiveAction,
  AuditorAssignment,
  UserProfile,
  RecheckResult,
} from '../types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// 1. STATE TRANSITIONS FOR CORRECTIVE ACTIONS
// ============================================================================

/**
 * Validates whether a Sale can mark an action as done.
 * Invariants:
 * - Only the assigned sale owner can mark done.
 * - Allowed ONLY when action is in OPEN or REOPENED.
 * - Disallowed in SALE_MARKED_DONE, IN_RECHECK, VERIFIED_CLOSED, WAIVED, CANCELLED.
 */
export function canSaleMarkActionDone(
  action: Pick<CorrectiveAction, 'status' | 'saleId' | 'saleName'>,
  user: Pick<UserProfile, 'role' | 'saleId'>
): ValidationResult {
  if (user.role !== 'SALE' || user.saleId !== action.saleId) {
    return {
      valid: false,
      error: `Từ chối quyền: Chỉ Sale phụ trách (${action.saleName}) mới có quyền xác nhận đã thực hiện action này.`,
    };
  }

  if (action.status !== 'OPEN' && action.status !== 'REOPENED') {
    return {
      valid: false,
      error: `Chuyển trạng thái không hợp lệ: Sale chỉ có thể xác nhận khi action ở trạng thái OPEN hoặc REOPENED (hiện tại: ${action.status}). Không thể thay đổi action ở ${action.status}.`,
    };
  }

  return { valid: true };
}

/**
 * Validates whether an Auditor can start recheck.
 * Invariants:
 * - Only the assigned auditor can start recheck.
 * - Allowed when action is OPEN, REOPENED, or SALE_MARKED_DONE.
 * - Sale confirmation is optional evidence; the Auditor owns the final verdict.
 */
export function canAuditorStartRecheck(
  action: Pick<CorrectiveAction, 'status' | 'auditorId' | 'auditorName'>,
  user: Pick<UserProfile, 'role' | 'auditorId'>
): ValidationResult {
  if (user.role !== 'AUDITOR' || user.auditorId !== action.auditorId) {
    return {
      valid: false,
      error: `Từ chối quyền: Chỉ Auditor phụ trách action (${action.auditorName}) mới có quyền bắt đầu recheck.`,
    };
  }

  if (!['OPEN', 'REOPENED', 'SALE_MARKED_DONE'].includes(action.status)) {
    return {
      valid: false,
      error: `Chuyển trạng thái không hợp lệ: Auditor chỉ có thể bắt đầu kiểm tra khi action ở OPEN, REOPENED hoặc SALE_MARKED_DONE (hiện tại: ${action.status}).`,
    };
  }

  return { valid: true };
}

/**
 * Validates whether an Auditor can submit recheck result.
 * Invariants:
 * - Only the assigned auditor can submit.
 * - Allowed ONLY when action is in IN_RECHECK.
 * - IMPROVED can only transition to VERIFIED_CLOSED.
 * - NOT_IMPROVED can only transition to REOPENED and strictly requires nextDueDate.
 */
export function canAuditorSubmitRecheck(
  action: Pick<CorrectiveAction, 'status' | 'auditorId' | 'auditorName'>,
  user: Pick<UserProfile, 'role' | 'auditorId'>,
  result: RecheckResult,
  nextDueDate?: string
): ValidationResult {
  if (user.role !== 'AUDITOR' || user.auditorId !== action.auditorId) {
    return {
      valid: false,
      error: `Từ chối quyền: Chỉ Auditor phụ trách action (${action.auditorName}) mới có quyền kết luận recheck.`,
    };
  }

  if (action.status !== 'IN_RECHECK') {
    return {
      valid: false,
      error: `Chuyển trạng thái không hợp lệ: Chỉ có thể kết luận recheck khi action ở trạng thái IN_RECHECK (hiện tại: ${action.status}). Vui lòng bấm "Bắt đầu recheck" trước.`,
    };
  }

  if (result === 'NOT_IMPROVED') {
    if (!nextDueDate || !nextDueDate.trim()) {
      return {
        valid: false,
        error: 'Dữ liệu không hợp lệ: Kết luận NOT_IMPROVED bắt buộc phải có ngày hạn xử lý mới (nextDueDate) và lịch recheck tiếp theo.',
      };
    }
    const parsed = new Date(nextDueDate);
    if (isNaN(parsed.getTime())) {
      return {
        valid: false,
        error: 'Dữ liệu không hợp lệ: nextDueDate không phải là định dạng ngày hợp lệ.',
      };
    }
  }

  return { valid: true };
}

/**
 * Validates whether Head Auditor can waive/cancel an action.
 * Invariants:
 * - Only HEAD_AUDITOR or ADMIN.
 * - Cannot waive already closed/waived/cancelled action.
 */
export function canHeadAuditorWaiveAction(
  action: Pick<CorrectiveAction, 'status'>,
  user: Pick<UserProfile, 'role'>,
  reason: string
): ValidationResult {
  if (user.role !== 'HEAD_AUDITOR' && user.role !== 'ADMIN') {
    return {
      valid: false,
      error: 'Từ chối quyền: Chỉ Head Auditor hoặc Admin mới có quyền Miễn trừ/Hủy Action.',
    };
  }

  if (action.status === 'VERIFIED_CLOSED' || action.status === 'WAIVED' || action.status === 'CANCELLED') {
    return {
      valid: false,
      error: `Không thể miễn trừ: Action đã ở trạng thái kết thúc (${action.status}).`,
    };
  }

  if (!reason || !reason.trim()) {
    return {
      valid: false,
      error: 'Lý do miễn trừ không được để trống.',
    };
  }

  return { valid: true };
}

// ============================================================================
// 2. AUDITOR ASSIGNMENT INTERVALS & OVERLAP GUARANTEES
// ============================================================================

/**
 * Checks if two date intervals [from1, to1] and [from2, to2] overlap on any calendar day.
 * null represents positive infinity (+inf / open-ended).
 */
export function doIntervalsOverlap(
  from1: string,
  to1: string | null | undefined,
  from2: string,
  to2: string | null | undefined
): boolean {
  const end1 = to1 || '9999-12-31';
  const end2 = to2 || '9999-12-31';
  return from1 <= end2 && from2 <= end1;
}

/**
 * Returns the calendar date string (YYYY-MM-DD) for the day immediately before dateStr.
 */
export function getDayBefore(dateStr: string): string {
  // Pure UTC calendar arithmetic: independent of the runtime's timezone
  // (browser in Vietnam vs. Vercel in UTC must produce the same date).
  const d = new Date(`${normalizeDateOnly(dateStr)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Business calendar date (YYYY-MM-DD) in Vietnam (Asia/Ho_Chi_Minh, UTC+7, no DST).
 * `new Date().toISOString()` is UTC and is one day behind between 00:00-07:00 in Vietnam.
 */
export function vietnamToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

/**
 * Normalises DATE-like values to YYYY-MM-DD. Accepts 'YYYY-MM-DD', ISO timestamps
 * and Date objects (pg returns DATE columns as Date unless cast to text).
 */
export function normalizeDateOnly(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

/** True when `ref` identifies the assignment's sale by canonical id or by sale code. */
export function assignmentMatchesSale(
  assignment: Pick<AuditorAssignment, 'saleId' | 'saleCode'>,
  ref: string
): boolean {
  return assignment.saleId === ref || (!!assignment.saleCode && assignment.saleCode === ref);
}

export interface ResolveAssignmentParams {
  saleId: string;
  auditorId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason: string;
  createdBy: string;
  saleName: string;
  teamName: string;
  auditorName: string;
  todayStr?: string;
}

export interface ResolveAssignmentResult {
  success: boolean;
  message: string;
  updatedAssignments?: AuditorAssignment[];
}

/**
 * Resolves auditor assignment chain without interval overlap.
 * Invariants:
 * 1. A sale cannot have 2 assignments active on any single day.
 * 2. An open-ended assignment is closed at dayBefore(newEffectiveFrom).
 * 3. Cannot have two future assignments open-ended.
 * 4. Blocks invalid collisions or past insertions into fixed ranges.
 */
export function resolveAssignmentChain(
  allAssignments: AuditorAssignment[],
  params: ResolveAssignmentParams
): ResolveAssignmentResult {
  const {
    saleId,
    auditorId,
    effectiveFrom,
    effectiveTo = null,
    reason,
    createdBy,
    saleName,
    teamName,
    auditorName,
    todayStr = vietnamToday(),
  } = params;

  // Validate dates
  if (isNaN(new Date(effectiveFrom).getTime())) {
    return { success: false, message: 'Ngày hiệu lực bắt đầu (effectiveFrom) không hợp lệ.' };
  }
  if (effectiveTo && isNaN(new Date(effectiveTo).getTime())) {
    return { success: false, message: 'Ngày hiệu lực kết thúc (effectiveTo) không hợp lệ.' };
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return {
      success: false,
      message: 'Ngày kết thúc (effectiveTo) phải lớn hơn hoặc bằng ngày bắt đầu (effectiveFrom).',
    };
  }

  const existingForSale = allAssignments
    .filter((a) => assignmentMatchesSale(a, saleId))
    .map((a) => ({
      ...a,
      effectiveFrom: normalizeDateOnly(a.effectiveFrom),
      effectiveTo: normalizeDateOnly(a.effectiveTo) || null,
    }));

  // Check 1: Exact date collision on effectiveFrom
  const sameStart = existingForSale.find((a) => a.effectiveFrom === effectiveFrom);
  if (sameStart) {
    return {
      success: false,
      message: `Xung đột ngày hiệu lực: Đã có phân công khác (${sameStart.auditorName}) bắt đầu từ ngày ${effectiveFrom}. Một sale chỉ có đúng 1 auditor trong cùng một ngày.`,
    };
  }

  const dayBeforeStr = getDayBefore(effectiveFrom);

  // Check 2: Open-ended assignment handling
  const openEnded = existingForSale.find((a) => !a.effectiveTo);

  if (!effectiveTo) {
    // New assignment is open-ended
    if (openEnded) {
      if (effectiveFrom <= openEnded.effectiveFrom) {
        return {
          success: false,
          message: `Xung đột ngày hiệu lực: Không thể tạo phân công mở bắt đầu trước hoặc trùng với phân công mở hiện tại (${openEnded.effectiveFrom}).`,
        };
      }

      // Check if new start date falls into any fixed/closed assignment interval
      for (const asg of existingForSale) {
        if (asg.id !== openEnded.id) {
          if (doIntervalsOverlap(effectiveFrom, null, asg.effectiveFrom, asg.effectiveTo)) {
            return {
              success: false,
              message: `Xung đột ngày hiệu lực: Phân công mới (${effectiveFrom} trở đi) trùng với phân công đã có (${asg.auditorName}: ${asg.effectiveFrom} đến ${asg.effectiveTo}).`,
            };
          }
        }
      }
    } else {
      // No open-ended assignment exists; verify no overlap with any existing assignment
      for (const asg of existingForSale) {
        if (doIntervalsOverlap(effectiveFrom, null, asg.effectiveFrom, asg.effectiveTo)) {
          return {
            success: false,
            message: `Xung đột ngày hiệu lực: Phân công mới trùng với phân công đã có (${asg.auditorName}: ${asg.effectiveFrom} đến ${asg.effectiveTo}).`,
          };
        }
      }
    }
  } else {
    // New assignment has explicit effectiveTo
    for (const asg of existingForSale) {
      if (doIntervalsOverlap(effectiveFrom, effectiveTo, asg.effectiveFrom, asg.effectiveTo)) {
        return {
          success: false,
          message: `Xung đột ngày hiệu lực: Phân công mới (${effectiveFrom} đến ${effectiveTo}) trùng với phân công đã có (${asg.auditorName}: ${asg.effectiveFrom} đến ${asg.effectiveTo || 'hiện hành'}).`,
        };
      }
    }
  }

  // Create new assignment record
  const newAssignmentId = `ASG-${Date.now()}`;
  const isNewActiveToday =
    effectiveFrom <= todayStr && (!effectiveTo || effectiveTo >= todayStr);

  const newAssignment: AuditorAssignment = {
    id: newAssignmentId,
    saleId,
    saleName,
    teamName,
    auditorId,
    auditorName,
    effectiveFrom,
    effectiveTo,
    assignmentReason: reason,
    createdBy,
    createdAt: new Date().toISOString(),
    isActive: isNewActiveToday,
  };

  // Update existing assignments: close previous open-ended assignment if replacing
  const updatedAssignments = allAssignments.map((asg) => {
    if (assignmentMatchesSale(asg, saleId) && openEnded && asg.id === openEnded.id && !effectiveTo) {
      // Truncate previous open-ended assignment at day before new start
      const wasActiveToday =
        asg.effectiveFrom <= todayStr && todayStr <= dayBeforeStr;
      return {
        ...asg,
        effectiveTo: dayBeforeStr,
        isActive: wasActiveToday,
      };
    }
    // Re-evaluate isActive based on calendar date
    const isActive =
      asg.effectiveFrom <= todayStr && (!asg.effectiveTo || asg.effectiveTo >= todayStr);
    return { ...asg, isActive };
  });

  return {
    success: true,
    message: `Đã phân công ${saleName} cho ${auditorName} thành công từ ngày ${effectiveFrom}.${
      openEnded && !effectiveTo
        ? ` Phân công trước đó được chốt đến hết ngày ${dayBeforeStr}.`
        : ''
    }`,
    updatedAssignments: [newAssignment, ...updatedAssignments],
  };
}

/**
 * Resolves the effective auditor for a sale on a specific date.
 */
export function getEffectiveAuditorForSale(
  assignments: AuditorAssignment[],
  saleId: string,
  auditDate: string
): AuditorAssignment | undefined {
  return assignments.find((asg) => {
    if (!assignmentMatchesSale(asg, saleId)) return false;
    const startsBeforeOrOn = asg.effectiveFrom <= auditDate;
    const endsAfterOrOn = !asg.effectiveTo || asg.effectiveTo >= auditDate;
    return startsBeforeOrOn && endsAfterOrOn;
  });
}
