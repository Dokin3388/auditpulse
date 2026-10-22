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
  Send,
  Clock,
  Calendar,
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
  const [nextDueDate, setNextDueDate] = useState('2026-10-25');
  const [auditorEvidences, setAuditorEvidences] = useState<Evidence[]>([]);

  // Head Auditor waive modal state
  const [isWaiveModalOpen, setIsWaiveModalOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');

  // Status message
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Strict permission checks
  const isSaleOwner = currentUser.role === 'SALE' && currentUser.saleId === activeAction?.saleId;
  const isAssignedAuditor = currentUser.role === 'AUDITOR' && currentUser.auditorId === activeAction?.auditorId;
  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';
  const canAudit = isAssignedAuditor || isHeadAuditor;

  // Handlers
  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    const res = saleMarkActionDone(activeAction.id, saleNotes, saleEvidences[0]);
    if (res.success) {
      setStatusMessage({ type: 'success', message: res.message });
      setSaleNotes('');
      setSaleEvidences([]);
      setSaleChecked(false);
    } else {
      setStatusMessage({ type: 'error', message: res.message });
    }
  };

  const handleStartRecheck = () => {
    if (!activeAction) return;
    const res = auditorStartRecheck(activeAction.id);
    if (res.success) {
      setStatusMessage({ type: 'success', message: res.message });
    } else {
      setStatusMessage({ type: 'error', message: res.message });
    }
  };

  const handleAuditorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAction) return;

    if (!recheckNotes.trim()) {
      setStatusMessage({ type: 'error', message: 'Vui lòng nhập ghi chú kiểm tra của Auditor.' });
      return;
    }

    if (recheckVerdict === 'NOT_IMPROVED' && !nextDueDate) {
      setStatusMessage({ type: 'error', message: 'Khi chọn "Sale chưa sửa lỗi", bắt buộc chọn hạn xử lý mới.' });
      return;
    }

    const res = auditorSubmitRecheck(
      activeAction.id,
      recheckVerdict,
      recheckNotes,
      nextDueDate,
      auditorEvidences[0]
    );

    if (res.success) {
      setStatusMessage({ type: 'success', message: res.message });
      setRecheckNotes('');
      setAuditorEvidences([]);
    } else {
      setStatusMessage({ type: 'error', message: res.message });
    }
  };

  const handleConfirmWaive = () => {
    if (!activeAction || !waiveReason.trim()) return;
    const res = headAuditorWaiveAction(activeAction.id, waiveReason);
    if (res.success) {
      setStatusMessage({ type: 'success', message: res.message });
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

  const isClosed = activeAction.status === 'VERIFIED_CLOSED';
  const isWaived = activeAction.status === 'WAIVED' || activeAction.status === 'CANCELLED';

  return (
    <div className="space-y-5 pb-12">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Chi tiết Corrective Action: {activeAction.code}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Quy trình theo dõi khắc phục và kiểm tra lại kết quả giữa Sale và Auditor.
          </p>
        </div>

        {/* Head Auditor Waive Shortcut */}
        {isHeadAuditor && !isClosed && !isWaived && (
          <button
            onClick={() => setIsWaiveModalOpen(true)}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md border border-slate-300 dark:border-slate-700 text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <span>Miễn trừ Action</span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-md text-sm font-medium flex items-center gap-2 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Main Split Layout: Left List Selector + Right 3-Section Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col: Action Selector List */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Danh sách Action ({filteredActions.length})
            </h3>
          </div>

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {filteredActions.map((act) => {
              const isSelected = act.id === activeAction.id;
              return (
                <div
                  key={act.id}
                  onClick={() => setSelectedActionId(act.id)}
                  className={`p-3 rounded-md border text-sm transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm tracking-tight">{act.code}</span>
                    <ActionStatusBadge status={act.status} isOverdue={act.isOverdue} />
                  </div>

                  <div className={`font-semibold text-sm mt-1 truncate ${isSelected ? 'text-white dark:text-slate-900' : 'text-slate-900 dark:text-slate-100'}`}>
                    {act.customerName}
                  </div>

                  <div className={`text-xs mt-1 truncate ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500'}`}>
                    Sale: {act.saleName} ({act.teamName})
                  </div>

                  <div className={`flex items-center justify-between text-xs mt-2 pt-1 border-t ${isSelected ? 'border-white/20 dark:border-slate-300' : 'border-slate-100 dark:border-slate-800'}`}>
                    <span className="truncate">Lỗi: {act.issueCode}</span>
                    <span className="font-mono">{new Date(act.dueDate).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: 3 Clearly Separated Sections */}
        <div className="lg:col-span-8 space-y-4">
          {/* ================= PHẦN 1: THÔNG TIN KHÁCH HÀNG VÀ SALE ================= */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                  1
                </span>
                Thông tin khách hàng và Sale
              </h2>
              <ActionStatusBadge status={activeAction.status} isOverdue={activeAction.isOverdue} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Khách hàng:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-bold text-base">
                    {activeAction.customerName}
                  </strong>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <span>Số điện thoại:</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {activeAction.customerPhone}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Sale phụ trách:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                    {activeAction.saleName}
                  </strong>
                  <span className="text-xs text-slate-500">({activeAction.teamName})</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Auditor phụ trách:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                    {activeAction.auditorName}
                  </strong>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Hạn chót:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {new Date(activeAction.dueDate).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <span>SLA Rule Version:</span>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {activeAction.slaRuleVersion}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ================= PHẦN 2: LỖI/RISK PHÁT HIỆN TỪ RULE & TIÊU CHUẨN ================= */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                2
              </span>
              Lỗi vi phạm & Tiêu chuẩn khắc phục
            </h2>

            <div className="space-y-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-850 rounded-md border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase block">Sai phạm phát hiện:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-bold text-base mt-0.5 block">
                    [{activeAction.issueCode}] {activeAction.issueName}
                  </strong>
                </div>
                <SeverityBadge severity={activeAction.severity} />
              </div>

              {/* Completion criteria */}
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-md border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="font-semibold text-slate-600 dark:text-slate-400 uppercase text-xs tracking-wider block">
                  Tiêu chí hoàn tất & Hướng dẫn sửa lỗi từ Auditor:
                </span>
                <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                  {activeAction.completionCriteria}
                </p>
                {activeAction.guidanceNotes && (
                  <p className="text-slate-500 text-xs mt-1 italic">
                    Ghi chú thêm: {activeAction.guidanceNotes}
                  </p>
                )}
              </div>

              {/* Khu vực thông tin nộp của Sale (Tham khảo cho Auditor) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3.5 bg-slate-50/60 dark:bg-slate-850/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Phản hồi từ nhân viên Sale:
                  </span>
                  {activeAction.saleMarkedDone ? (
                    <Badge variant="warning" size="xs">
                      Đã nộp ngày {new Date(activeAction.saleMarkedDoneAt || '').toLocaleDateString('vi-VN')}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="xs">Chưa nộp phản hồi</Badge>
                  )}
                </div>

                {activeAction.saleMarkedDone ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      "{activeAction.saleNotes || 'Không có ghi chú thêm.'}"
                    </p>
                    {activeAction.saleEvidenceList.length > 0 && (
                      <EvidencePreview
                        evidenceList={activeAction.saleEvidenceList}
                        title="Bằng chứng Sale đã đính kèm"
                        readOnly={true}
                      />
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-500">
                      Sale chưa bấm gửi xác nhận khắc phục cho action này.
                    </p>

                    {/* Form for sale if current user is sale owner */}
                    {isSaleOwner && (activeAction.status === 'OPEN' || activeAction.status === 'REOPENED') && (
                      <form onSubmit={handleSaleSubmit} className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saleChecked}
                            onChange={(e) => setSaleChecked(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            Tôi cam kết đã thực hiện khắc phục theo đúng hướng dẫn
                          </span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Nhập ghi chú kết quả xử lý..."
                          value={saleNotes}
                          onChange={(e) => setSaleNotes(e.target.value)}
                          className="w-full text-sm p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="submit"
                          disabled={!saleChecked || !saleNotes.trim()}
                          className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-semibold disabled:opacity-40"
                        >
                          Gửi xác nhận khắc phục
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================= PHẦN 3: KẾT LUẬN CỦA AUDITOR (NỔI BẬT NHẤT) ================= */}
          <div className="bg-slate-50 dark:bg-slate-850 p-5 rounded-lg border-2 border-slate-400 dark:border-slate-600 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-xs">
                    3
                  </span>
                  Kết luận nghiệm thu của Auditor
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Auditor là người quyết định cuối cùng về việc đóng hay yêu cầu sửa lại.
                </p>
              </div>
              <Badge variant="blue" size="sm">
                Auditor: {activeAction.auditorName}
              </Badge>
            </div>

            {/* If Closed */}
            {isClosed ? (
              <div className="p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                  Action đã được nghiệm thu ĐẠT và ĐÓNG (VERIFIED_CLOSED)
                </h4>
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  Auditor đã kiểm tra và ghi nhận hành vi đã cải thiện. Quy trình hoàn tất.
                </p>
              </div>
            ) : isWaived ? (
              <div className="p-4 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-center space-y-1.5">
                <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto" />
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                  Action đã được Miễn trừ (WAIVED)
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Lý do: {activeAction.waiveReason || 'Head Auditor phê duyệt miễn trừ.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleAuditorSubmit} className="space-y-4">
                {/* State warning if still in OPEN and not yet SALE_MARKED_DONE */}
                {activeAction.status === 'OPEN' || activeAction.status === 'REOPENED' ? (
                  <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Action đang ở trạng thái <strong>{activeAction.status}</strong> (Chờ Sale khắc phục). 
                      Auditor có thể recheck sớm hoặc chờ Sale xác nhận đã hoàn thành.
                    </span>
                  </div>
                ) : activeAction.status === 'SALE_MARKED_DONE' && (
                  <div className="flex items-center justify-between p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 text-xs text-blue-900 dark:text-blue-200">
                    <span>Sale đã nộp xác nhận. Bấm để bắt đầu phiên đánh giá:</span>
                    <button
                      type="button"
                      onClick={handleStartRecheck}
                      disabled={!canAudit}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-semibold text-xs"
                    >
                      Bắt đầu phiên Recheck
                    </button>
                  </div>
                )}

                {/* HAI NÚT LỚN CỦA AUDITOR: "Sale đã sửa lỗi" vs "Sale chưa sửa lỗi" */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-900 dark:text-slate-100 block">
                    Đánh giá kết quả của Auditor:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRecheckVerdict('IMPROVED')}
                      disabled={!canAudit}
                      className={`p-4 rounded-md border-2 text-left transition-all ${
                        recheckVerdict === 'IMPROVED'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 shadow-sm'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`w-5 h-5 ${recheckVerdict === 'IMPROVED' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-bold text-base">Sale đã sửa lỗi</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 pl-7">
                        Xác nhận đạt tiêu chuẩn, đóng action (VERIFIED_CLOSED).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecheckVerdict('NOT_IMPROVED')}
                      disabled={!canAudit}
                      className={`p-4 rounded-md border-2 text-left transition-all ${
                        recheckVerdict === 'NOT_IMPROVED'
                          ? 'border-rose-600 bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200 shadow-sm'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <XCircle className={`w-5 h-5 ${recheckVerdict === 'NOT_IMPROVED' ? 'text-rose-600' : 'text-slate-400'}`} />
                        <span className="font-bold text-base">Sale chưa sửa lỗi</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 pl-7">
                        Chưa đạt yêu cầu, mở lại action (REOPENED) và đặt hạn mới.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Ghi chú kiểm tra của Auditor (Bắt buộc) */}
                <div>
                  <label className="text-sm font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                    Ghi chú kiểm tra của Auditor <span className="text-rose-600">*</span>:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ghi rõ nhận xét, căn cứ kiểm tra thực tế trên CRM/ERP..."
                    value={recheckNotes}
                    onChange={(e) => setRecheckNotes(e.target.value)}
                    disabled={!canAudit}
                    className="w-full text-sm p-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    required
                  />
                </div>

                {/* Bắt buộc chọn hạn xử lý mới nếu "Sale chưa sửa lỗi" */}
                {recheckVerdict === 'NOT_IMPROVED' && (
                  <div className="p-3.5 rounded-md bg-rose-50/60 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 space-y-2">
                    <label className="text-sm font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-rose-600" />
                      <span>Hạn xử lý mới cho Sale (Bắt buộc):</span>
                    </label>
                    <input
                      type="date"
                      value={nextDueDate}
                      onChange={(e) => setNextDueDate(e.target.value)}
                      disabled={!canAudit}
                      className="text-sm px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-md font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      required
                    />
                    <p className="text-xs text-rose-800 dark:text-rose-300">
                      Sale sẽ có hạn đến ngày này để tiếp tục liên hệ khách hàng và khắc phục lại.
                    </p>
                  </div>
                )}

                {/* Bằng chứng nếu có */}
                <EvidencePreview
                  evidenceList={auditorEvidences}
                  allowAdd={canAudit}
                  onAddEvidence={(evi) => setAuditorEvidences([...auditorEvidences, evi])}
                  title="Bằng chứng kiểm tra của Auditor (Nếu có)"
                />

                {/* Nút gửi kết luận lớn */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!canAudit || !recheckNotes.trim()}
                    className={`w-full py-3 rounded-md text-base font-bold text-white shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40 ${
                      recheckVerdict === 'IMPROVED'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    <Send className="w-5 h-5" />
                    <span>
                      {recheckVerdict === 'IMPROVED'
                        ? 'Xác nhận Đạt & Đóng Action (VERIFIED_CLOSED)'
                        : 'Xác nhận Chưa đạt & Mở lại Action (REOPENED)'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Waive Modal */}
      <Modal
        isOpen={isWaiveModalOpen}
        onClose={() => setIsWaiveModalOpen(false)}
        title="Miễn trừ Corrective Action (Head Auditor)"
        subtitle={`Phê duyệt miễn trừ trách nhiệm cho action: ${activeAction.code}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Hành động miễn trừ sẽ đóng action mà không ghi nhận lỗi hay chế tài cho Sale.
          </p>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Lý do miễn trừ (Bắt buộc):
            </label>
            <textarea
              rows={3}
              placeholder="VD: Khách hàng yêu cầu hủy dự án, lỗi hệ thống ERP..."
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              className="w-full p-2.5 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsWaiveModalOpen(false)}
              className="px-3.5 py-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmWaive}
              disabled={!waiveReason.trim()}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold rounded-md disabled:opacity-40 transition-colors"
            >
              Xác nhận Miễn trừ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
