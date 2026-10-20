import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { useAuditStore } from '../../services/auditStore';
import { Badge } from '../common/Badge';

const today = new Date().toISOString().slice(0, 10);

export const AuditorAssignmentView: React.FC = () => {
  const {
    currentUser,
    allUsers,
    auditorAssignments,
    createAuditorAssignments,
    getEffectiveAuditorForSale,
  } = useAuditStore();
  const [selectedAuditorId, setSelectedAuditorId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState('Luân chuyển định kỳ để đảm bảo độc lập audit');
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const canManage = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';
  const auditors = useMemo(
    () => allUsers.filter((user) => user.role === 'AUDITOR' && user.auditorId && user.isActive),
    [allUsers]
  );
  const sales = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return allUsers.filter(
      (user) =>
        user.role === 'SALE' &&
        user.saleId &&
        user.isActive &&
        (!normalizedQuery ||
          user.name.toLocaleLowerCase('vi-VN').includes(normalizedQuery) ||
          user.teamName?.toLocaleLowerCase('vi-VN').includes(normalizedQuery))
    );
  }, [allUsers, query]);

  const toggleSale = (saleId: string) => {
    setSelectedSaleIds((previous) =>
      previous.includes(saleId)
        ? previous.filter((id) => id !== saleId)
        : [...previous, saleId]
    );
  };

  const toggleVisibleSales = () => {
    const visibleIds = sales.flatMap((sale) => (sale.saleId ? [sale.saleId] : []));
    const allVisibleSelected = visibleIds.every((id) => selectedSaleIds.includes(id));
    setSelectedSaleIds((previous) =>
      allVisibleSelected
        ? previous.filter((id) => !visibleIds.includes(id))
        : [...new Set([...previous, ...visibleIds])]
    );
  };

  const saveAssignments = () => {
    if (!selectedAuditorId) {
      setFeedback({ success: false, message: 'Chọn Auditor nhận portfolio trước.' });
      return;
    }
    const result = createAuditorAssignments(selectedSaleIds, selectedAuditorId, effectiveFrom, reason);
    setFeedback(result);
    if (result.success) setSelectedSaleIds([]);
  };

  const visibleIds = sales.flatMap((sale) => (sale.saleId ? [sale.saleId] : []));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSaleIds.includes(id));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            Chỉ Head Auditor / Admin
          </div>
          <h1 className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">Phân công Auditor</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Chọn sale theo portfolio và đặt ngày hiệu lực. Khi luân chuyển, lịch sử cũ được giữ nguyên để truy vết và tránh auditor theo một sale quá lâu.
          </p>
        </div>
        <Badge variant="purple" size="sm">{auditorAssignments.length} dòng lịch sử phân công</Badge>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bạn chỉ có quyền xem portfolio. Chỉ Head Auditor hoặc Admin được lưu thay đổi.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <label className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">1. Auditor nhận portfolio</span>
              <select
                value={selectedAuditorId}
                onChange={(event) => setSelectedAuditorId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">Chọn Auditor…</option>
                {auditors.map((auditor) => (
                  <option key={auditor.auditorId} value={auditor.auditorId}>{auditor.name}</option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">2. Bắt đầu hiệu lực</span>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>

            <label className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">3. Lý do lưu vết</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {feedback && (
            <div className={`rounded-xl border p-3 text-xs font-semibold flex items-center gap-2 ${feedback.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              {feedback.success ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {feedback.message}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2"><Users className="w-4 h-4 text-brand-600" /> Chọn sale để phân công</h2>
                <p className="mt-1 text-xs text-slate-500">Đã chọn {selectedSaleIds.length} sale. Sale đổi team vẫn giữ auditor cũ cho đến khi bạn luân chuyển tại đây.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sale hoặc team…" className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSales} aria-label="Chọn tất cả sale đang hiển thị" /></th>
                    <th className="px-3 py-3">Sale</th>
                    <th className="px-3 py-3">Team hiện tại</th>
                    <th className="px-3 py-3">Auditor hiện tại</th>
                    <th className="px-3 py-3">Hiệu lực đến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sales.map((sale) => {
                    const assignment = sale.saleId ? getEffectiveAuditorForSale(sale.saleId, effectiveFrom) : undefined;
                    const selected = sale.saleId ? selectedSaleIds.includes(sale.saleId) : false;
                    return (
                      <tr key={sale.id} className={selected ? 'bg-brand-50/60 dark:bg-brand-950/20' : ''}>
                        <td className="px-4 py-3"><input type="checkbox" checked={selected} onChange={() => sale.saleId && toggleSale(sale.saleId)} aria-label={`Chọn ${sale.name}`} /></td>
                        <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">{sale.name}</td>
                        <td className="px-3 py-3 text-slate-500">{sale.teamName || 'Chưa có team'}</td>
                        <td className="px-3 py-3">{assignment ? <Badge variant="purple" size="xs">{assignment.auditorName}</Badge> : <span className="text-amber-600">Chưa phân công</span>}</td>
                        <td className="px-3 py-3 text-slate-500">{assignment?.effectiveTo || 'Đang hiệu lực'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={saveAssignments} className="rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors">
              Lưu phân công {selectedSaleIds.length ? `(${selectedSaleIds.length})` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
