import React from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Badge, RiskTagBadge, AttributionBadge } from '../common/Badge';
import { TimelineTrail } from '../common/TimelineTrail';
import type { NavTab } from '../layout/Sidebar';

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
    <div className="space-y-5 pb-8 animate-in fade-in duration-150">
      {/* Top Banner: Low-height, clean B2B SaaS Header */}
      <div className="bg-slate-900 text-white rounded-lg p-4 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
              Audit Control Center
            </span>
            <span className="text-slate-400 text-xs">Kỳ audit: 20/10/2026</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Tổng quan Rủi ro Vận hành & Cứu Đơn
          </h1>
          <p className="text-sm text-slate-300">
            {currentUser.role === 'SALE'
              ? `Bạn có ${filteredActions.filter((a) => a.status === 'OPEN' || a.status === 'REOPENED').length} action cần khắc phục ngay.`
              : currentUser.role === 'AUDITOR'
              ? `Bạn có ${filteredQueueItems.filter((q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW').length} khách cần chấm và ${pendingRechecks.length} việc chờ recheck.`
              : `Phát hiện ${totalQueue} ca rủi ro vận hành sale. ${overdueActions.length} action quá hạn cần đôn đốc.`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto shrink-0">
          <button
            onClick={() => onNavigate('queue')}
            className="flex-1 md:flex-initial px-3.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            Audit Queue
          </button>
          <button
            onClick={() => onNavigate('recheck-today')}
            className="flex-1 md:flex-initial px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors border border-slate-700 flex items-center justify-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            Recheck hôm nay ({pendingRechecks.length})
          </button>
        </div>
      </div>

      {/* Sale Team Change Warning Alert (Spec Section 3 & 10) */}
      {teamChangeAlerts.filter((a) => !a.reviewed).length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-semibold text-amber-900 dark:text-amber-200">
              Cảnh báo: Sale đổi team cần rà soát phân công Auditor
            </h4>
            <p className="text-amber-800/90 dark:text-amber-300/90 mt-0.5">
              Sale <strong>Đào Thị Mai</strong> vừa chuyển sang Team Key Account nhưng vẫn nằm ở portfolio của{' '}
              <strong>Trần Quang Huy</strong> (Auditor cũ) theo nguyên tắc bất biến spec v1.1.
            </p>
          </div>
          <button
            onClick={() => onNavigate('portfolio')}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded shrink-0 transition-colors"
          >
            Rà soát Portfolio
          </button>
        </div>
      )}

      {/* Minimalist 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Risk items needing audit */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Khách cần Audit
              </span>
              <ShieldAlert className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {filteredQueueItems.filter((q) => q.status === 'ASSIGNED' || q.status === 'IN_REVIEW' || q.status === 'PENDING').length}
              </span>
              <span className="text-sm text-slate-300">/ {totalQueue} tổng ca</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Bỏ qua/chặn: {skippedOrBlocked}</span>
            <button
              onClick={() => onNavigate('queue')}
              className="text-slate-700 dark:text-slate-300 font-medium hover:underline flex items-center gap-0.5"
            >
              Xem queue <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Overdue Actions */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Action Quá Hạn
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                {overdueActions.length}
              </span>
              <span className="text-sm text-slate-300">cần đôn đốc sale</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Mở: {filteredActions.filter((a) => a.status !== 'VERIFIED_CLOSED').length}</span>
            <button
              onClick={() => {
                if (onSelectAction && overdueActions.length > 0) {
                  onSelectAction(overdueActions[0].id);
                }
                onNavigate('action-detail');
              }}
              className="text-rose-600 dark:text-rose-400 font-medium hover:underline flex items-center gap-0.5"
            >
              Xử lý ngay <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Completion Rate */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Tỷ lệ Audit Hoàn Tất
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {auditCompletionRate !== null ? `${auditCompletionRate}%` : 'Chưa có'}
              </span>
              <span className="text-xs text-emerald-600 font-medium">SLA đạt chuẩn</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 flex justify-between">
            <span>Đã chấm: {completedQueue}</span>
            <span>Chờ: {totalQueue - completedQueue - skippedOrBlocked}</span>
          </div>
        </div>

        {/* Card 4: Rescued Revenue Outcome */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Doanh Thu Cứu Được
              </span>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {(totalRescuedValue / 1000000).toLocaleString('vi-VN')}
              </span>
              <span className="text-xs font-normal text-slate-500">triệu VNĐ</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>{rescuedOrders.length} đơn hợp lệ sau audit</span>
            <button
              onClick={() => onNavigate('performance')}
              className="text-slate-700 dark:text-slate-300 font-medium hover:underline flex items-center gap-0.5"
            >
              Chi tiết <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Split: Risk breakdown & Priority Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Risk Tag Distribution & Rescued spotlight */}
        <div className="space-y-5 lg:col-span-1">
          {/* Risk Categories breakdown */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Phân bố 3 Rule Rủi ro</span>
              <span className="text-[11px] text-slate-400 font-normal">Ngày 20/10</span>
            </h3>

            <div className="space-y-2">
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Khách trong 2 ngày trước (D-2 đến D-1)
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    YESTERDAY_CUSTOMERS
                  </div>
                </div>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {yesterdayCustomerCount}
                </span>
              </div>

              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Chưa báo giá 2 ngày
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    NO_QUOTATION [D-2, D-1]
                  </div>
                </div>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {noQuoteCount}
                </span>
              </div>

              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Báo giá chưa chốt 7 ngày
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    QUOTED_NOT_ORDERED
                  </div>
                </div>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {quotedNotOrderedCount}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-tight">
              * Khách có thể mang đồng thời nhiều tag (quy tắc gộp 1 dòng / khách theo Spec v1.1).
            </p>
          </div>

          {/* Rescued Orders Spotlight */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                Đơn hàng cứu được gần nhất
              </h3>
              <Badge variant="success" size="xs">
                Outcome
              </Badge>
            </div>

            <div className="space-y-2">
              {rescuedOrders.slice(0, 2).map((res) => (
                <div
                  key={res.id}
                  className="p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                      {res.customerName}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {(res.orderValue / 1000000).toLocaleString('vi-VN')} tr ₫
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
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
        <div className="space-y-5 lg:col-span-2">
          {/* Priority Cases to Audit */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Hàng chờ Ưu tiên Chấm Hôm nay
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Các ca rủi ro cao hoặc đang được theo dõi
                </p>
              </div>
              <button
                onClick={() => onNavigate('queue')}
                className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline flex items-center gap-1"
              >
                Xem tất cả ({filteredQueueItems.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px]">
                    <th className="pb-2 font-medium">Khách hàng & SĐT</th>
                    <th className="pb-2 font-medium">Sale phụ trách</th>
                    <th className="pb-2 font-medium">Risk Tags</th>
                    <th className="pb-2 font-medium">Auditor</th>
                    <th className="pb-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredQueueItems.slice(0, 4).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.customerName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.customerPhone}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.saleName}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.teamName}</div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {item.riskTags.map((tag) => (
                            <RiskTagBadge key={tag.code} code={tag.code} label={tag.label} />
                          ))}
                          {item.activeActionId && (
                            <Badge variant="neutral" size="xs">
                              Đang theo dõi
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-300">
                        {item.assignedAuditorName || 'Chưa gán'}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => {
                            if (onSelectQueueItem) onSelectQueueItem(item.id);
                            onNavigate('queue');
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-[11px] font-medium transition-colors border border-slate-200 dark:border-slate-700"
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
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Lịch sử Audit Trail Hệ thống
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
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
