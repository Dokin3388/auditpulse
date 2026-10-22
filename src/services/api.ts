import type {
  AuditQueueItem,
  AuditorAssignment,
  CorrectiveAction,
  RescuedOrder,
  RiskTag,
  RiskTagCode,
  UserProfile,
  IssueDefinition,
  RecheckResult,
} from '../types';

export interface GoogleSheetSyncRun {
  id: string;
  sourceId: 'sales-operations' | 'sale-issues' | 'audit-team';
  sheetName: string;
  deliveryId: string;
  receivedAt: string;
  completedAt?: string | null;
  status: 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  appliedRows: number;
  skippedRows: number;
  errorMessage?: string | null;
}

export interface SourceIssueLog {
  sourceRowKey: string;
  payload: Record<string, string>;
  lastSyncedAt: string;
}

export async function getAppUsers(): Promise<UserProfile[]> {
  return getList<UserProfile>('/api/users');
}

export async function getIssueDefinitions(): Promise<IssueDefinition[]> {
  return getList<IssueDefinition>('/api/issue-definitions');
}

export const todayInVietnam = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export async function materializeAuditQueue(auditDate = todayInVietnam()): Promise<void> {
  const response = await fetch('/api/queue/materialize-from-issue-logs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auditDate }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Không thể cập nhật Audit Queue từ nhật ký lỗi.');
  }
}

export async function createAssignment(input: {
  saleId: string;
  auditorId: string;
  effectiveFrom: string;
  reason: string;
}): Promise<void> {
  const response = await fetch('/api/assignments', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Không thể lưu phân công lên Neon.');
  }
}

export async function bootstrapAuditorAccounts(): Promise<Array<{ id: string; name: string; email: string; password: string }>> {
  const response = await fetch('/api/admin/bootstrap-auditors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const payload = (await response.json().catch(() => null)) as { accounts?: Array<{ id: string; name: string; email: string; password: string }>; error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || 'Không thể tạo tài khoản Auditor.');
  return payload?.accounts || [];
}

interface ApiListResponse<T> {
  data: T[];
}

async function getList<T>(path: string): Promise<T[]> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Không thể tải dữ liệu: ${path}`);
  const payload = (await response.json()) as ApiListResponse<T>;
  return payload.data;
}

const riskTagLabels: Record<RiskTagCode, string> = {
  YESTERDAY_CUSTOMERS: 'Khách trong 2 ngày trước',
  NO_QUOTATION: 'Chưa báo giá',
  QUOTED_NOT_ORDERED: 'Báo giá chưa chốt',
};

function normalizeRiskTags(input: unknown): RiskTag[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((tag): RiskTag[] => {
    if (typeof tag === 'string' && tag in riskTagLabels) {
      const code = tag as RiskTagCode;
      return [{ code, label: riskTagLabels[code], description: '', detectedAt: new Date().toISOString() }];
    }
    if (tag && typeof tag === 'object' && 'code' in tag) {
      return [tag as RiskTag];
    }
    return [];
  });
}

export async function getAuditQueue(): Promise<AuditQueueItem[]> {
  const items = await getList<AuditQueueItem & { riskTags?: unknown }>('/api/queue');
  return items.map((item) => ({
    ...item,
    riskTags: normalizeRiskTags(item.riskTags),
    assignedAt: item.assignedAt || item.syncTimestamp || new Date().toISOString(),
    customerPhone: item.customerPhone || '—',
    customerFirstSeen: item.customerFirstSeen || item.auditDate,
  }));
}

export async function getCorrectiveActions(): Promise<CorrectiveAction[]> {
  const actions = await getList<Partial<CorrectiveAction>>('/api/actions');
  return actions.map((action) => ({
    id: action.id || '',
    code: action.code || '',
    caseId: action.caseId || '',
    queueItemId: action.queueItemId || '',
    customerId: action.customerId || '',
    customerName: action.customerName || 'Khách hàng chưa xác định',
    customerPhone: action.customerPhone || '—',
    saleId: action.saleId || '',
    saleName: action.saleName || '—',
    teamId: action.teamId || '',
    teamName: action.teamName || '—',
    auditorId: action.auditorId || '',
    auditorName: action.auditorName || '—',
    issueCode: action.issueCode || '',
    issueName: action.issueName || '',
    severity: action.severity || 'MEDIUM',
    status: action.status || 'OPEN',
    createdAt: action.createdAt || new Date().toISOString(),
    dueDate: action.dueDate || new Date().toISOString(),
    slaRuleVersion: action.slaRuleVersion || '',
    completionCriteria: action.completionCriteria || '',
    guidanceNotes: action.guidanceNotes || '',
    saleMarkedDone: Boolean(action.saleMarkedDone),
    saleMarkedDoneAt: action.saleMarkedDoneAt,
    saleNotes: action.saleNotes,
    saleEvidenceList: action.saleEvidenceList || [],
    rechecks: action.rechecks || [],
    auditorEvidenceList: action.auditorEvidenceList || [],
    waiveReason: action.waiveReason,
    waiveApprovedBy: action.waiveApprovedBy,
    isOverdue: Boolean(action.isOverdue),
  }));
}

export async function startActionRecheck(actionId: string): Promise<void> {
  const response = await fetch(`/api/actions/${encodeURIComponent(actionId)}/start-recheck`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Không thể bắt đầu kiểm tra action.');
  }
}

export async function submitActionRecheck(input: {
  actionId: string;
  result: RecheckResult;
  notes: string;
  nextDueDate?: string;
}): Promise<void> {
  const response = await fetch(`/api/actions/${encodeURIComponent(input.actionId)}/submit-recheck`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result: input.result, notes: input.notes, nextDueDate: input.nextDueDate }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Không thể lưu kết luận của Auditor.');
  }
}

export function getAuditorAssignments(): Promise<AuditorAssignment[]> {
  return getList<AuditorAssignment>('/api/assignments');
}

export async function getRescuedOrders(): Promise<RescuedOrder[]> {
  const orders = await getList<Partial<RescuedOrder>>('/api/reports/rescued-orders');
  return orders.map((order) => ({
    id: `${order.actionId || 'action'}-${order.orderId || 'order'}`,
    customerId: order.customerId || '',
    customerName: order.customerName || 'Khách hàng chưa xác định',
    actionId: order.actionId || '',
    actionCode: order.actionCode || '',
    orderId: order.orderId || '',
    orderCode: order.orderCode || '',
    orderDate: order.orderDate || '',
    orderValue: Number(order.orderValue || 0),
    attributionStatus: order.attributionStatus || 'UNATTRIBUTED',
    auditorId: order.auditorId || '',
    auditorName: order.auditorName || order.auditorId || '—',
    saleId: order.saleId || '',
    saleName: order.saleName || order.saleId || '—',
    windowDays: Number(order.windowDays || 0),
  }));
}

export async function getGoogleSheetSyncRuns(): Promise<GoogleSheetSyncRun[]> {
  return getList<GoogleSheetSyncRun>('/api/sync/google-sheets/status');
}

export async function getSourceIssueLogs(limit = 100): Promise<{ data: SourceIssueLog[]; total: number }> {
  const response = await fetch(`/api/sync/google-sheets/issue-logs?limit=${encodeURIComponent(limit)}`);
  if (!response.ok) throw new Error('Không thể tải nhật ký lỗi Sale từ Neon.');
  return (await response.json()) as { data: SourceIssueLog[]; total: number };
}

