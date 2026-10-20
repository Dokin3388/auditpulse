// AuditPulse - Reactive State Store & Business Logic Layer
// Compliant with AuditFlow Operating Specification v1.1
import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import {
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
  QueueItemStatus,
  Customer,
  Quotation,
  SalesOrder,
} from '../types';

import {
  mockUsers,
  mockCustomers,
  mockQuotations,
  mockSalesOrders,
  mockAuditQueueItems,
  mockIssueDefinitions,
  mockCorrectiveActions,
  mockAuditorAssignments,
  mockTeamChangeAlerts,
  mockRescuedOrders,
  mockAuditorPerformanceMetrics,
  mockSourceSyncLogs,
  mockAuditTrailEvents,
} from './mockData';

interface AuditStoreContextType {
  currentUser: UserProfile;
  allUsers: UserProfile[];
  switchUser: (userId: string) => void;
  // Collections
  queueItems: AuditQueueItem[];
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
  auditorStartRecheck: (actionId: string) => { success: boolean; message: string };
  auditorSubmitRecheck: (
    actionId: string,
    result: RecheckResult,
    notes: string,
    nextDueDate?: string,
    evidence?: Evidence
  ) => { success: boolean; message: string };
  headAuditorWaiveAction: (actionId: string, reason: string) => { success: boolean; message: string };
  createAuditorAssignment: (
    saleId: string,
    auditorId: string,
    effectiveFrom: string,
    reason: string
  ) => { success: boolean; message: string };
  approveIssueDefinition: (defId: string) => void;
  createAuditCaseForQueue: (
    queueItemId: string,
    selectedIssueCodes: string[],
    generalNotes: string,
    evidences: Evidence[]
  ) => { success: boolean; message: string; caseId?: string };
  triggerManualSync: (sourceId: string) => void;
  reassignQueueItem: (queueItemId: string, newAuditorId: string, reason: string) => void;
}

const AuditStoreContext = createContext<AuditStoreContextType | null>(null);

