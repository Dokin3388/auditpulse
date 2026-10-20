// AuditPulse - TypeScript Domain Model & Schemas
// Compliant with AuditFlow Operating Specification v1.1

export type UserRole = 'HEAD_AUDITOR' | 'AUDITOR' | 'SALE' | 'TEAM_LEAD' | 'ADMIN';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  teamId?: string; // e.g. for Sale / Team Lead
  teamName?: string;
  auditorId?: string; // if user is an Auditor
  saleId?: string;    // if user is a Sale
  isActive: boolean;
}

export type RiskTagCode = 'YESTERDAY_CUSTOMERS' | 'NO_QUOTATION' | 'QUOTED_NOT_ORDERED';

export interface RiskTag {
  code: RiskTagCode;
  label: string;
  description: string;
  detectedAt: string;
}

export type QueueItemStatus =
  | 'UNASSIGNED'
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_REVIEW'
  | 'COMPLETED_PASS'
  | 'COMPLETED_FAIL'
  | 'SKIPPED'
  | 'BLOCKED';

export interface Quotation {
  id: string;
  code: string;
  customerId: string;
  saleId: string;
  quoteDate: string; // ISO
  totalAmount: number;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';
  itemsSummary: string;
}

export interface SalesOrder {
  id: string;
  code: string;
  customerId: string;
  saleId: string;
  orderDate: string; // ISO
  totalAmount: number;
  status: 'VALID' | 'CANCELLED' | 'REFUNDED' | 'DRAFT';
  quotationId?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  company?: string;
  firstSeenDate: string; // ISO
  currentSaleId: string;
  currentSaleName: string;
  currentTeamId: string;
  currentTeamName: string;
  channel: string; // e.g. "Facebook Ads", "Zalo OA", "Direct Web"
}

export interface AuditQueueItem {
  id: string;
  queueRunId: string;
  auditDate: string; // D date YYYY-MM-DD
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerFirstSeen: string;
  saleId: string;
  saleName: string;
  teamId: string;
  teamName: string;
  assignedAuditorId: string | null;
  assignedAuditorName: string | null;
  assignedAt: string;
  status: QueueItemStatus;
  riskTags: RiskTag[];
  ruleVersion: string;
  syncTimestamp: string;
  activeActionId?: string; // When open action exists -> "Đang theo dõi"
  skipOrBlockReason?: string;
  skipOrBlockApprovedBy?: string;
  sharedWork?: boolean;
}

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface IssueDefinition {
  id: string;
  issueCode: string;
  issueName: string;
  issueGroupCode: string;
  issueGroupName: string;
  severity: IssueSeverity;
  hardFail: boolean;
  isDefinitionComplete: boolean; // approved by Head Auditor
  isCurrent: boolean;
  version: string;
  recheckGuidanceTemplate: string;
}

export interface Evidence {
  id: string;
  type: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'LINK';
  fileName: string;
  fileSize?: string;
  fileUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  uploadedByRole: UserRole;
  uploadedByName: string;
  uploadedAt: string;
  metadata?: Record<string, string>;
}

export interface AuditIssue {
  id: string;
  issueCode: string;
  issueName: string;
  groupName: string;
  severity: IssueSeverity;
  hardFail: boolean;
  notes: string;
  evidenceIds: string[];
  correctiveActionId?: string;
}

export type AuditCaseStatus = 'DRAFT' | 'COMPLETED_PASS' | 'COMPLETED_FAIL' | 'VOIDED';

export interface AuditCase {
  id: string;
  queueItemId: string;
  auditorId: string;
  auditorName: string;
  status: AuditCaseStatus;
  startedAt: string;
  completedAt?: string;
  generalNotes?: string;
  issues: AuditIssue[];
  evidenceList: Evidence[];
  voidReason?: string;
  voidApprovedBy?: string;
  // Snapshots at creation time
  snapshotSaleId: string;
  snapshotSaleName: string;
  snapshotTeamId: string;
  snapshotTeamName: string;
}

