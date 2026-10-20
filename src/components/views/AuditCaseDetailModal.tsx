import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import { AuditQueueItem, IssueDefinition, Evidence } from '../../types';
import { Modal } from '../common/Modal';
import { Badge, RiskTagBadge, SeverityBadge } from '../common/Badge';
import { EvidencePreview } from '../common/EvidencePreview';
import {
  FileText,
  Clock,
  Phone,
  User,
  Building,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck,
  Send,
  HelpCircle,
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

  // Toggle issue selection
  const handleToggleIssue = (code: string) => {
    setSelectedIssueCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAddEvidence = (evi: Evidence) => {
    setEvidences((prev) => [...prev, evi]);
  };

  const handleCompleteAudit = () => {
    setIsSubmitting(true);
    setFeedbackMsg(null);

    // Call store
    const result = createAuditCaseForQueue(
      queueItem.id,
      selectedIssueCodes,
      generalNotes,
      evidences
    );

    setIsSubmitting(false);
    if (result.success) {
      setFeedbackMsg({ type: 'success', text: result.message });
      setTimeout(() => {
        onClose();
      }, 1400);
    } else {
      setFeedbackMsg({ type: 'error', text: result.message });
    }
  };

  const isPass = selectedIssueCodes.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Audit Case: ${queueItem.customerName}`}
      subtitle={`Mã Queue: ${queueItem.id} • Rule: ${queueItem.ruleVersion} • Snapshot: 20/10/2026`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {feedbackMsg && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            {feedbackMsg.text}
          </div>
        )}

        {/* Existing Open Action warning ("Đang theo dõi" per spec) */}
        {queueItem.activeActionId && (
          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                Khách đang có Action đang mở (Trạng thái: Đang theo dõi)
              </span>
              <p className="text-purple-700 dark:text-purple-300 mt-1">
                Theo Spec v1.1, hệ thống không tạo action trùng cho cùng khách khi action cũ còn mở.
              </p>
            </div>
            {onNavigateToAction && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToAction(queueItem.activeActionId!);
                  onClose();
                }}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold text-xs shrink-0"
              >
                Mở Action {queueItem.activeActionId}
              </button>
            )}
          </div>
        )}

        {/* 1. Customer & Snapshot Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-500">
              <Building className="w-3.5 h-3.5" />
              <span>Khách hàng:</span>
              <strong className="text-slate-900 dark:text-slate-100">{queueItem.customerName}</strong>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Phone className="w-3.5 h-3.5" />
              <span>SĐT chuẩn hóa:</span>
              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                {queueItem.customerPhone}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Ngày vào hệ thống:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {new Date(queueItem.customerFirstSeen).toLocaleString('vi-VN')}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-500">
              <User className="w-3.5 h-3.5" />
              <span>Sale chịu trách nhiệm (Snapshot):</span>
              <strong className="text-slate-900 dark:text-slate-100">{queueItem.saleName}</strong>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>Team:</span>
              <span className="text-slate-700 dark:text-slate-300">{queueItem.teamName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>Auditor phụ trách:</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400">
                {queueItem.assignedAuditorName || 'Chưa gán'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Snapshot Risk Reason per Spec Section 4 */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Lý do vào Queue (Snapshot tại 00:00 ngày 20/10)
          </h4>
          <div className="flex flex-wrap gap-2">
            {queueItem.riskTags.map((tag) => (
              <div
                key={tag.code}
                className="p-2.5 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex-1 min-w-[200px]"
              >
                <RiskTagBadge code={tag.code} label={tag.label} />
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {tag.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Quotation & Order History Data */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Dữ liệu Báo giá & Đơn hàng nguồn</span>
            <span className="text-[11px] text-slate-400 font-normal">
              Chỉ xét báo giá mới nhất [D-7, D-1]
            </span>
          </h4>

          {customerQuotes.length === 0 ? (
            <div className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-dashed text-center">
              Không có báo giá nào trong hệ thống ERP. (Đúng với rule NO_QUOTATION)
            </div>
          ) : (
            <div className="space-y-2">
              {customerQuotes.map((quo, i) => (
                <div
                  key={quo.id}
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    i === 0
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                      : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {quo.code}
                      </span>
                      {i === 0 && (
                        <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                          BÁO GIÁ MỚI NHẤT
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">{quo.itemsSummary}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {quo.totalAmount.toLocaleString('vi-VN')} ₫
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {new Date(quo.quoteDate).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Issue Checklist from Issue Catalog (Spec Section 5 & 6) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Checklist Chấm Lỗi (Catalog v1.4)
            </h4>
            <span className="text-[11px] text-slate-400">
              Chọn lỗi để tạo Action giao cho Sale
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {issueDefinitions.map((def) => {
              const isChecked = selectedIssueCodes.includes(def.issueCode);
              return (
                <label
                  key={def.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleIssue(def.issueCode)}
                    className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        [{def.issueCode}] {def.issueName}
                      </span>
                      <SeverityBadge severity={def.severity} hardFail={def.hardFail} />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Nhóm: {def.issueGroupName}
                    </p>
                    {!def.isDefinitionComplete && (
                      <span className="inline-block mt-1 text-[10px] text-amber-600 font-medium">
                        ⚠️ Lỗi chưa duyệt mức độ: cho phép ghi nhận nhưng không kích hoạt chế tài tự động.
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* 5. Auditor Notes & Guidance */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Ghi chú & Hướng dẫn khắc phục cho Sale
          </label>
          <textarea
            rows={3}
            placeholder="Ghi rõ hành động sale cần thực hiện, tiêu chí nghiệm thu và deadline..."
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* 6. Evidence attachments */}
        <EvidencePreview
          evidenceList={evidences}
          allowAdd={true}
          onAddEvidence={handleAddEvidence}
          title="Bằng chứng sai phạm phát hiện (Evidence)"
        />

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs">
            {isPass ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Không chọn lỗi: Case sẽ ĐẠT (COMPLETED_PASS)
              </span>
            ) : (
              <span className="text-rose-600 font-semibold flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Đã chọn {selectedIssueCodes.length} lỗi: Case KHÔNG ĐẠT (Tự động tạo Action)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCompleteAudit}
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white shadow-sm flex items-center gap-1.5 transition-colors ${
                isPass
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isPass ? 'Chốt Case ĐẠT (PASS)' : 'Giao Action Khắc Phục (FAIL)'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
