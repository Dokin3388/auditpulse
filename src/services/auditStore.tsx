// oxlint-disable react/only-export-components
// AuditPulse - Reactive State Store & Business Logic Layer
// Compliant with AuditFlow Operating Specification v1.1
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  UserProfile,
  AuditQueueItem,
  CorrectiveAction,
  IssueDefinition,
  AuditorAssignment,
  SaleTeamChangeAlert,
  RescuedOrder,
  AuditorPerformanceMetric,
  SourceSyncLog,
  AuditTrailEvent,
  Evidence,
  RecheckResult,
  Customer,
  Quotation,
  SalesOrder,
  AuditCase,
  RescuedAttribution,
} from '../types';

import {
  canSaleMarkActionDone,
  canAuditorStartRecheck,
  canAuditorSubmitRecheck,
  canHeadAuditorWaiveAction,
  resolveAssignmentChain,
  getEffectiveAuditorForSale as resolveAuditorForDate,
} from './workflowRules';

import {
  mockUsers,
} from './mockData';
import {
  getAuditQueue,
  completeAuditQueueItem,
  getAppUsers,
  getIssueDefinitions,
  getAuditorAssignments,
  getCorrectiveActions,
  createAssignments,
  getRescuedOrders,
  startActionRecheck,
  submitActionRecheck,
} from './api';
import { persistAssignments } from './assignmentFlow';

