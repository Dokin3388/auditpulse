import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  DollarSign,
  Users,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Badge, ActionStatusBadge, RiskTagBadge, AttributionBadge } from '../common/Badge';
import { TimelineTrail } from '../common/TimelineTrail';
import { NavTab } from '../layout/Sidebar';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onSelectQueueItem?: (id: string) => void;
  onSelectAction?: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onSelectQueueItem,
  onSelectAction,
}) => {
  const {
    currentUser,
    filteredQueueItems,
    filteredActions,
    rescuedOrders,
    auditTrail,
    teamChangeAlerts,
  } = useAuditStore();

  // Metric calculations strictly per Spec Section 9
  const totalQueue = filteredQueueItems.length;
  const completedQueue = filteredQueueItems.filter(
    (q) => q.status === 'COMPLETED_PASS' || q.status === 'COMPLETED_FAIL'
  ).length;
  const skippedOrBlocked = filteredQueueItems.filter(
    (q) => q.status === 'SKIPPED' || q.status === 'BLOCKED'
  ).length;
  const auditCompletionRate =
    totalQueue > 0
      ? Math.round((completedQueue / Math.max(1, totalQueue - skippedOrBlocked)) * 100)
      : null;

  const overdueActions = filteredActions.filter((a) => a.isOverdue);
  const pendingRechecks = filteredActions.filter(
    (a) => a.status === 'SALE_MARKED_DONE' || a.status === 'IN_RECHECK'
  );

  // Rescued revenue
  const totalRescuedValue = rescuedOrders.reduce((sum, r) => sum + r.orderValue, 0);

  // Group risk tags
  const yesterdayCustomerCount = filteredQueueItems.filter((q) =>
    q.riskTags.some((t) => t.code === 'YESTERDAY_CUSTOMERS')
  ).length;
  const noQuoteCount = filteredQueueItems.filter((q) =>
    q.riskTags.some((t) => t.code === 'NO_QUOTATION')
  ).length;
  const quotedNotOrderedCount = filteredQueueItems.filter((q) =>
    q.riskTags.some((t) => t.code === 'QUOTED_NOT_ORDERED')
  ).length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner: Next Action Owner per Spec */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-brand-950 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-brand-500 text-white">
              AuditPulse Control Center
            </span>
            <span className="text-slate-400 text-xs">Múi giờ Asia/Ho_Chi_Minh</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Tổng quan Rủi ro & Cứu đơn Ngày 20/10/2026
          </h1>
          <p className="text-xs text-slate-300">
            {currentUser.role === 'SALE'
              ? `Bạn có ${filteredActions.filter((a) => a.status === 'OPEN' || a.status === 'REOPENED').length} action cần khắc phục ngay.`
              : currentUser.role === 'AUDITOR'
              ? `Bạn có ${filteredQueueItems.filter((q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW').length} khách cần chấm và ${pendingRechecks.length} việc chờ recheck.`
              : `Phát hiện ${totalQueue} ca rủi ro vận hành sale. ${overdueActions.length} action quá hạn cần đôn đốc.`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={() => onNavigate('queue')}
            className="flex-1 md:flex-initial px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            Vào Audit Queue
          </button>
          <button
            onClick={() => onNavigate('recheck-today')}
            className="flex-1 md:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors border border-slate-700 flex items-center justify-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            Recheck Hôm nay ({pendingRechecks.length})
          </button>
        </div>
      </div>

      {/* Sale Team Change Warning Alert (Spec Section 3 & 10) */}
      {teamChangeAlerts.filter((a) => !a.reviewed).length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-amber-900 dark:text-amber-200">
              Cảnh báo: Sale đổi team cần rà soát phân công Auditor
            </h4>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
              Sale <strong>Đào Thị Mai</strong> vừa chuyển sang Team Key Account nhưng vẫn nằm ở portfolio của{' '}
              <strong>Trần Quang Huy</strong> (Auditor cũ) theo nguyên tắc bất biến spec v1.1.
            </p>
          </div>
          <button
            onClick={() => onNavigate('portfolio')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shrink-0"
          >
            Rà soát Portfolio
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Risk items needing audit */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-brand-500 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Khách cần Audit
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {filteredQueueItems.filter((q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW' || q.status === 'PENDING').length}
            </span>
            <span className="text-xs text-slate-400">/ {totalQueue} tổng ca</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Bỏ qua/chặn: {skippedOrBlocked}</span>
            <button
              onClick={() => onNavigate('queue')}
              className="text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-0.5"
            >
              Xem queue <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Overdue Actions */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-rose-500 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Action Quá Hạn
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
              {overdueActions.length}
            </span>
            <span className="text-xs text-slate-400">cần đôn đốc sale</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng action mở: {filteredActions.filter((a) => a.status !== 'VERIFIED_CLOSED').length}</span>
            <button
              onClick={() => onNavigate('action-detail')}
              className="text-rose-600 dark:text-rose-400 font-semibold hover:underline flex items-center gap-0.5"
            >
              Xử lý ngay <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Completion Rate */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-500 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tỷ lệ Audit Hoàn Tất
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {auditCompletionRate !== null ? `${auditCompletionRate}%` : 'Chưa có'}
            </span>
            <span className="text-xs text-emerald-600 font-medium">SLA đạt chuẩn</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 flex justify-between">
            <span>Đã chấm: {completedQueue}</span>
            <span>Chờ: {totalQueue - completedQueue - skippedOrBlocked}</span>
          </div>
        </div>

        {/* Card 4: Rescued Revenue Outcome */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-brand-500 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Doanh Thu Cứu Được
            </span>
            <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-xl font-extrabold text-brand-600 dark:text-brand-400">
              {(totalRescuedValue / 1000000).toLocaleString('vi-VN')}
            </span>
            <span className="text-xs font-semibold text-slate-500">triệu VNĐ</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>{rescuedOrders.length} đơn hợp lệ sau audit</span>
            <button
              onClick={() => onNavigate('performance')}
              className="text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-0.5"
            >
              Chi tiết <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Split: Risk breakdown & Priority Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Risk Tag Distribution & Rescued spotlight */}
        <div className="space-y-6 lg:col-span-1">
          {/* Risk Categories breakdown */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Phân bố 3 Rule Rủi ro</span>
              <span className="text-xs text-slate-400 font-normal">Ngày D: 20/10</span>
            </h3>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-sky-950 dark:text-sky-200">
                    ⚡ Khách hôm qua (D-1)
                  </div>
                  <div className="text-[11px] text-sky-700/80 dark:text-sky-400">
                    Rule YESTERDAY_CUSTOMERS
                  </div>
                </div>
                <span className="text-lg font-black text-sky-700 dark:text-sky-300">
                  {yesterdayCustomerCount}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    ⏱️ Chưa báo giá 2 ngày
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400">
                    Rule NO_QUOTATION [D-2, D-1]
                  </div>
                </div>
                <span className="text-lg font-black text-amber-700 dark:text-amber-300">
                  {noQuoteCount}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-rose-950 dark:text-rose-200">
                    🎯 Báo giá chưa chốt 7 ngày
                  </div>
                  <div className="text-[11px] text-rose-700/80 dark:text-rose-400">
                    Rule QUOTED_NOT_ORDERED
                  </div>
                </div>
                <span className="text-lg font-black text-rose-700 dark:text-rose-300">
                  {quotedNotOrderedCount}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic">
              * Khách có thể mang đồng thời nhiều tag (quy tắc gộp 1 dòng / khách theo Spec v1.1).
            </p>
          </div>

          {/* Rescued Orders Spotlight */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Đơn hàng cứu được gần nhất
              </h3>
              <Badge variant="success" size="xs">
                Outcome
              </Badge>
            </div>

            <div className="space-y-3">
              {rescuedOrders.slice(0, 2).map((res) => (
                <div
                  key={res.id}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                      {res.customerName}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                      {(res.orderValue / 1000000).toLocaleString('vi-VN')} tr ₫
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Đơn {res.orderCode}</span>
                    <span>Sau action {res.windowDays} ngày</span>
                  </div>
                  <AttributionBadge status={res.attributionStatus} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: High Priority Queue & Audit Trail */}
        <div className="space-y-6 lg:col-span-2">
          {/* Priority Cases to Audit */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Hàng chờ Ưu tiên Chấm Hôm nay
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Các ca rủi ro cao hoặc đang được theo dõi
                </p>
              </div>
              <button
                onClick={() => onNavigate('queue')}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
              >
                Xem tất cả ({filteredQueueItems.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400">
                    <th className="pb-3 font-semibold">Khách hàng & SĐT</th>
                    <th className="pb-3 font-semibold">Sale phụ trách</th>
                    <th className="pb-3 font-semibold">Risk Tags</th>
                    <th className="pb-3 font-semibold">Auditor</th>
                    <th className="pb-3 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredQueueItems.slice(0, 4).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.customerName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {item.customerPhone}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.saleName}
                        </div>
                        <div className="text-[11px] text-slate-400">{item.teamName}</div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.riskTags.map((tag) => (
                            <RiskTagBadge key={tag.code} code={tag.code} label={tag.label} />
                          ))}
                          {item.activeActionId && (
                            <Badge variant="purple" size="xs">
                              Đang theo dõi
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 font-medium">
                        {item.assignedAuditorName || 'Chưa gán'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => {
                            if (onSelectQueueItem) onSelectQueueItem(item.id);
                            onNavigate('queue');
                          }}
                          className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 rounded font-semibold text-[11px] transition-colors"
                        >
                          Mở Audit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Trail Timeline Snippet */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Lịch sử Audit Trail Hệ thống
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bản ghi bất biến của mọi hành động gán, recheck và phê duyệt
                </p>
              </div>
              <Badge variant="neutral" size="xs">
                Realtime
              </Badge>
            </div>

            <TimelineTrail events={auditTrail} maxItems={4} />
          </div>
        </div>
      </div>
    </div>
  );
};
