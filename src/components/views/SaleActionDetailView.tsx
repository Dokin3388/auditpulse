import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import type { Evidence, RecheckResult } from '../../types';
import {
  AlertTriangle,
  User,
  Building,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Send,
  Lock,
  Clock,
} from 'lucide-react';
import {
  Badge,
  ActionStatusBadge,
  SeverityBadge,
} from '../common/Badge';
import { EvidencePreview } from '../common/EvidencePreview';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';

interface SaleActionDetailViewProps {
  initialActionId?: string | null;
}

export const SaleActionDetailView: React.FC<SaleActionDetailViewProps> = ({
  initialActionId,
}) => {
  const {
    currentUser,
    filteredActions,
    saleMarkActionDone,
    auditorStartRecheck,
    auditorSubmitRecheck,
    headAuditorWaiveAction,
  } = useAuditStore();

  const [selectedActionId, setSelectedActionId] = useState<string>(() => {
    if (initialActionId) {
      const match = filteredActions.find((a) => a.id === initialActionId);
      if (match) return match.id;
    }
    return filteredActions[0]?.id || '';
  });

  const activeAction = filteredActions.find((a) => a.id === selectedActionId) || filteredActions[0];

  // Sale form state
  const [saleChecked, setSaleChecked] = useState(false);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleEvidences, setSaleEvidences] = useState<Evidence[]>([]);

  // Auditor recheck form state
  const [recheckVerdict, setRecheckVerdict] = useState<RecheckResult>('IMPROVED');
  const [recheckNotes, setRecheckNotes] = useState('');
  const [nextDueDate, setNextDueDate] = useState('2026-10-23');
  const [auditorEvidences, setAuditorEvidences] = useState<Evidence[]>([]);

  // Head Auditor waive modal state
  const [isWaiveModalOpen, setIsWaiveModalOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');

  // Status message
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Strict permission checks
  const isSaleOwner = currentUser.role === 'SALE' && currentUser.saleId === activeAction?.saleId;
  const isAssignedAuditor = currentUser.role === 'AUDITOR' && currentUser.auditorId === activeAction?.auditorId;
  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  // Handlers
  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    const res = saleMarkActionDone(activeAction.id, saleNotes, saleEvidences[0]);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setSaleNotes('');
      setSaleEvidences([]);
      setSaleChecked(false);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleStartRecheck = () => {
    if (!activeAction) return;
    const res = auditorStartRecheck(activeAction.id);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleAuditorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    const res = auditorSubmitRecheck(
      activeAction.id,
      recheckVerdict,
      recheckNotes,
      nextDueDate,
      auditorEvidences[0]
    );

    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setRecheckNotes('');
      setAuditorEvidences([]);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  const handleConfirmWaive = () => {
    if (!activeAction || !waiveReason.trim()) return;
    const res = headAuditorWaiveAction(activeAction.id, waiveReason);
    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setIsWaiveModalOpen(false);
      setWaiveReason('');
    }
  };

  if (!activeAction) {
    return (
      <EmptyState
        type="empty"
        title="Chưa có Action nào"
        description="Hiện tại không có action khắc phục nào được phân công trong phạm vi của bạn."
      />
    );
  }

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Quy trình Khắc phục Lỗi & Recheck v1.1
            </span>
            <span className="text-xs text-slate-400">
              {filteredActions.length} actions trong danh sách
            </span>
          </div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white mt-1">
            Chi tiết Corrective Action: {activeAction.code}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Khu vực thao tác rõ ràng giữa Sale khắc phục và Auditor nghiệm thu.
          </p>
        </div>

        {/* Head Auditor Waive shortcut */}
        {isHeadAuditor && activeAction.status !== 'VERIFIED_CLOSED' && activeAction.status !== 'WAIVED' && (
          <button
            onClick={() => setIsWaiveModalOpen(true)}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            Miễn trừ Action
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-md text-xs font-medium flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          {statusMessage.text}
        </div>
      )}

      {/* Main Split Layout: Left List Selector + Right Dual Pane Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col: Action Selector List */}
        <div className="lg:col-span-4 space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Danh sách Action ({filteredActions.length})
          </h3>

          <div className="space-y-1.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
            {filteredActions.map((action) => {
              const isSelected = action.id === activeAction.id;
              return (
                <div
                  key={action.id}
                  onClick={() => setSelectedActionId(action.id)}
                  className={`p-3 rounded-md border text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600 font-medium'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {action.code}
                    </span>
                    <ActionStatusBadge status={action.status} isOverdue={action.isOverdue} />
                  </div>

                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {action.customerName}
                  </p>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    [{action.issueCode}] {action.issueName}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                    <span>Sale: {action.saleName}</span>
                    <span className="font-mono">
                      Hạn: {new Date(action.dueDate).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Active Action Workflows */}
        <div className="lg:col-span-8 space-y-5">
          {/* Action Overview Card */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div className="space-y-0.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Mã Action:</span>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {activeAction.code}
                  <ActionStatusBadge status={activeAction.status} isOverdue={activeAction.isOverdue} />
                </h2>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Hạn chót:</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                  {new Date(activeAction.dueDate).toLocaleString('vi-VN')}
                </span>
              </div>
            </div>

            {/* Context details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>Khách hàng:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                    {activeAction.customerName}
                  </strong>
                </div>
                <div className="text-slate-500">
                  Số điện thoại: <span className="font-mono">{activeAction.customerPhone}</span>
                </div>
                <div className="text-slate-500">
                  Sale phụ trách: <strong>{activeAction.saleName}</strong> ({activeAction.teamName})
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Auditor phụ trách:</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {activeAction.auditorName}
                  </strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Mức độ:</span>
                  <SeverityBadge severity={activeAction.severity} />
                </div>
                <div className="text-slate-500">
                  SLA Rule: <span className="font-mono">{activeAction.slaRuleVersion}</span>
                </div>
              </div>
            </div>

            {/* Completion Criteria */}
            <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-md border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <span className="font-semibold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider block">
                Tiêu chí hoàn tất & Hướng dẫn sửa lỗi từ Auditor:
              </span>
              <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                {activeAction.completionCriteria}
              </p>
              {activeAction.guidanceNotes && (
                <p className="text-slate-500 text-[11px] mt-1 italic">
                  Ghi chú thêm: {activeAction.guidanceNotes}
                </p>
              )}
            </div>

            {/* Waive reason notice if waived */}
            {activeAction.status === 'WAIVED' && (
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-md text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold">Đã được Head Auditor phê duyệt Miễn trừ (WAIVED):</p>
                <p className="mt-0.5">Lý do: {activeAction.waiveReason}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Người duyệt: {activeAction.waiveApprovedBy}
                </p>
              </div>
            )}
          </div>

          {/* DUAL PANE WORKFLOW CONTAINER */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ================= PANE 1: SALE SUBMISSION SECTION ================= */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-semibold text-[11px]">
                    1
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Khu vực Sale Khắc phục
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Sale xác nhận đã làm và tải bằng chứng
                    </p>
                  </div>
                </div>

                {activeAction.saleMarkedDone && (
                  <Badge variant="warning" size="xs">
                    Đã gửi {new Date(activeAction.saleMarkedDoneAt || '').toLocaleTimeString('vi-VN')}
                  </Badge>
                )}
              </div>

              {/* RBAC notice if current user is not the sale owner */}
              {!isSaleOwner && (activeAction.status === 'OPEN' || activeAction.status === 'REOPENED') && (
                <div className="p-2.5 rounded-md bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5 border border-amber-200/80 dark:border-amber-800/60">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>
                    Chỉ Sale phụ trách (<strong>{activeAction.saleName}</strong>) mới có quyền gửi xác nhận khắc phục.
                  </span>
                </div>
              )}

              {/* State-specific UI for Sale section */}
              {activeAction.status === 'VERIFIED_CLOSED' ? (
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Action đã đóng (VERIFIED_CLOSED)</span>
                  </div>
                  <p>Quy trình khắc phục và nghiệm thu hoàn tất. Không thể sửa đổi thêm.</p>
                  {activeAction.saleNotes && (
                    <p className="italic text-slate-700 dark:text-slate-300">"{activeAction.saleNotes}"</p>
                  )}
                  {activeAction.saleEvidenceList.length > 0 && (
                    <EvidencePreview evidenceList={activeAction.saleEvidenceList} title="Bằng chứng Sale đã nộp" readOnly={true} />
                  )}
                </div>
              ) : activeAction.status === 'WAIVED' || activeAction.status === 'CANCELLED' ? (
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Action đã được Miễn trừ (WAIVED)</span>
                  </div>
                  <p>Lý do: {activeAction.waiveReason || 'Head Auditor phê duyệt miễn trừ.'}</p>
                </div>
              ) : activeAction.status === 'IN_RECHECK' ? (
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Auditor đang kiểm tra (IN_RECHECK)</span>
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      Sale không thể chỉnh sửa action trong lúc Auditor đang nghiệm thu.
                    </p>
                    {activeAction.saleNotes && (
                      <p className="text-slate-800 dark:text-slate-200 font-medium mt-1">
                        Ghi chú đã nộp: "{activeAction.saleNotes}"
                      </p>
                    )}
                  </div>
                  {activeAction.saleEvidenceList.length > 0 && (
                    <EvidencePreview evidenceList={activeAction.saleEvidenceList} title="Bằng chứng Sale đã gửi" readOnly={true} />
                  )}
                </div>
              ) : activeAction.status === 'SALE_MARKED_DONE' ? (
                /* Display Submitted Sale Data */
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-md bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Sale đã đánh dấu hoàn thành</span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 font-medium">
                      "{activeAction.saleNotes || 'Không có ghi chú thêm.'}"
                    </p>
                  </div>

                  <EvidencePreview
                    evidenceList={activeAction.saleEvidenceList}
                    title="Bằng chứng Sale đính kèm"
                    readOnly={true}
                  />

                  {/* Clarification per spec */}
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-850 text-[11px] text-slate-500 border border-slate-200 dark:border-slate-800 flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      Theo Spec v1.1, Sale <strong>không thể tự đóng action</strong>. Action đang ở trạng thái{' '}
                      <code>SALE_MARKED_DONE</code> và chờ Auditor recheck.
                    </span>
                  </div>
                </div>
              ) : (
                /* Sale submission form: strictly allowed only on OPEN and REOPENED */
                <form onSubmit={handleSaleSubmit} className="space-y-3 text-xs">
                  {/* Checkbox "Tôi đã thực hiện" strictly required per spec */}
                  <label className={`flex items-start gap-2.5 p-3 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 transition-colors ${isSaleOwner ? 'cursor-pointer hover:border-slate-400' : 'opacity-60 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      checked={saleChecked}
                      onChange={(e) => setSaleChecked(e.target.checked)}
                      disabled={!isSaleOwner}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        Tôi đã thực hiện khắc phục
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Cam kết đã liên hệ khách và hoàn tất tiêu chuẩn được giao.
                      </p>
                    </div>
                  </label>

                  <div>
                    <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
                      Ghi chú kết quả ngắn (Bắt buộc)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="VD: Đã gọi lại khách làm rõ bảo hành, chốt lịch ký HĐ..."
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      disabled={!isSaleOwner}
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60"
                    />
                  </div>

                  <EvidencePreview
                    evidenceList={saleEvidences}
                    allowAdd={isSaleOwner}
                    onAddEvidence={(evi) => setSaleEvidences([...saleEvidences, evi])}
                    title="Tải lên Bằng chứng (Ảnh/PDF/Link)"
                  />

                  <button
                    type="submit"
                    disabled={!isSaleOwner || !saleChecked || !saleNotes.trim()}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 disabled:opacity-40 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Gửi Auditor Recheck (SALE_MARKED_DONE)
                  </button>
                </form>
              )}
            </div>

            {/* ================= PANE 2: AUDITOR RECHECK SECTION ================= */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-semibold text-[11px]">
                    2
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Khu vực Auditor Recheck
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Chỉ Auditor mới có quyền Đóng hoặc Mở lại Action
                    </p>
                  </div>
                </div>

                <Badge variant="neutral" size="xs">
                  Auditor: {activeAction.auditorName}
                </Badge>
              </div>

              {/* RBAC notice if current user is not assigned auditor */}
              {!isAssignedAuditor && activeAction.status !== 'VERIFIED_CLOSED' && (
                <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-800">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>
                    Chỉ Auditor phụ trách (<strong>{activeAction.auditorName}</strong>) mới có quyền thực hiện recheck.
                  </span>
                </div>
              )}

              {/* Closed status display */}
              {activeAction.status === 'VERIFIED_CLOSED' ? (
                <div className="p-4 rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-center space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <h4 className="font-semibold text-emerald-900 dark:text-emerald-200 text-xs">
                    Action đã được xác nhận ĐÓNG (VERIFIED_CLOSED)
                  </h4>
                  <p className="text-emerald-700 dark:text-emerald-300 text-[11px]">
                    Auditor đã kiểm tra và ghi nhận cải thiện (IMPROVED).
                  </p>
                </div>
              ) : activeAction.status === 'WAIVED' || activeAction.status === 'CANCELLED' ? (
                <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-center space-y-1.5">
                  <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto" />
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                    Action đã được Miễn trừ (WAIVED)
                  </h4>
                  <p className="text-slate-500 text-[11px]">
                    Lý do: {activeAction.waiveReason || 'Head Auditor phê duyệt miễn trừ.'}
                  </p>
                </div>
              ) : activeAction.status === 'OPEN' || activeAction.status === 'REOPENED' || activeAction.status === 'SALE_MARKED_DONE' ? (
                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div>
                      <h4 className="font-semibold text-amber-950 dark:text-amber-200 text-xs">
                        {activeAction.status === 'SALE_MARKED_DONE'
                          ? 'Sale đã gửi xác nhận, chờ Auditor nghiệm thu'
                          : `Auditor có thể kiểm tra ngay (${activeAction.status})`}
                      </h4>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        Auditor là người quyết định cuối cùng Sale đã sửa lỗi hay chưa. Xác nhận của Sale chỉ là bằng chứng tham khảo.
                      </p>
                    </div>
                    <button
                      onClick={handleStartRecheck}
                      disabled={!isAssignedAuditor}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-medium rounded-md text-xs transition-colors disabled:opacity-40 shrink-0"
                    >
                      Bắt đầu kiểm tra
                    </button>
                  </div>
                </div>
              ) : (
                /* Recheck execution form: active only when IN_RECHECK */
                <div className="space-y-3 text-xs">
                  <div className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span>Action đang trong phiên kiểm tra. Auditor hãy kết luận Sale đã sửa lỗi hay chưa:</span>
                  </div>

                  {/* Verdict Selection: IMPROVED vs NOT_IMPROVED */}
                  <div className="space-y-1">
                    <label className="font-medium block text-slate-700 dark:text-slate-300">
                      Kết luận Recheck của Auditor:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRecheckVerdict('IMPROVED')}
                        disabled={!isAssignedAuditor}
                        className={`p-2.5 rounded-md border text-left transition-colors disabled:opacity-60 ${
                          recheckVerdict === 'IMPROVED'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-medium dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sale đã sửa lỗi</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                          Đóng action (VERIFIED_CLOSED)
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecheckVerdict('NOT_IMPROVED')}
                        disabled={!isAssignedAuditor}
                        className={`p-2.5 rounded-md border text-left transition-colors disabled:opacity-60 ${
                          recheckVerdict === 'NOT_IMPROVED'
                            ? 'bg-rose-50 border-rose-500 text-rose-800 font-medium dark:bg-rose-950/40 dark:text-rose-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Sale chưa sửa lỗi</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                          Mở lại action (REOPENED)
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* When NOT_IMPROVED: Mandatory new deadline per Spec */}
                  {recheckVerdict === 'NOT_IMPROVED' && (
                    <div className="p-2.5 bg-rose-50/70 dark:bg-rose-950/20 rounded-md border border-rose-200 dark:border-rose-800 space-y-1.5">
                      <label className="font-semibold text-rose-900 dark:text-rose-200 block text-xs">
                        Hạn chót mới cho Sale xử lý lại (Bắt buộc theo Spec):
                      </label>
                      <input
                        type="date"
                        value={nextDueDate}
                        onChange={(e) => setNextDueDate(e.target.value)}
                        disabled={!isAssignedAuditor}
                        className="w-full px-2.5 py-1.5 rounded-md border border-rose-300 dark:bg-slate-800 text-xs font-medium"
                      />
                    </div>
                  )}

                  <div>
                    <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
                      Ghi nhận kết quả & Hướng dẫn chỉnh lỗi chi tiết
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ghi rõ bằng chứng kiểm tra, lý do đạt hoặc chưa đạt..."
                      value={recheckNotes}
                      onChange={(e) => setRecheckNotes(e.target.value)}
                      disabled={!isAssignedAuditor}
                      className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60"
                    />
                  </div>

                  <EvidencePreview
                    evidenceList={auditorEvidences}
                    allowAdd={isAssignedAuditor}
                    onAddEvidence={(evi) => setAuditorEvidences([...auditorEvidences, evi])}
                    title="Bằng chứng Recheck của Auditor"
                  />

                  <button
                    type="button"
                    onClick={handleAuditorSubmit}
                    disabled={!isAssignedAuditor || !recheckNotes.trim()}
                    className={`w-full py-2 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      recheckVerdict === 'IMPROVED'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {recheckVerdict === 'IMPROVED' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Xác nhận Đóng Action (VERIFIED_CLOSED)
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Mở lại Action (REOPENED) & Giao hạn mới
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recheck History Audit Trail Table */}
          {activeAction.rechecks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Lịch sử các lần Recheck ({activeAction.rechecks.length})
              </h3>

              <div className="space-y-2">
                {activeAction.rechecks.map((rc) => (
                  <div
                    key={rc.id}
                    className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          Lần {rc.recheckNumber}
                        </span>
                        <Badge
                          variant={rc.result === 'IMPROVED' ? 'success' : 'danger'}
                          size="xs"
                        >
                          {rc.result === 'IMPROVED' ? 'IMPROVED' : 'NOT_IMPROVED'}
                        </Badge>
                        <span className="text-slate-400 text-[11px]">
                          bởi {rc.auditorName} • {new Date(rc.recheckDate).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 font-normal">{rc.notes}</p>
                    </div>

                    {rc.nextDueDate && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">Hạn mới:</span>
                        <span className="font-mono font-semibold text-rose-600 text-xs">
                          {new Date(rc.nextDueDate).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Head Auditor Waive Modal */}
      <Modal
        isOpen={isWaiveModalOpen}
        onClose={() => setIsWaiveModalOpen(false)}
        title="Miễn trừ Action (Head Auditor)"
        subtitle={`Miễn trừ nghĩa vụ khắc phục đối với ${activeAction.code}`}
        maxWidth="md"
      >
        <div className="space-y-3 text-xs">
          <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
            <p className="font-semibold">Quyền hạn Head Auditor:</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Thao tác Miễn trừ (WAIVED) sẽ đóng action mà không tính vào tỷ lệ lỗi của Sale hoặc sản lượng auditor. 
              Bắt buộc phải ghi nhận lý do chính đáng và lưu audit trail bất biến.
            </p>
          </div>

          <div>
            <label className="font-medium block mb-1 text-slate-700 dark:text-slate-300">
              Lý do miễn trừ (Bắt buộc):
            </label>
            <textarea
              rows={3}
              placeholder="VD: Khách hàng đã gửi thông báo phá sản, hoặc đã giải quyết qua kênh khiếu nại riêng có biên bản..."
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsWaiveModalOpen(false)}
              className="px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 text-xs"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmWaive}
              disabled={!waiveReason.trim()}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-md text-xs disabled:opacity-40 transition-colors"
            >
              Xác nhận Miễn trừ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
