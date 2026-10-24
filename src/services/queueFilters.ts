// Pure helpers for the Audit Queue filters (kept free of React/Vite imports so
// they can be unit-tested with the node test runner).

export interface AuditorRef {
  id: string;
  auditorId?: string | null;
}

/** Queue rows reference an auditor by auditor code; user rows also have a login id. */
export const auditorFilterValue = (auditor: AuditorRef): string => auditor.auditorId || auditor.id;

export const UNASSIGNED_FILTER = 'UNASSIGNED';

export function matchesAuditorFilter(assignedAuditorId: string | null | undefined, selected: string): boolean {
  if (selected === 'ALL') return true;
  if (selected === UNASSIGNED_FILTER) return !assignedAuditorId;
  return assignedAuditorId === selected;
}

/** Live-computed tags and stored tags can describe the same rule; keep the first of each code. */
export function dedupeByCode<T extends { code: string }>(tags: T[]): T[] {
  const seen = new Set<string>();
  return tags.filter((tag) => (seen.has(tag.code) ? false : (seen.add(tag.code), true)));
}

/** "Chưa phân công" covers both legacy PENDING rows and UNASSIGNED rows created by the daily materializer. */
export function matchesStatusFilter(status: string, selected: string): boolean {
  if (selected === 'ALL') return true;
  if (selected === 'PENDING') return status === 'PENDING' || status === 'UNASSIGNED';
  return status === selected;
}
