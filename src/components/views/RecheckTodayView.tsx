import React, { useState, useMemo } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  Clock,
  AlertTriangle,
  Search,
  ArrowRight,
  User,
} from 'lucide-react';
import { ActionStatusBadge, SeverityBadge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import type { NavTab } from '../layout/Sidebar';

interface RecheckTodayViewProps {
  onSelectAction: (actionId: string) => void;
  onNavigate: (tab: NavTab) => void;
}

export const RecheckTodayView: React.FC<RecheckTodayViewProps> = ({
  onSelectAction,
  onNavigate,
}) => {
  const { filteredActions } = useAuditStore();

  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter actions that require auditor recheck or attention
  const recheckQueue = useMemo(() => {
    return filteredActions
      .filter((act) => {
        // Only active/unresolved actions
        if (act.status === 'VERIFIED_CLOSED' || act.status === 'CANCELLED' || act.status === 'WAIVED') {
          return false;
        }

        // Search
        const matchSearch =
          act.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          act.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          act.saleName.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchSearch) return false;

        // Severity
        if (filterSeverity !== 'ALL' && act.severity !== filterSeverity) return false;

        return true;
      })
      .sort((a, b) => {
        // Priority 1: Overdue first
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;

        // Priority 2: SALE_MARKED_DONE (waiting for auditor)
        if (a.status === 'SALE_MARKED_DONE' && b.status !== 'SALE_MARKED_DONE') return -1;
        if (a.status !== 'SALE_MARKED_DONE' && b.status === 'SALE_MARKED_DONE') return 1;

        // Priority 3: Severity HIGH > MEDIUM > LOW
        const sevOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return sevOrder[b.severity] - sevOrder[a.severity];
      });
  }, [filteredActions, filterSeverity, searchTerm]);

  const urgentCount = recheckQueue.filter(
    (a) => a.isOverdue || a.status === 'SALE_MARKED_DONE'
  ).length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Ưu tiên Hằng ngày
            </span>
            <span className="text-xs text-slate-400">Ngày audit: 20/10/2026</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            Hàng chờ Recheck Hôm nay (Recheck Today)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Danh sách việc cần kiểm tra lại, ưu tiên theo mức độ quá hạn và rủi ro nghiêm trọng.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>{urgentCount} việc cần recheck gấp</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo khách, mã action, sale..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap">Lọc mức độ:</span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-slate-100"
          >
            <option value="ALL">Tất cả mức độ</option>
            <option value="HIGH">Rủi ro CAO</option>
            <option value="MEDIUM">Rủi ro TRUNG BÌNH</option>
            <option value="LOW">Rủi ro THẤP</option>
          </select>
        </div>
      </div>

      {/* Recheck List */}
      {recheckQueue.length === 0 ? (
        <EmptyState
          type="empty"
          title="Không có việc cần Recheck"
          description="Tất cả các action trong phạm vi của bạn đã được xác nhận cải thiện hoặc chưa đến hạn recheck."
        />
      ) : (
        <div className="space-y-3">
          {recheckQueue.map((action) => {
            const isWaitingAuditor = action.status === 'SALE_MARKED_DONE';
            return (
              <div
                key={action.id}
                onClick={() => {
                  onSelectAction(action.id);
                  onNavigate('action-detail');
                }}
                className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  action.isOverdue
                    ? 'border-rose-300 dark:border-rose-900/80 bg-rose-50/20'
                    : isWaitingAuditor
                    ? 'border-amber-300 dark:border-amber-900/80'
                    : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {action.code}
                    </span>
                    <ActionStatusBadge status={action.status} isOverdue={action.isOverdue} />
                    <SeverityBadge severity={action.severity} />
                  </div>

                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                    {action.customerName}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-1">
                    [{action.issueCode}] {action.issueName}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Sale: <strong>{action.saleName}</strong> ({action.teamName})
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Hạn xử lý: <strong className={action.isOverdue ? 'text-rose-600' : ''}>
                        {new Date(action.dueDate).toLocaleDateString('vi-VN')}
                      </strong>
                    </span>
                    {action.rechecks.length > 0 && (
                      <span className="text-purple-600 dark:text-purple-400 font-semibold">
                        Đã recheck {action.rechecks.length} lần
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAction(action.id);
                      onNavigate('action-detail');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                      isWaitingAuditor
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-brand-600 hover:bg-brand-500 text-white'
                    }`}
                  >
                    <span>{isWaitingAuditor ? 'Bắt đầu Recheck' : 'Mở Action'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