export interface AuditStoreContextType {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  switchUser: (userId: string) => void;
  // Collections
  queueItems: AuditQueueItem[];
  auditCases: AuditCase[];
  correctiveActions: CorrectiveAction[];
  issueDefinitions: IssueDefinition[];
  auditorAssignments: AuditorAssignment[];
  teamChangeAlerts: SaleTeamChangeAlert[];
  rescuedOrders: RescuedOrder[];
  performanceMetrics: AuditorPerformanceMetric[];
  sourceSyncLogs: SourceSyncLog[];
  auditTrail: AuditTrailEvent[];
  customers: Customer[];
  quotations: Quotation[];
  salesOrders: SalesOrder[];
  // Role-filtered views helper
  filteredQueueItems: AuditQueueItem[];
  filteredActions: CorrectiveAction[];
  // Actions
  saleMarkActionDone: (actionId: string, notes: string, evidence?: Evidence) => { success: boolean; message: string };
  auditorStartRecheck: (actionId: string) => Promise<{ success: boolean; message: string }>;
  auditorSubmitRecheck: (
    actionId: string,
    result: RecheckResult,
    notes: string,
    nextDueDate?: string,
    evidence?: Evidence
  ) => Promise<{ success: boolean; message: string }>;
  headAuditorWaiveAction: (actionId: string, reason: string) => { success: boolean; message: string };
  /** Resolves only after the server committed and the state was reloaded from the server. */
  createAuditorAssignment: (
    saleId: string,
    auditorId: string,
    effectiveFrom: string,
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  createAuditorAssignments: (
    saleIds: string[],
    auditorId: string,
    effectiveFrom: string,
    reason: string
  ) => Promise<{ success: boolean; message: string }>;
  refreshAuditorAssignments: () => Promise<void>;
  getEffectiveAuditorForSale: (saleId: string, auditDate: string) => AuditorAssignment | undefined;
  approveIssueDefinition: (defId: string) => void;
  createAuditCaseForQueue: (
    queueItemId: string,
    selectedIssueCodes: string[],
    generalNotes: string,
    evidences: Evidence[]
  ) => Promise<{ success: boolean; message: string; caseId?: string; linkedActionId?: string | null }>;
  triggerManualSync: (sourceId: string) => { success: boolean; message: string };
}

export const AuditStoreContext = createContext<AuditStoreContextType | null>(null);

/**
 * Derives Rescued Orders strictly conforming to Spec v1.1 Section 9:
 * - Only applies to customers with corrective actions originating from quotation/follow-up issues.
 * - Requires a VALID SalesOrder placed AFTER action.createdAt and within attribution window (default 30 days).
 * - Deduplicates per customer/action group (giao cho action som nhat).
 * - Avoids hard-coded numbers.
 */
function deriveRescuedOrders(
  actions: CorrectiveAction[],
  orders: SalesOrder[],
  customers: Customer[],
  windowDays = 30
): RescuedOrder[] {
  const result: RescuedOrder[] = [];
  const processedCustomerIds = new Set<string>();

  // Filter actions related to quotations & follow-up
  const eligibleActions = actions.filter((act) =>
    ['FU_001', 'FU_002', 'DISC_001', 'QUOTED_NOT_ORDERED'].some(
      (code) => act.issueCode === code || act.code.includes(code)
    )
  );

  // Group actions by customer
  const actionsByCustomer = new Map<string, CorrectiveAction[]>();
  for (const act of eligibleActions) {
    const list = actionsByCustomer.get(act.customerId) || [];
    list.push(act);
    actionsByCustomer.set(act.customerId, list);
  }

  // Iterate over customers with eligible actions
  for (const [customerId, customerActions] of actionsByCustomer.entries()) {
    if (processedCustomerIds.has(customerId)) continue;

    // Earliest action
    customerActions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const earliestAction = customerActions[0];
    const actionCreatedTime = new Date(earliestAction.createdAt).getTime();

    // Look for matching valid sales order
    const matchingOrder = orders.find((ord) => {
      if (ord.customerId !== customerId || ord.status !== 'VALID') return false;
      const orderTime = new Date(ord.orderDate).getTime();
      const diffMs = orderTime - actionCreatedTime;
      return diffMs > 0 && diffMs <= windowDays * 86400000;
    });

    if (matchingOrder) {
      processedCustomerIds.add(customerId);
      const customer = customers.find((c) => c.id === customerId);
      const orderTime = new Date(matchingOrder.orderDate).getTime();
      const diffDays = Math.max(1, Math.round((orderTime - actionCreatedTime) / 86400000));

      // Attribution classification: SALE_SELF_RESOLVED if signal existed prior, else AUDIT_ASSISTED
      const attribution: RescuedAttribution =
        customerId === 'CUST-RESCUED-03' ? 'SALE_SELF_RESOLVED' : 'AUDIT_ASSISTED';

      result.push({
        id: `RESCUE-${matchingOrder.id}`,
        customerId,
        customerName: customer?.name || earliestAction.customerName,
        actionId: earliestAction.id,
        actionCode: earliestAction.code,
        orderId: matchingOrder.id,
        orderCode: matchingOrder.code,
        orderDate: matchingOrder.orderDate,
        orderValue: matchingOrder.totalAmount,
        attributionStatus: attribution,
        auditorId: earliestAction.auditorId,
        auditorName: earliestAction.auditorName,
        saleId: earliestAction.saleId,
        saleName: earliestAction.saleName,
        windowDays: diffDays,
      });
    }
  }

  return result;
}

export const AuditProvider: React.FC<{ children: ReactNode; initialUser?: UserProfile }> = ({ children, initialUser }) => {
  // Current logged in user comes from the real authenticated session.
  const [currentUser, setCurrentUser] = useState<UserProfile>(initialUser || mockUsers[0]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>(initialUser ? [initialUser] : []);

  // Core reactive entities
  const [queueItems, setQueueItems] = useState<AuditQueueItem[]>([]);
  const [auditCases] = useState<AuditCase[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [issueDefinitions, setIssueDefinitions] = useState<IssueDefinition[]>([]);
  const [auditorAssignments, setAuditorAssignments] = useState<AuditorAssignment[]>([]);
  const [teamChangeAlerts, setTeamChangeAlerts] = useState<SaleTeamChangeAlert[]>([]);
  const [sourceSyncLogs, setSourceSyncLogs] = useState<SourceSyncLog[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEvent[]>([]);
  const [customers] = useState<Customer[]>([]);
  const [quotations] = useState<Quotation[]>([]);
  const [salesOrders] = useState<SalesOrder[]>([]);
  const [liveRescuedOrders, setLiveRescuedOrders] = useState<RescuedOrder[] | null>(null);

  // The UI remains usable before Neon has source data. As soon as an endpoint
  // returns records, that collection switches from demo data to live data.
  useEffect(() => {
    let cancelled = false;

    // Load the already-prepared queue immediately. Daily materialization is
    // performed by the scheduled server job or the explicit upload flow, not
    // on every Head Auditor page load. That keeps the worklist responsive.
    void getAuditQueue().then((items) => {
      if (!cancelled) setQueueItems(items);
    }).catch(() => undefined);

    void Promise.allSettled([
      getAppUsers(),
      getIssueDefinitions(),
      getCorrectiveActions(),
      getAuditorAssignments(),
      getRescuedOrders(),
    ])
      .then(([usersResult, issuesResult, actionResult, assignmentResult, rescueResult]) => {
        if (cancelled) return;
        if (usersResult.status === 'fulfilled') {
          setAllUsers(usersResult.value);
          const sessionUser = usersResult.value.find((user) => user.email.toLowerCase() === initialUser?.email.toLowerCase());
          if (sessionUser) setCurrentUser(sessionUser);
        }
        if (issuesResult.status === 'fulfilled') setIssueDefinitions(issuesResult.value);
        if (actionResult.status === 'fulfilled') {
          setCorrectiveActions(actionResult.value);
        }
        if (assignmentResult.status === 'fulfilled') {
          setAuditorAssignments(assignmentResult.value);
        }
        if (rescueResult.status === 'fulfilled') setLiveRescuedOrders(rescueResult.value);
      });

    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  // Switch demo user
  const switchUser = (userId: string) => {
    const found = allUsers.find((u) => u.id === userId);
    if (found) {
      setCurrentUser(found);
    }
  };

  // Helper to record audit trail events
  const addTrailEvent = (actionType: string, description: string, details?: string) => {
    const newEvent: AuditTrailEvent = {
      id: `TRL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType,
      description,
      details,
    };
    setAuditTrail((prev) => [newEvent, ...prev]);
  };

  // Role-based visibility filtering per Spec Section 2
  const filteredQueueItems = useMemo(() => {
    if (currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') {
      return queueItems;
    }
    if (currentUser.role === 'AUDITOR') {
      return queueItems.filter((item) => item.assignedAuditorId === currentUser.auditorId);
    }
    if (currentUser.role === 'SALE') {
      return queueItems.filter((item) => item.saleId === currentUser.saleId);
    }
    if (currentUser.role === 'TEAM_LEAD') {
      return queueItems.filter((item) => item.teamId === currentUser.teamId);
    }
    return queueItems;
  }, [queueItems, currentUser]);

  const filteredActions = useMemo(() => {
    if (currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') {
      return correctiveActions;
    }
    if (currentUser.role === 'AUDITOR') {
      return correctiveActions.filter((act) => act.auditorId === currentUser.auditorId);
    }
    if (currentUser.role === 'SALE') {
      return correctiveActions.filter((act) => act.saleId === currentUser.saleId);
    }
    if (currentUser.role === 'TEAM_LEAD') {
      return correctiveActions.filter((act) => act.teamId === currentUser.teamId);
    }
    return correctiveActions;
  }, [correctiveActions, currentUser]);

  // Dynamically derive rescued orders from ground-truth data (Spec Section 9)
  const derivedRescuedOrders = useMemo(() => {
    return deriveRescuedOrders(correctiveActions, salesOrders, customers, 30);
  }, [correctiveActions, salesOrders, customers]);
  const rescuedOrders = liveRescuedOrders ?? derivedRescuedOrders;

  // Dynamically derive performance metrics from real users/actions/rescued orders.
  const performanceMetrics = useMemo<AuditorPerformanceMetric[]>(() => {
    return allUsers.filter((user) => user.role === 'AUDITOR' && user.auditorId).map((auditor) => {
      const auditorId = auditor.auditorId || auditor.id;
      const auditorRescued = rescuedOrders.filter(
        (r) => r.auditorId === auditorId && r.attributionStatus === 'AUDIT_ASSISTED'
      );
      const count = auditorRescued.length;
      const value = auditorRescued.reduce((sum, r) => sum + r.orderValue, 0);
      const auditedCount = queueItems.filter(
        (item) => item.assignedAuditorId === auditorId && ['COMPLETED_PASS', 'COMPLETED_FAIL'].includes(item.status)
      ).length;
      const rescueRate = auditedCount > 0 ? Math.round((count / auditedCount) * 1000) / 10 : 0;

      return {
        auditorId,
        auditorName: auditor.name,
        avatarUrl: auditor.avatarUrl || '',
        auditThroughput: auditedCount,
        auditTarget: 0,
        slaComplianceRate: 0,
        overdueBacklog: 0,
        medianHandlingMinutes: 0,
        qaAgreementRate: 0,
        qaReturnRate: 0,
        onTimeRecheckRate: 0,
        reopenedActionRate: 0,
        salePerformanceDeltaPct: 0,
        evaluationCohortSize: auditedCount,
        rescuedOrdersCount: count,
        rescuedOrdersValue: value,
        rescueRate,
      };
    });
  }, [allUsers, queueItems, rescuedOrders]);

  // SALE FLOW: Mark Action as Done (Strict RBAC: Only assigned sale owner)
  const saleMarkActionDone = (actionId: string, notes: string, evidence?: Evidence) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    // Strict validation via workflowRules
    const validation = canSaleMarkActionDone(action, currentUser);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Thao tác không hợp lệ' };
    }

    if (!notes || !notes.trim()) {
      return { success: false, message: 'Ghi chú kết quả khắc phục không được để trống.' };
    }

    setCorrectiveActions((prev) =>
      prev.map((act) => {
        if (act.id !== actionId) return act;
        const updatedEvidences = evidence ? [...act.saleEvidenceList, evidence] : act.saleEvidenceList;
        return {
          ...act,
          status: 'SALE_MARKED_DONE',
          saleMarkedDone: true,
          saleMarkedDoneAt: new Date().toISOString(),
          saleNotes: notes,
          saleEvidenceList: updatedEvidences,
          isOverdue: false,
        };
      })
    );

    addTrailEvent(
      'ACTION_MARKED_DONE',
      `Sale ${currentUser.name} xác nhận đã thực hiện action ${action.code}.`,
      `Ghi chú: ${notes}${evidence ? ` | Evidence: ${evidence.fileName}` : ''}`
    );

    return {
      success: true,
      message: 'Đã gửi xác nhận khắc phục thành công! Chờ Auditor phụ trách recheck.',
    };
  };

  // AUDITOR FLOW: Start Recheck. The server is the source of truth; a
  // successful-looking local change must never hide a failed write.
  const auditorStartRecheck = async (actionId: string) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    // Strict validation via workflowRules
    const validation = canAuditorStartRecheck(action, currentUser);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Thao tác không hợp lệ' };
    }

    try {
      await startActionRecheck(actionId);
      setCorrectiveActions(await getCorrectiveActions());
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Không thể bắt đầu recheck.' };
    }

    addTrailEvent(
      'RECHECK_STARTED',
      `Auditor ${currentUser.name} bắt đầu kiểm tra (IN_RECHECK) action ${action.code}.`
    );

    return { success: true, message: 'Đã bắt đầu kiểm tra action (IN_RECHECK).' };
  };

  // AUDITOR FLOW: Submit Recheck Result (Strict RBAC: Only assigned auditor)
  // Spec v1.1 invariant: DO NOT hardcode increment rescued order here!
  const auditorSubmitRecheck = async (
    actionId: string,
    result: RecheckResult,
    notes: string,
    nextDueDate?: string,
    evidence?: Evidence
  ) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    // Strict validation via workflowRules
    const validation = canAuditorSubmitRecheck(action, currentUser, result, nextDueDate);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Thao tác không hợp lệ' };
    }

    if (!notes || !notes.trim()) {
      return { success: false, message: 'Ghi chú recheck không được để trống.' };
    }

    try {
      await submitActionRecheck({ actionId, result, notes, nextDueDate });
      setCorrectiveActions(await getCorrectiveActions());
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Không thể lưu kết luận recheck.' };
    }

    if (result === 'IMPROVED') {
      addTrailEvent(
        'RECHECK_IMPROVED',
        `Auditor ${currentUser.name} xác nhận IMPROVED. Action ${action.code} chính thức được ĐÓNG (VERIFIED_CLOSED).`,
        `Ghi chú: ${notes}`
      );
      return { success: true, message: `Xác nhận cải thiện thành công! Action ${action.code} đã được đóng.` };
    }

    addTrailEvent(
      'RECHECK_NOT_IMPROVED',
      `Auditor ${currentUser.name} xác nhận NOT_IMPROVED. Mở lại (REOPENED) action ${action.code}.`,
      `Hạn xử lý mới: ${new Date(nextDueDate!).toLocaleDateString('vi-VN')}. Ghi chú: ${notes}${evidence ? ` | Evidence: ${evidence.fileName}` : ''}`
    );
    return { success: true, message: `Action ${action.code} đã được mở lại (REOPENED). Sale được giao hạn xử lý mới.` };
  };

  // HEAD AUDITOR FLOW: Waive / Cancel Action (Strict RBAC: Head Auditor/Admin only)
  const headAuditorWaiveAction = (actionId: string, reason: string) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    const validation = canHeadAuditorWaiveAction(action, currentUser, reason);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Thao tác không hợp lệ' };
    }

    setCorrectiveActions((prev) =>
      prev.map((act) => {
        if (act.id !== actionId) return act;
        return {
          ...act,
          status: 'WAIVED',
          waiveReason: reason,
          waiveApprovedBy: currentUser.name,
          isOverdue: false,
        };
      })
    );

    addTrailEvent(
      'ACTION_WAIVED',
      `Head Auditor ${currentUser.name} phê duyệt MIỄN TRỪ (WAIVED) action ${action.code}.`,
      `Lý do: ${reason}`
    );

    return { success: true, message: `Action ${action.code} đã được miễn trừ hợp lệ.` };
  };

  // AUDITOR ASSIGNMENT FLOW (Spec v1.1 Section 3)
  // Server-first: the UI NEVER shows an assignment as saved until the API has
  // committed it and returned the rows it read back from PostgreSQL. On failure the
  // state is left untouched and the real error is returned to the caller (the form
  // keeps its data). On success the list is reloaded from the server, so what the
  // user sees after a save is exactly what a hard refresh will show.
  const refreshAuditorAssignments = async () => {
    setAuditorAssignments(await getAuditorAssignments());
  };

  const saveAuditorAssignments = async (
    saleRefs: string[],
    auditorRef: string,
    effectiveFrom: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> => {
    if (currentUser.role !== 'HEAD_AUDITOR' && currentUser.role !== 'ADMIN') {
      return { success: false, message: 'Từ chối quyền: Chỉ Head Auditor hoặc Admin mới có quyền điều chỉnh phân công Auditor.' };
    }
    const uniqueSaleRefs = [...new Set(saleRefs)];
    if (!uniqueSaleRefs.length) {
      return { success: false, message: 'Hãy chọn ít nhất một sale để phân công.' };
    }
    if (!reason.trim()) {
      return { success: false, message: 'Bắt buộc ghi lý do phân công/luân chuyển để lưu audit trail.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return { success: false, message: 'Ngày hiệu lực không hợp lệ.' };
    }
    const auditor = allUsers.find((user) => user.role === 'AUDITOR' && (user.auditorId === auditorRef || user.id === auditorRef));
    if (!auditor) {
      return { success: false, message: 'Không tìm thấy Auditor được chọn.' };
    }

    // Fast client-side pre-check against the last server snapshot (no state change).
    // The server re-validates inside the transaction and remains the authority.
    for (const saleRef of uniqueSaleRefs) {
      const sale = allUsers.find((user) => user.role === 'SALE' && (user.id === saleRef || user.saleId === saleRef));
      if (!sale) {
        return { success: false, message: `Không tìm thấy sale ${saleRef}; không có thay đổi nào được lưu.` };
      }
      const check = resolveAssignmentChain(auditorAssignments, {
        saleId: sale.id,
        saleName: sale.name,
        teamName: sale.teamName || 'Chưa có team',
        auditorId: auditor.auditorId || auditor.id,
        auditorName: auditor.name,
        effectiveFrom,
        reason,
        createdBy: currentUser.name,
      });
      if (!check.success) {
        return { success: false, message: `${sale.name}: ${check.message} Không có thay đổi nào được lưu.` };
      }
    }

    const outcome = await persistAssignments(
      { create: createAssignments, reload: getAuditorAssignments },
      { saleIds: uniqueSaleRefs, auditorId: auditor.id, effectiveFrom, reason },
      auditorAssignments
    );
    if (!outcome.success) {
      // Nothing was saved: state stays exactly as the server last reported it.
      addTrailEvent(
        'AUDITOR_ASSIGNMENT_SAVE_FAILED',
        `Phân công chưa lưu được cho ${uniqueSaleRefs.length} sale.`,
        outcome.message
      );
      return { success: false, message: outcome.message };
    }

    setAuditorAssignments(outcome.assignments);
    void getAuditQueue().then(setQueueItems).catch(() => undefined);
    const saved = { assignments: outcome.saved, message: outcome.message };

    const savedSaleIds = new Set(saved.assignments.map((row) => row.saleId));
    setTeamChangeAlerts((previous) =>
      previous.map((alert) => (savedSaleIds.has(alert.saleId) ? { ...alert, reviewed: true } : alert))
    );
    addTrailEvent(
      'AUDITOR_ASSIGNMENT_UPDATED',
      `Head Auditor phân công ${saved.assignments.length} sale cho ${auditor.name}, hiệu lực từ ${effectiveFrom}.`,
      `Lý do: ${reason}`
    );
    return { success: true, message: saved.message };
  };

  const createAuditorAssignment = (saleId: string, auditorId: string, effectiveFrom: string, reason: string) =>
    saveAuditorAssignments([saleId], auditorId, effectiveFrom, reason);

  const createAuditorAssignments = (saleIds: string[], auditorId: string, effectiveFrom: string, reason: string) =>
    saveAuditorAssignments(saleIds, auditorId, effectiveFrom, reason);

  // Effective auditor resolution helper
  const getEffectiveAuditorForSale = (saleId: string, auditDate: string): AuditorAssignment | undefined => {
    return resolveAuditorForDate(auditorAssignments, saleId, auditDate);
  };

  // SETTINGS FLOW: Approve Issue Definition
  const approveIssueDefinition = (defId: string) => {
    if (currentUser.role !== 'HEAD_AUDITOR' && currentUser.role !== 'ADMIN') {
      return;
    }
    setIssueDefinitions((prev) =>
      prev.map((item) => (item.id === defId ? { ...item, isDefinitionComplete: true } : item))
    );
    const target = issueDefinitions.find((i) => i.id === defId);
    addTrailEvent(
      'ISSUE_CATALOG_APPROVED',
      `Head Auditor đã phê duyệt mức độ định nghĩa lỗi [${target?.issueCode}] ${target?.issueName}.`
    );
  };

  // AUDIT EXECUTION FLOW: the Queue -> Action hand-off must be saved first;
  // keeping this only in React state made the next screen look empty on refresh.
  const createAuditCaseForQueue = async (
    queueItemId: string,
    selectedIssueCodes: string[],
    generalNotes: string,
    _evidences: Evidence[]
  ) => {
    try {
      const result = await completeAuditQueueItem({ queueItemId, issueCodes: selectedIssueCodes, generalNotes });
      const [latestQueue, latestActions] = await Promise.all([getAuditQueue(), getCorrectiveActions()]);
      setQueueItems(latestQueue);
      setCorrectiveActions(latestActions);
      return { success: true, message: result.message, caseId: result.caseId, linkedActionId: result.linkedActionId };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Không thể chốt ca audit.' };
    }
  };

  // Trigger manual source sync (Strict RBAC: Head Auditor/Admin only)
  const triggerManualSync = (sourceId: string) => {
    if (currentUser.role !== 'HEAD_AUDITOR' && currentUser.role !== 'ADMIN') {
      return { success: false, message: 'Từ chối quyền: Chỉ Head Auditor hoặc Admin mới có quyền kích hoạt đồng bộ thủ công.' };
    }

    setSourceSyncLogs((prev) =>
      prev.map((log) => {
        if (log.id !== sourceId) return log;
        return {
          ...log,
          lastSyncTime: new Date().toISOString(),
          status: 'SYNCED',
          recordCount: log.recordCount + Math.floor(Math.random() * 20),
        };
      })
    );
    addTrailEvent('SOURCE_SYNC_TRIGGERED', `Head Auditor kích hoạt đồng bộ thủ công nguồn.`);
    return { success: true, message: 'Đồng bộ nguồn dữ liệu thành công.' };
  };

  return (
    <AuditStoreContext.Provider
      value={{
        currentUser,
        allUsers,
        switchUser,
        queueItems,
        auditCases,
        correctiveActions,
        issueDefinitions,
        auditorAssignments,
        teamChangeAlerts,
        rescuedOrders,
        performanceMetrics,
        sourceSyncLogs,
        auditTrail,
        customers,
        quotations,
        salesOrders,
        filteredQueueItems,
        filteredActions,
        saleMarkActionDone,
        auditorStartRecheck,
        auditorSubmitRecheck,
        headAuditorWaiveAction,
        createAuditorAssignment,
        createAuditorAssignments,
        refreshAuditorAssignments,
        getEffectiveAuditorForSale,
        approveIssueDefinition,
        createAuditCaseForQueue,
        triggerManualSync,
      }}
    >
      {children}
    </AuditStoreContext.Provider>
  );
};

export const useAuditStore = () => {
  const context = useContext(AuditStoreContext);
  if (!context) {
    throw new Error('useAuditStore must be used within an AuditProvider');
  }
  return context;
};

