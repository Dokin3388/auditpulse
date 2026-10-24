import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import type { AuditQueueItem, Evidence } from '../../types';
import { Modal } from '../common/Modal';
import { RiskTagBadge, SeverityBadge } from '../common/Badge';
import { EvidencePreview } from '../common/EvidencePreview';
import {
  Clock,
  Phone,
  User,
  Building,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  ArrowRight,
} from 'lucide-react';

interface AuditCaseDetailModalProps {
  queueItem: AuditQueueItem | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToAction?: (actionId: string) => void;
}

export const AuditCaseDetailModal: React.FC<AuditCaseDetailModalProps> = ({
  queueItem,
  isOpen,
  onClose,
  onNavigateToAction,
}) => {
  const {
    currentUser,
    issueDefinitions,
    quotations,
    salesOrders,
    createAuditCaseForQueue,
  } = useAuditStore();

  const [selectedIssueCodes, setSelectedIssueCodes] = useState<string[]>([]);
  const [generalNotes, setGeneralNotes] = useState('');
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  if (!queueItem) return null;

  // Filter quotations and sales orders for this customer
  const customerQuotes = quotations.filter((q) => q.customerId === queueItem.customerId);
  const customerOrders = salesOrders.filter((o) => o.customerId === queueItem.customerId);

  // Check role permission
  const isAssignedAuditor =
    currentUser.role === 'AUDITOR' && currentUser.auditorId === queueItem.assignedAuditorId;
  const isHeadOrAdmin = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';
  const canAudit = isAssignedAuditor || isHeadOrAdmin;

  // Toggle issue selection
  const handleToggleIssue = (code: string) => {
    setSelectedIssueCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAddEvidence = (evi: Evidence) => {
    setEvidences((prev) => [...prev, evi]);
  };

  const handleCompleteAudit = (forceFailWithIssues?: boolean) => {
    setIsSubmitting(true);
    setFeedbackMsg(null);

    const issuesToSubmit = forceFailWithIssues && selectedIssueCodes.length === 0
      ? [issueDefinitions[0]?.issueCode || 'ISSUE-01']
      : selectedIssueCodes;

    const result = createAuditCaseForQueue(
      queueItem.id,
      issuesToSubmit,
      generalNotes,
      evidences
    );

    setIsSubmitting(false);
    if (result.success) {
      setFeedbackMsg({ type: 'success', text: result.message });
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setFeedbackMsg({ type: 'error', text: result.message });
    }
  };

  const isPass = selectedIssueCodes.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi tiết Audit Case: ${queueItem.customerName}`}
      subtitle={`Mã Queue: ${queueItem.id} • Rule: ${queueItem.ruleVersion} • Ngày audit: ${queueItem.auditDate.slice(0, 10)}`}
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {feedbackMsg && (
          <div
            className={`p-3.5 rounded-md text-sm font-medium flex items-center gap-2 border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            {feedbackMsg.text}
          </div>
        )}

        {/* Permission Denied Notice if current user cannot audit this item */}
        {!canAudit && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-md p-3.5 flex items-center gap-2.5 text-sm text-rose-800 dark:text-rose-200">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Giới hạn quyền:</strong> Bạn đang đăng nhập với vai trò <strong>{currentUser.name}</strong> ({currentUser.role}). 
              Chỉ <strong>{queueItem.assignedAuditorName || 'Auditor được phân công'}</strong> hoặc Head Auditor mới có quyền chấm case này.
            </span>
          </div>
        )}

        {/* Active Action Warning */}
        {queueItem.activeActionId && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-md p-3.5 flex items-start justify-between gap-3 text-sm">
            <div>
              <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Khách hàng đang có Action đang mở: {queueItem.activeActionId}
              </span>
              <p className="text-amber-800 dark:text-amber-300 mt-1 text-xs">
                Ca audit này đang trong quá trình theo dõi khắc phục. Bạn có thể mở trực tiếp Action để thực hiện recheck.
              </p>
            </div>
            {onNavigateToAction && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToAction(queueItem.activeActionId!);
                  onClose();
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded font-semibold text-xs shrink-0 flex items-center gap-1 transition-colors"
              >
                <span>Xem Action</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ================= PHẦN 1: THÔNG TIN KHÁCH HÀNG VÀ SALE ================= */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
              1
            </span>
            Thông tin khách hàng và Sale phụ trách
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Building className="w-4 h-4 text-slate-400" />
                <span>Khách hàng:</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">
                  {queueItem.customerName}
                </strong>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>Số điện thoại:</span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {queueItem.customerPhone}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Ngày vào hệ thống:</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {new Date(queueItem.customerFirstSeen).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <User className="w-4 h-4 text-slate-400" />
                <span>Sale phụ trách:</span>
                <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                  {queueItem.saleName}
                </strong>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span>Team Sale:</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  {queueItem.teamName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span>Auditor phụ trách:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {queueItem.assignedAuditorName || 'Chưa phân công'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= PHẦN 2: LỖI/RISK PHÁT HIỆN TỪ RULE ================= */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
              2
            </span>
            Lỗi / Rủi ro phát hiện từ Rule
          </h3>

          {/* Risk tags */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase text-slate-500 block">
              Cảnh báo từ hệ thống:
            </span>
            <div className="flex flex-wrap gap-2">
              {queueItem.riskTags.map((tag) => (
                <div
                  key={tag.code}
                  className="p-2.5 rounded-md border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 flex-1 min-w-[220px]"
                >
                  <RiskTagBadge code={tag.code} label={tag.label} />
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {tag.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Source Quote / Order Context */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-semibold uppercase text-slate-500 block">
              Dữ liệu Báo giá & Đơn hàng nguồn:
            </span>
            {customerQuotes.length === 0 ? (
              <p className="text-xs text-slate-500 p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                Không tìm thấy báo giá nào trong hệ thống CRM/ERP (Phù hợp rule khách mới 7 ngày chưa báo giá).
              </p>
            ) : (
              <div className="space-y-1.5">
                {customerQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{q.code}</span>
                      <span className="text-slate-500 ml-2">{q.itemsSummary}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {q.totalAmount.toLocaleString('vi-VN')} ₫
                    </div>
                  </div>
                ))}
              </div>
            )}

            {customerOrders.length > 0 && (
              <div className="pt-1 text-xs text-slate-600 dark:text-slate-400">
                Đơn hàng đã ghi nhận ({customerOrders.length} đơn):{' '}
                {customerOrders.map((o) => (
                  <span key={o.id} className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold mr-2">
                    {o.code} ({o.totalAmount.toLocaleString('vi-VN')} ₫)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Issue Checklist Selection */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">
                Checklist chọn lỗi để giao Action cho Sale:
              </span>
              <span className="text-xs text-slate-400">
                Đã chọn: <strong>{selectedIssueCodes.length}</strong> lỗi
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {issueDefinitions.map((def) => {
                const isChecked = selectedIssueCodes.includes(def.issueCode);
                return (
                  <label
                    key={def.id}
                    className={`flex items-start gap-3 p-2.5 rounded-md border transition-colors cursor-pointer text-sm ${
                      isChecked
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleIssue(def.issueCode)}
                      disabled={!canAudit}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          [{def.issueCode}] {def.issueName}
                        </span>
                        <SeverityBadge severity={def.severity} hardFail={def.hardFail} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Nhóm: {def.issueGroupName}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= PHẦN 3: KẾT LUẬN CỦA AUDITOR ================= */}
        <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-lg border-2 border-slate-300 dark:border-slate-700 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-xs">
                3
              </span>
              Kết luận của Auditor
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              Auditor là người quyết định cuối cùng
            </span>
          </div>

          {/* Ghi chú kiểm tra */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1">
              Ghi chú kiểm tra & Hướng dẫn cho Sale:
            </label>
            <textarea
              rows={2}
              placeholder="Ghi rõ nhận định, hướng dẫn khắc phục và deadline..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              disabled={!canAudit}
              className="w-full text-sm p-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60"
            />
          </div>

          {/* Bằng chứng phát hiện */}
          <EvidencePreview
            evidenceList={evidences}
            allowAdd={canAudit}
            onAddEvidence={handleAddEvidence}
            title="Bằng chứng sai phạm phát hiện (Evidence)"
          />

          {/* Hai nút lớn cho kết luận */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700">
            <div className="text-sm font-medium">
              {isPass ? (
                <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5" /> Không chọn lỗi: Case sẽ được tính ĐẠT (PASS)
                </span>
              ) : (
                <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-5 h-5" /> Đã chọn {selectedIssueCodes.length} lỗi: Sẽ tự động tạo Action
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Đóng
              </button>

              {isPass ? (
                <button
                  type="button"
                  onClick={() => handleCompleteAudit(false)}
                  disabled={isSubmitting || !canAudit}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md text-sm shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Chốt Case ĐẠT (PASS)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCompleteAudit(false)}
                  disabled={isSubmitting || !canAudit}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md text-sm shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Giao Action Khắc Phục (FAIL)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
