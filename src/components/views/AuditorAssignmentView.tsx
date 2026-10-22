import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  History,
  Info,
} from 'lucide-react';
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
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const canManage = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  const auditors = useMemo(
    () => allUsers.filter((user) => user.role === 'AUDITOR' && user.auditorId && user.isActive),
    [allUsers]
  );

  const teamList = useMemo(() => {
    const teams = new Map<string, string>();
    allUsers.forEach((u) => {
      if (u.role === 'SALE' && u.teamId && u.teamName) {
        teams.set(u.teamId, u.teamName);
      }
    });
    return Array.from(teams.entries()).map(([id, name]) => ({ id, name }));
  }, [allUsers]);

  const sales = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return allUsers.filter(
      (user) =>
        user.role === 'SALE' &&
        user.saleId &&
        user.isActive &&
        (selectedTeam === 'ALL' || user.teamId === selectedTeam) &&
        (!normalizedQuery ||
          user.name.toLocaleLowerCase('vi-VN').includes(normalizedQuery) ||
          user.teamName?.toLocaleLowerCase('vi-VN').includes(normalizedQuery) ||
          user.saleId.toLocaleLowerCase('vi-VN').includes(normalizedQuery))
    );
  }, [allUsers, query, selectedTeam]);

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
      setFeedback({ success: false, message: 'Vui lòng chọn Auditor nhận portfolio trước.' });
      return;
    }
    if (selectedSaleIds.length === 0) {
      setFeedback({ success: false, message: 'Vui lòng chọn ít nhất một nhân viên Sale để phân công.' });
      return;
    }
    const result = createAuditorAssignments(selectedSaleIds, selectedAuditorId, effectiveFrom, reason);
    setFeedback(result);
    if (result.success) setSelectedSaleIds([]);
  };

  const visibleIds = sales.flatMap((sale) => (sale.saleId ? [sale.saleId] : []));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSaleIds.includes(id));

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <span>Phân hệ Quản trị Portfolio Auditor</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Phân công Auditor (Auditor Assignment)
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Gán danh mục Sale cho Auditor theo ngày hiệu lực. Khi gán Sale cho Auditor, toàn bộ khách của Sale đó tự động hiển thị trong queue của Auditor theo ngày hiệu lực.
          </p>
        </div>

        <Badge variant="neutral" size="sm">
          {auditorAssignments.length} lượt phân công trong hệ thống
        </Badge>
      </div>

      {!canManage && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          Bạn đang xem portfolio ở chế độ chỉ đọc. Chỉ Head Auditor hoặc Admin mới có quyền tạo phân công mới.
        </div>
      )}

      {/* Filter Toolbar for Sales: Team filter + Search query */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              Lọc theo Team:
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="text-sm px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium"
            >
              <option value="ALL">Tất cả Team Sale</option>
              {teamList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-500">
            (Có <strong>{sales.length}</strong> nhân viên sale)
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc mã sale..."
            className="w-full pl-8 pr-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-md border p-3.5 text-sm font-medium flex items-center gap-2 ${
            feedback.success
              ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.success ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <RotateCcw className="w-5 h-5 text-rose-600" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 2-Column Layout: Left Sale List, Right Assignment Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (8 cols): Danh sách Sale */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Danh sách nhân viên Sale
            </h2>
            <span className="text-xs text-slate-500">
              Đã chọn: <strong className="text-slate-900 dark:text-slate-100">{selectedSaleIds.length}</strong> / {sales.length}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-sm border-collapse min-w-[700px]">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="w-12 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSales}
                      aria-label="Chọn tất cả sale đang hiển thị"
                      className="rounded border-slate-300 w-4 h-4"
                    />
                  </th>
                  <th className="px-3 py-3">Sale</th>
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3">Auditor hiện tại</th>
                  <th className="px-3 py-3">Ngày bắt đầu</th>
                  <th className="px-3 py-3">Ngày kết thúc</th>
                  <th className="px-3 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sales.map((sale) => {
                  const assignment = sale.saleId ? getEffectiveAuditorForSale(sale.saleId, effectiveFrom) : undefined;
                  const selected = sale.saleId ? selectedSaleIds.includes(sale.saleId) : false;
                  return (
                    <tr
                      key={sale.id}
                      onClick={() => sale.saleId && toggleSale(sale.saleId)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-slate-100 dark:bg-slate-800/80 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                      }`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => sale.saleId && toggleSale(sale.saleId)}
                          aria-label={`Chọn ${sale.name}`}
                          className="rounded border-slate-300 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{sale.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{sale.saleId}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 font-medium">
                        {sale.teamName || 'Chưa có team'}
                      </td>
                      <td className="px-3 py-3">
                        {assignment ? (
                          <Badge variant="blue" size="xs">
                            {assignment.auditorName}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 font-medium">Chưa gán</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {assignment?.effectiveFrom || '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {assignment?.effectiveTo || 'Hiện hành'}
                      </td>
                      <td className="px-3 py-3">
                        {assignment?.isActive ? (
                          <Badge variant="success" size="xs">Đang hiệu lực</Badge>
                        ) : assignment ? (
                          <Badge variant="neutral" size="xs">Đã kết thúc</Badge>
                        ) : (
                          <Badge variant="warning" size="xs">Chờ gán</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Không tìm thấy nhân viên Sale nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (4 cols): Bảng gán Auditor được phân công (Sticky) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-lg border-2 border-slate-300 dark:border-slate-700 p-4 shadow-sm space-y-4 sticky top-18">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              <span>Gán Auditor cho Sale</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Áp dụng cho toàn bộ danh mục khách của các Sale được chọn.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Số lượng Sale đã chọn:</span>
            <Badge variant={selectedSaleIds.length > 0 ? 'blue' : 'neutral'} size="md">
              {selectedSaleIds.length} nhân viên Sale
            </Badge>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Auditor được phân công <span className="text-rose-600">*</span>:
              </label>
              <select
                value={selectedAuditorId}
                onChange={(event) => setSelectedAuditorId(event.target.value)}
                disabled={!canManage}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium"
              >
                <option value="">-- Chọn Auditor nhận portfolio --</option>
                {auditors.map((auditor) => (
                  <option key={auditor.auditorId} value={auditor.auditorId}>
                    {auditor.name} ({auditor.auditorId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Ngày bắt đầu hiệu lực (effective_from) <span className="text-rose-600">*</span>:
              </label>
              <div className="flex items-center gap-2 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2 bg-white dark:bg-slate-800">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={!canManage}
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 outline-none font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Lý do lưu vết phân công:
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={!canManage}
                placeholder="VD: Luân chuyển định kỳ, sale chuyển team..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="p-3 rounded-md bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-4 h-4 shrink-0 text-blue-600" />
                <span>Quy tắc vận hành:</span>
              </div>
              <p className="leading-relaxed">
                Không cần phân công từng case riêng lẻ. Khi gán Sale cho Auditor, toàn bộ khách của Sale đó sẽ tự động hiển thị trong queue của Auditor theo ngày hiệu lực.
              </p>
            </div>

            <button
              onClick={saveAssignments}
              disabled={!canManage || selectedSaleIds.length === 0 || !selectedAuditorId}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 font-bold rounded-md text-sm shadow-sm transition-colors disabled:opacity-40"
            >
              Lưu phân công {selectedSaleIds.length > 0 ? `(${selectedSaleIds.length} Sale)` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Assignment History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            Lịch sử phân công theo ngày hiệu lực
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Tự động khép lịch bằng effective_to
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[750px]">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3">Sale</th>
                <th className="py-2.5 px-3">Team</th>
                <th className="py-2.5 px-3">Auditor phụ trách</th>
                <th className="py-2.5 px-3">Hiệu lực từ</th>
                <th className="py-2.5 px-3">Hiệu lực đến</th>
                <th className="py-2.5 px-3">Lý do</th>
                <th className="py-2.5 px-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditorAssignments.slice(0, 20).map((asg) => (
                <tr key={asg.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">{asg.saleName}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{asg.teamName}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">{asg.auditorName}</td>
                  <td className="py-2.5 px-3 font-mono text-xs">{asg.effectiveFrom}</td>
                  <td className="py-2.5 px-3 font-mono text-xs">{asg.effectiveTo || <span className="text-emerald-700 font-semibold">Hiện hành</span>}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-xs truncate max-w-xs">{asg.assignmentReason}</td>
                  <td className="py-2.5 px-3">
                    {asg.isActive ? <Badge variant="success" size="xs">Đang hiệu lực</Badge> : <Badge variant="neutral" size="xs">Đã đóng</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