export type ActionStatus =
  | 'OPEN'
  | 'SALE_MARKED_DONE'
  | 'IN_RECHECK'
  | 'VERIFIED_CLOSED'
  | 'REOPENED'
  | 'CANCELLED'
  | 'WAIVED';

export type RecheckResult = 'IMPROVED' | 'NOT_IMPROVED';

export interface Recheck {
  id: string;
  actionId: string;
  recheckNumber: number;
  auditorId: string;
  auditorName: string;
  recheckDate: string;
  result: RecheckResult;
  notes: string;
  evidenceIds: string[];
  nextDueDate?: string;
  nextRecheckSchedule?: string;
}

export interface CorrectiveAction {
  id: string;
  code: string; // e.g. "ACT-2026-1001"
  caseId: string;
  queueItemId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  saleId: string;
  saleName: string;
  teamId: string;
  teamName: string;
  auditorId: string;
  auditorName: string;
  issueCode: string;
  issueName: string;
  severity: IssueSeverity;
  status: ActionStatus;
  createdAt: string;
  dueDate: string;
  slaRuleVersion: string;
  completionCriteria: string;
  guidanceNotes: string;
  // Sale fulfillment section
  saleMarkedDone: boolean;
  saleMarkedDoneAt?: string;
  saleNotes?: string;
  saleEvidenceList: Evidence[];
  // Auditor rechecks
  rechecks: Recheck[];
  auditorEvidenceList: Evidence[];
  // Cancellation / Waiving (Head auditor only)
  waiveReason?: string;
  waiveApprovedBy?: string;
  // Derived state helper
  isOverdue?: boolean;
}

export interface AuditorAssignment {
  id: string;
  saleId: string;
  saleName: string;
  teamName: string;
  auditorId: string;
  auditorName: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD or null if currently active
  assignmentReason: string;
  createdBy: string;
  createdAt: string;
  isActive: boolean;
}

export interface SaleTeamChangeAlert {
  id: string;
  saleId: string;
  saleName: string;
  oldTeam: string;
  newTeam: string;
  changedDate: string;
  currentAuditorId: string;
  currentAuditorName: string;
  suggestedAction: string;
  reviewed: boolean;
}

export type RescuedAttribution = 'AUDIT_ASSISTED' | 'SALE_SELF_RESOLVED' | 'UNATTRIBUTED';

export interface RescuedOrder {
  id: string;
  customerId: string;
  customerName: string;
  actionId: string;
  actionCode: string;
  orderId: string;
  orderCode: string;
  orderDate: string;
  orderValue: number;
  attributionStatus: RescuedAttribution;
  auditorId: string;
  auditorName: string;
  saleId: string;
  saleName: string;
  windowDays: number;
}

export interface AuditorPerformanceMetric {
  auditorId: string;
  auditorName: string;
  avatarUrl: string;
  // Execution Quality
  auditThroughput: number;
  auditTarget: number;
  slaComplianceRate: number; // e.g. 96.5%
  overdueBacklog: number;
  medianHandlingMinutes: number; // e.g. 24 mins
  qaAgreementRate: number; // e.g. 94.2%
  qaReturnRate: number; // e.g. 4.1%
  onTimeRecheckRate: number; // e.g. 98.0%
  reopenedActionRate: number; // e.g. 8.5%
  // Business Outcome
  rescuedOrdersCount: number;
  rescuedOrdersValue: number;
  rescueRate: number; // e.g. 28.5%
  salePerformanceDeltaPct: number; // e.g. +14.2%
  evaluationCohortSize: number;
}

export interface SourceSyncLog {
  id: string;
  sourceName: 'Khách hàng (CRM)' | 'Báo giá (ERP)' | 'Đơn hàng (POS)' | 'Tài khoản Sale (HR)';
  lastSyncTime: string;
  recordCount: number;
  status: 'SYNCED' | 'DELAYED' | 'RUNNING' | 'FAILED';
  latencySeconds: number;
  notes?: string;
}

export interface AuditTrailEvent {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  actionType: string;
  description: string;
  details?: string;
}
