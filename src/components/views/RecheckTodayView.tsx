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
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Ưu tiên Hằng ngày
            </span>
            <span className="text-xs text-slate-500">Ngày audit: 20/10/2026</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            Hàng chờ Recheck Hôm nay
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Danh sách việc cần kiểm tra lại, ưu tiên theo mức độ quá hạn và rủi ro nghiêm trọng.
          </p>
        </div>

        {urgentCount > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{urgentCount} việc cần recheck gấp</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo khách, mã action, sale..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">Mức độ:</span>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium"
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
        <div className="space-y-2.5">
          {recheckQueue.map((action) => {
            const isWaitingAuditor = action.status === 'SALE_MARKED_DONE';
            return (
              <div
                key={action.id}
                onClick={() => {
                  onSelectAction(action.id);
                  onNavigate('action-detail');
                }}
                className={`p-3.5 rounded-lg border bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                  action.isOverdue
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                    : isWaitingAuditor
                    ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                      {action.code}
                    </span>
                    <ActionStatusBadge status={action.status} isOverdue={action.isOverdue} />
                    <SeverityBadge severity={action.severity} />
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {action.customerName}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-1">
                    [{action.issueCode}] {action.issueName}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Sale: <strong className="text-slate-800 dark:text-slate-200">{action.saleName}</strong> ({action.teamName})
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Hạn xử lý: <strong className={action.isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}>
                        {new Date(action.dueDate).toLocaleDateString('vi-VN')}
                      </strong>
                    </span>
                    {action.rechecks.length > 0 && (
                      <span className="text-slate-600 dark:text-slate-400 font-medium">
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
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      isWaitingAuditor
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900'
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
