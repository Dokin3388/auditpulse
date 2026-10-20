import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  AlertTriangle,
  History,
  Plus,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

const TODAY_DATE = '2026-10-20';

export const AuditorPortfolioView: React.FC = () => {
  const {
    currentUser,
    allUsers,
    auditorAssignments,
    teamChangeAlerts,
    queueItems,
    createAuditorAssignment,
  } = useAuditStore();

  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  // 3 fixed active Auditors
  const auditors = allUsers.filter((u) => u.role === 'AUDITOR');

  // Modal create assignment
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState('SALE-04');
  const [targetAuditorId, setTargetAuditorId] = useState('AUD-03');
  const [effectiveFromDate, setEffectiveFromDate] = useState('2026-10-21');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter sales for assignment options
  const saleUsers = allUsers.filter((u) => u.role === 'SALE');

  // Calculate current workload per auditor
  const getWorkload = (auditorId: string) => {
    const assignedSales = auditorAssignments.filter(
      (asg) => asg.auditorId === auditorId && asg.isActive
    );
    const pendingCases = queueItems.filter(
      (q) => q.assignedAuditorId === auditorId && (q.status === 'ASSIGNED' || q.status === 'IN_REVIEW')
    ).length;
    return {
      saleCount: assignedSales.length,
      pendingCases,
      sales: assignedSales,
    };
  };

  const handleOpenAssignForSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    setEffectiveFromDate('2026-10-21');
    setAssignmentReason('Điều chỉnh portfolio do sale đổi cơ cấu team');
    setIsAssignModalOpen(true);
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentReason.trim()) return;

    const res = createAuditorAssignment(
      selectedSaleId,
      targetAuditorId,
      effectiveFromDate,
      assignmentReason
    );

    if (res.success) {
      setMsg({ type: 'success', text: res.message });
      setIsAssignModalOpen(false);
      setAssignmentReason('');
    } else {
      setMsg({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              Cơ cấu 3 Auditor Cố định
            </span>
            <span className="text-xs text-slate-400">Spec v1.1 Mục 3</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            Phân công Auditor Portfolio (Auditor Assignment)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mỗi sale được phân cố định cho đúng 1 auditor tại 1 thời điểm; quản lý theo ngày hiệu lực.
          </p>
        </div>

        {isHeadAuditor ? (
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Điều chỉnh Phân công Mới
          </button>
        ) : (
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Chỉ Head Auditor có quyền điều chỉnh phân công</span>
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {msg.text}
        </div>
      )}

      {/* Sale Team Change Alerts Box per Spec */}
      {teamChangeAlerts.filter((a) => !a.reviewed).length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Cảnh báo Sale Đổi Team cần rà soát phân công ({teamChangeAlerts.filter((a) => !a.reviewed).length})
            </h3>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Nguyên tắc: Không tự động chuyển auditor theo team
            </span>
          </div>

          <div className="space-y-2">
            {teamChangeAlerts
              .filter((a) => !a.reviewed)
              .map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 dark:text-slate-100">{alert.saleName}</strong>
                      <span className="text-slate-400 font-normal">
                        ({alert.oldTeam} → <strong className="text-brand-600">{alert.newTeam}</strong>)
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                      Auditor hiện phụ trách: <strong>{alert.currentAuditorName}</strong>. {alert.suggestedAction}
                    </p>
                  </div>

                  {isHeadAuditor && (
                    <button
                      onClick={() => handleOpenAssignForSale(alert.saleId)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shrink-0 transition-colors"
                    >
                      Tạo Phân công Mới
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 3 Auditors Workload Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {auditors.map((auditor) => {
          const load = getWorkload(auditor.auditorId || '');
          return (
            <div
              key={auditor.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-brand-500 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src={auditor.avatarUrl}
                    alt={auditor.name}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-500/20"
                  />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {auditor.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="info" size="xs">
                        {auditor.auditorId}
                      </Badge>
                      <span className="text-[11px] text-slate-400">Senior Auditor</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-center">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                      Sale Portfolio
                    </span>
                    <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                      {load.saleCount}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">
                      Queue Đang chờ
                    </span>
                    <span className="text-lg font-black text-brand-600 dark:text-brand-400">
                      {load.pendingCases}
                    </span>
                  </div>
                </div>

                {/* Assigned Sales List */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Danh sách Sale phụ trách:
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {load.sales.map((asg) => (
                      <div
                        key={asg.id}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {asg.saleName}
                          </div>
                          <div className="text-[10px] text-slate-400">{asg.teamName}</div>
                        </div>
                        <div className="text-right text-[10px] text-slate-400">
                          <span>Từ {asg.effectiveFrom}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                Tải danh mục cân bằng SLA • Múi giờ Asia/Ho_Chi_Minh
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Assignment History Table per Spec Section 3 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <History className="w-4 h-4 text-brand-600" />
              Lịch sử Thay đổi Phân công theo Ngày Hiệu lực
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Hệ thống không ghi đè phân công cũ; đóng assignment bằng effective_to và chặn 2 phân công đồng thời.
            </p>
          </div>
          <Badge variant="neutral" size="sm">
            {auditorAssignments.length} lượt phân công
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-400 border-b dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Sale</th>
                <th className="py-2.5 px-3 font-semibold">Team tại thời điểm</th>
                <th className="py-2.5 px-3 font-semibold">Auditor phụ trách</th>
                <th className="py-2.5 px-3 font-semibold">Hiệu lực từ</th>
                <th className="py-2.5 px-3 font-semibold">Hiệu lực đến</th>
                <th className="py-2.5 px-3 font-semibold">Lý do phân công</th>
                <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditorAssignments.map((asg) => (
                <tr key={asg.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                    {asg.saleName}
                  </td>
                  <td className="py-3 px-3 text-slate-500">{asg.teamName}</td>
                  <td className="py-3 px-3 font-semibold text-brand-600 dark:text-brand-400">
                    {asg.auditorName}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                    {asg.effectiveFrom}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                    {asg.effectiveTo || <span className="text-emerald-600 font-bold">Hiện hành (Active)</span>}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                    {asg.assignmentReason}
                  </td>
                  <td className="py-3 px-3">
                    {asg.isActive ? (
                      <Badge variant="success" size="xs">
                        Đang hiệu lực
                      </Badge>
                    ) : asg.effectiveFrom > TODAY_DATE ? (
                      <Badge variant="info" size="xs">
                        Sắp hiệu lực (Future)
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="xs">
                        Đã đóng
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Assignment Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Tạo Phân công Auditor Mới (Head Auditor)"
        subtitle="Tuân thủ Spec v1.1: Tự động đóng assignment cũ bằng effective_to và chặn trùng lặp"
        maxWidth="md"
      >
        <form onSubmit={handleCreateAssignment} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Sale cần phân công:
            </label>
            <select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs"
            >
              {saleUsers.map((s) => (
                <option key={s.saleId} value={s.saleId}>
                  {s.name} ({s.teamName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Auditor mới phụ trách:
            </label>
            <select
              value={targetAuditorId}
              onChange={(e) => setTargetAuditorId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs"
            >
              {auditors.map((a) => (
                <option key={a.auditorId} value={a.auditorId}>
                  {a.name} ({a.auditorId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Ngày bắt đầu hiệu lực (effective_from):
            </label>
            <input
              type="date"
              value={effectiveFromDate}
              onChange={(e) => setEffectiveFromDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-slate-700 dark:text-slate-300">
              Lý do phân công (Bắt buộc lưu lịch sử):
            </label>
            <textarea
              rows={2}
              placeholder="VD: Cân bằng tải portfolio, sale đổi team sang Key Account..."
              value={assignmentReason}
              onChange={(e) => setAssignmentReason(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!assignmentReason.trim()}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              Lưu Phân công Mới
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