export const AuditProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Current logged in user (default Head Auditor for rich full overview)
  const [currentUser, setCurrentUser] = useState<UserProfile>(mockUsers[0]);
  const [allUsers] = useState<UserProfile[]>(mockUsers);

  // Core reactive entities
  const [queueItems, setQueueItems] = useState<AuditQueueItem[]>(mockAuditQueueItems);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>(mockCorrectiveActions);
  const [issueDefinitions, setIssueDefinitions] = useState<IssueDefinition[]>(mockIssueDefinitions);
  const [auditorAssignments, setAuditorAssignments] = useState<AuditorAssignment[]>(mockAuditorAssignments);
  const [teamChangeAlerts, setTeamChangeAlerts] = useState<SaleTeamChangeAlert[]>(mockTeamChangeAlerts);
  const [rescuedOrders, setRescuedOrders] = useState<RescuedOrder[]>(mockRescuedOrders);
  const [performanceMetrics, setPerformanceMetrics] = useState<AuditorPerformanceMetric[]>(mockAuditorPerformanceMetrics);
  const [sourceSyncLogs, setSourceSyncLogs] = useState<SourceSyncLog[]>(mockSourceSyncLogs);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEvent[]>(mockAuditTrailEvents);
  const [customers] = useState<Customer[]>(mockCustomers);
  const [quotations] = useState<Quotation[]>(mockQuotations);
  const [salesOrders] = useState<SalesOrder[]>(mockSalesOrders);

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
      id: `TRL-${Date.now()}`,
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
      // Auditor only views queue items assigned to their portfolio
      return queueItems.filter(
        (item) => item.assignedAuditorId === currentUser.auditorId
      );
    }
    if (currentUser.role === 'SALE') {
      // Sale only views queue items belonging to their customer ownership
      return queueItems.filter((item) => item.saleId === currentUser.saleId);
    }
    if (currentUser.role === 'TEAM_LEAD') {
      // Team lead views queue items in their team
      return queueItems.filter((item) => item.teamId === currentUser.teamId);
    }
    return queueItems;
  }, [queueItems, currentUser]);

  const filteredActions = useMemo(() => {
    if (currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN') {
      return correctiveActions;
    }
    if (currentUser.role === 'AUDITOR') {
      return correctiveActions.filter(
        (act) => act.auditorId === currentUser.auditorId
      );
    }
    if (currentUser.role === 'SALE') {
      // Sale only views actions assigned to them
      return correctiveActions.filter((act) => act.saleId === currentUser.saleId);
    }
    if (currentUser.role === 'TEAM_LEAD') {
      // Team Lead sees actions in their team
      return correctiveActions.filter((act) => act.teamId === currentUser.teamId);
    }
    return correctiveActions;
  }, [correctiveActions, currentUser]);

  // SALE FLOW: Mark Action as Done
  const saleMarkActionDone = (actionId: string, notes: string, evidence?: Evidence) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    // Strict validation per spec: Sale cannot close or set recheck result
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

  // AUDITOR FLOW: Start Recheck
  const auditorStartRecheck = (actionId: string) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    setCorrectiveActions((prev) =>
      prev.map((act) => (act.id === actionId ? { ...act, status: 'IN_RECHECK' } : act))
    );

    addTrailEvent(
      'RECHECK_STARTED',
      `Auditor ${currentUser.name} bắt đầu kiểm tra (IN_RECHECK) action ${action.code}.`
    );

    return { success: true, message: 'Đã bắt đầu kiểm tra action.' };
  };

  // AUDITOR FLOW: Submit Recheck Result
  const auditorSubmitRecheck = (
    actionId: string,
    result: RecheckResult,
    notes: string,
    nextDueDate?: string,
    evidence?: Evidence
  ) => {
    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    const newRecheckNumber = action.rechecks.length + 1;
    const recheckRecord = {
      id: `RC-${Date.now()}`,
      actionId,
      recheckNumber: newRecheckNumber,
      auditorId: currentUser.auditorId || 'AUD-01',
      auditorName: currentUser.name,
      recheckDate: new Date().toISOString(),
      result,
      notes,
      evidenceIds: evidence ? [evidence.id] : [],
      nextDueDate: result === 'NOT_IMPROVED' ? nextDueDate : undefined,
      nextRecheckSchedule: result === 'NOT_IMPROVED' ? new Date(Date.now() + 86400000).toISOString() : undefined,
    };

    if (result === 'IMPROVED') {
      // Transitions to VERIFIED_CLOSED per spec
      setCorrectiveActions((prev) =>
        prev.map((act) => {
          if (act.id !== actionId) return act;
          return {
            ...act,
            status: 'VERIFIED_CLOSED',
            isOverdue: false,
            rechecks: [...act.rechecks, recheckRecord],
            auditorEvidenceList: evidence ? [...act.auditorEvidenceList, evidence] : act.auditorEvidenceList,
          };
        })
      );

      // Check if this closed action creates a rescued order opportunity
      if (action.issueCode === 'FU_001' || action.issueCode === 'FU_002') {
        const potentialCustomer = customers.find((c) => c.id === action.customerId);
        if (potentialCustomer) {
          // Increment performance
          setPerformanceMetrics((prev) =>
            prev.map((m) =>
              m.auditorId === action.auditorId
                ? {
                    ...m,
                    onTimeRecheckRate: Math.min(100, m.onTimeRecheckRate + 0.2),
                    rescuedOrdersCount: m.rescuedOrdersCount + 1,
                    rescuedOrdersValue: m.rescuedOrdersValue + 35000000,
                  }
                : m
            )
          );
        }
      }

      addTrailEvent(
        'RECHECK_IMPROVED',
        `Auditor ${currentUser.name} xác nhận IMPROVED. Action ${action.code} chính thức được ĐÓNG (VERIFIED_CLOSED).`,
        `Ghi chú: ${notes}`
      );

      return {
        success: true,
        message: `Xác nhận cải thiện thành công! Action ${action.code} đã được đóng.`,
      };
    } else {
      // Transitions to REOPENED per spec, requires new due date
      const effectiveDueDate = nextDueDate || new Date(Date.now() + 2 * 86400000).toISOString();

      setCorrectiveActions((prev) =>
        prev.map((act) => {
          if (act.id !== actionId) return act;
          return {
            ...act,
            status: 'REOPENED',
            dueDate: effectiveDueDate,
            isOverdue: false,
            saleMarkedDone: false, // Reset sale completion for reopened action
            rechecks: [...act.rechecks, recheckRecord],
            auditorEvidenceList: evidence ? [...act.auditorEvidenceList, evidence] : act.auditorEvidenceList,
          };
        })
      );

      addTrailEvent(
        'RECHECK_NOT_IMPROVED',
        `Auditor ${currentUser.name} xác nhận NOT_IMPROVED. Mở lại (REOPENED) action ${action.code}.`,
        `Hạn xử lý mới: ${new Date(effectiveDueDate).toLocaleDateString('vi-VN')}. Ghi chú: ${notes}`
      );

      return {
        success: true,
        message: `Action ${action.code} đã được mở lại (REOPENED). Sale được giao hạn xử lý mới.`,
      };
    }
  };

  // HEAD AUDITOR FLOW: Waive / Cancel Action
  const headAuditorWaiveAction = (actionId: string, reason: string) => {
    if (currentUser.role !== 'HEAD_AUDITOR' && currentUser.role !== 'ADMIN') {
      return { success: false, message: 'Chỉ Head Auditor mới có quyền Miễn trừ/Hủy Action.' };
    }

    const action = correctiveActions.find((a) => a.id === actionId);
    if (!action) return { success: false, message: 'Không tìm thấy action' };

    setCorrectiveActions((prev) =>
      prev.map((act) => {
        if (act.id !== actionId) return act;
        return {
          ...act,
          status: 'WAIVED',
          waiveReason: reason,
          waiveApprovedBy: currentUser.name,
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

  // AUDITOR PORTFOLIO FLOW: Create / Reassign Auditor Assignment
  const createAuditorAssignment = (
    saleId: string,
    auditorId: string,
    effectiveFrom: string,
    reason: string
  ) => {
    if (currentUser.role !== 'HEAD_AUDITOR' && currentUser.role !== 'ADMIN') {
      return { success: false, message: 'Chỉ Head Auditor mới có quyền điều chỉnh phân công Auditor.' };
    }

    const sale = allUsers.find((u) => u.saleId === saleId) || mockUsers.find((u) => u.saleId === saleId);
    const auditor = allUsers.find((u) => u.auditorId === auditorId);
    const saleName = sale ? sale.name : 'Sale ' + saleId;
    const auditorName = auditor ? auditor.name : 'Auditor ' + auditorId;
    const teamName = sale?.teamName || 'B2B Team';

    // Calculate effectiveTo for previous active assignment: day before effectiveFrom
    const effDate = new Date(effectiveFrom);
    const dayBefore = new Date(effDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const effectiveToStr = dayBefore.toISOString().split('T')[0];

    // Close existing active assignment for this sale
    setAuditorAssignments((prev) =>
      prev.map((asg) => {
        if (asg.saleId === saleId && asg.isActive) {
          return {
            ...asg,
            isActive: false,
            effectiveTo: effectiveToStr,
          };
        }
        return asg;
      })
    );

    // Add new assignment
    const newAssignment: AuditorAssignment = {
      id: `ASG-${Date.now()}`,
      saleId,
      saleName,
      teamName,
      auditorId,
      auditorName,
      effectiveFrom,
      effectiveTo: null,
      assignmentReason: reason,
      createdBy: currentUser.name,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    setAuditorAssignments((prev) => [newAssignment, ...prev]);

    // Clear any open team change alert for this sale
    setTeamChangeAlerts((prev) =>
      prev.map((alert) => (alert.saleId === saleId ? { ...alert, reviewed: true } : alert))
    );

    addTrailEvent(
      'AUDITOR_ASSIGNMENT_UPDATED',
      `Head Auditor phân công sale ${saleName} cho ${auditorName}. Hiệu lực từ ${effectiveFrom}.`,
      `Lý do: ${reason}`
    );

    return {
      success: true,
      message: `Đã phân công ${saleName} cho ${auditorName} thành công từ ngày ${effectiveFrom}.`,
    };
  };

  // SETTINGS FLOW: Approve Issue Definition
  const approveIssueDefinition = (defId: string) => {
    setIssueDefinitions((prev) =>
      prev.map((item) => (item.id === defId ? { ...item, isDefinitionComplete: true } : item))
    );
    const target = issueDefinitions.find((i) => i.id === defId);
    addTrailEvent(
      'ISSUE_CATALOG_APPROVED',
      `Head Auditor đã phê duyệt mức độ định nghĩa lỗi [${target?.issueCode}] ${target?.issueName}.`
    );
  };

  // AUDIT EXECUTION FLOW: Complete Audit Case from Queue Item
  const createAuditCaseForQueue = (
    queueItemId: string,
    selectedIssueCodes: string[],
    generalNotes: string,
    evidences: Evidence[]
  ) => {
    const queueItem = queueItems.find((q) => q.id === queueItemId);
    if (!queueItem) return { success: false, message: 'Không tìm thấy Queue Item' };

    const isPass = selectedIssueCodes.length === 0;
    const newStatus: QueueItemStatus = isPass ? 'COMPLETED_PASS' : 'COMPLETED_FAIL';

    // Update queue item status
    setQueueItems((prev) =>
      prev.map((item) => (item.id === queueItemId ? { ...item, status: newStatus } : item))
    );

    // If fail, create corrective action for each issue or group
    if (!isPass) {
      selectedIssueCodes.forEach((code, idx) => {
        const issueDef = issueDefinitions.find((def) => def.issueCode === code);
        const actionCode = `ACT-${new Date().getFullYear()}-${1000 + correctiveActions.length + idx + 1}`;
        const newAction: CorrectiveAction = {
          id: `ACT-ID-${Date.now()}-${idx}`,
          code: actionCode,
          caseId: `CASE-${Date.now()}`,
          queueItemId,
          customerId: queueItem.customerId,
          customerName: queueItem.customerName,
          customerPhone: queueItem.customerPhone,
          saleId: queueItem.saleId,
          saleName: queueItem.saleName,
          teamId: queueItem.teamId,
          teamName: queueItem.teamName,
          auditorId: queueItem.assignedAuditorId || currentUser.auditorId || 'AUD-01',
          auditorName: queueItem.assignedAuditorName || currentUser.name,
          issueCode: code,
          issueName: issueDef?.issueName || code,
          severity: issueDef?.severity || 'MEDIUM',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          slaRuleVersion: queueItem.ruleVersion,
          completionCriteria: issueDef?.recheckGuidanceTemplate || 'Khắc phục tồn tại và cập nhật CRM.',
          guidanceNotes: generalNotes,
          saleMarkedDone: false,
          saleEvidenceList: [],
          rechecks: [],
          auditorEvidenceList: evidences,
          isOverdue: false,
        };

        setCorrectiveActions((prev) => [newAction, ...prev]);

        // Link active action to queue item ("Đang theo dõi")
        setQueueItems((prev) =>
          prev.map((item) =>
            item.id === queueItemId ? { ...item, activeActionId: newAction.id } : item
          )
        );
      });
    }

    addTrailEvent(
      isPass ? 'AUDIT_CASE_PASSED' : 'AUDIT_CASE_FAILED',
      `Auditor ${currentUser.name} hoàn tất audit khách ${queueItem.customerName} (${isPass ? 'ĐẠT' : 'KHÔNG ĐẠT'}).`,
      isPass ? 'Không phát hiện lỗi vận hành.' : `Phát hiện ${selectedIssueCodes.length} lỗi. Đã tự động tạo Corrective Action.`
    );

    return {
      success: true,
      message: isPass
        ? 'Case được ghi nhận ĐẠT (COMPLETED_PASS).'
        : `Case KHÔNG ĐẠT (COMPLETED_FAIL). Đã tạo ${selectedIssueCodes.length} Action giao việc cho Sale.`,
    };
  };

  // HEAD AUDITOR: Reassign individual Queue Item
  const reassignQueueItem = (queueItemId: string, newAuditorId: string, reason: string) => {
    const newAuditor = allUsers.find((u) => u.auditorId === newAuditorId);
    if (!newAuditor) return;

    setQueueItems((prev) =>
      prev.map((item) => {
        if (item.id !== queueItemId) return item;
        return {
          ...item,
          assignedAuditorId: newAuditorId,
          assignedAuditorName: newAuditor.name,
          sharedWork: true, // Flag per spec section 9
        };
      })
    );

    addTrailEvent(
      'QUEUE_ITEM_REASSIGNED',
      `Head Auditor chuyển giao Queue Item ${queueItemId} cho ${newAuditor.name}.`,
      `Lý do: ${reason} (Có cờ shared_work)`
    );
  };

  // Trigger manual source sync
  const triggerManualSync = (sourceId: string) => {
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
  };

  return (
    <AuditStoreContext.Provider
      value={{
        currentUser,
        allUsers,
        switchUser,
        queueItems,
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
        approveIssueDefinition,
        createAuditCaseForQueue,
        triggerManualSync,
        reassignQueueItem,
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
