// AuditPulse - Server-first assignment save flow (framework independent, unit-testable).
//
// Contract: the returned list of assignments is built ONLY from data the server
// returned. A failed save never produces a new list, so the UI cannot display an
// assignment that does not exist in PostgreSQL.
import type { AuditorAssignment } from '../types';

export interface AssignmentFlowDeps {
  create: (request: {
    saleIds: string[];
    auditorId: string;
    effectiveFrom: string;
    reason: string;
  }) => Promise<{ message: string; assignments: AuditorAssignment[] }>;
  reload: () => Promise<AuditorAssignment[]>;
}

export type AssignmentFlowResult =
  | { success: false; message: string }
  | { success: true; message: string; assignments: AuditorAssignment[]; saved: AuditorAssignment[]; reloaded: boolean };

export async function persistAssignments(
  deps: AssignmentFlowDeps,
  request: { saleIds: string[]; auditorId: string; effectiveFrom: string; reason: string },
  previous: AuditorAssignment[]
): Promise<AssignmentFlowResult> {
  let saved: { message: string; assignments: AuditorAssignment[] };
  try {
    saved = await deps.create(request);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Không thể lưu phân công.' };
  }

  try {
    const fresh = await deps.reload();
    return { success: true, message: saved.message, assignments: fresh, saved: saved.assignments, reloaded: true };
  } catch {
    // Saved, but the reload failed: merge the rows the server just returned (server data only).
    const savedIds = new Set(saved.assignments.map((row) => row.id));
    return {
      success: true,
      message: saved.message,
      assignments: [...saved.assignments, ...previous.filter((row) => !savedIds.has(row.id))],
      saved: saved.assignments,
      reloaded: false,
    };
  }
}
