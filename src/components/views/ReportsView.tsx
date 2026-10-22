import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '../common/Badge';

export const ReportsView: React.FC = () => {
  const { queueItems, correctiveActions, rescuedOrders } = useAuditStore();

  const [dateRange, setDateRange] = useState('OCT_2026');

  // Execution KPIs
  const totalQueue = queueItems.length;
  const noQuoteCount = queueItems.filter((q) =>
    q.riskTags.some((t) => t.code === 'NO_QUOTATION')
  ).length;
  const quotedNotOrderedCount = queueItems.filter((q) =>
    q.riskTags.some((t) => t.code === 'QUOTED_NOT_ORDERED')
  ).length;

  const totalActions = correctiveActions.length;
  const closedOnTimeActions = correctiveActions.filter(
    (a) => a.status === 'VERIFIED_CLOSED' && !a.isOverdue
  ).length;
  const onTimeActionRate =
    totalActions > 0 ? Math.round((closedOnTimeActions / totalActions) * 100) : 0;

  // Outcome KPIs
  const totalRescuedVal = rescuedOrders.reduce((sum, r) => sum + r.orderValue, 0);

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Báo cáo & Phân tích Đa chiều
            </span>
            <span className="text-xs text-slate-500">Spec v1.1 Mục 9 (KPI Dictionary)</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
            Báo cáo KPI Vận hành & Tác động Doanh thu
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tách biệt rõ ràng chỉ tiêu Chất lượng Thực thi (Execution) và Chỉ tiêu Kết quả (Outcome).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium"
          >
            <option value="OCT_2026">Tháng 10/2026 (Kỳ hiện hành)</option>
            <option value="Q3_2026">Quý 3/2026</option>
            <option value="YEAR_2026">Năm 2026</option>
          </select>
        </div>
      </div>

      {/* KPI Dictionary Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Group A: Execution Quality KPIs */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <h3 className="font-semibold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                1. KPI Chất lượng Thực thi (Execution)
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Mẫu số chuẩn
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Tỷ lệ chưa báo giá 2 ngày (NO_QUOTATION)
                </span>
                <span className="text-[11px] text-slate-500">
                  Số khách NO_QUOTATION / Cohort [D-2, D-1] có sale
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-amber-700 dark:text-amber-400 text-sm">
                  {Math.round((noQuoteCount / Math.max(1, totalQueue)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({noQuoteCount}/{totalQueue})
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Tỷ lệ báo giá chưa chốt 7 ngày (QUOTED_NOT_ORDERED)
                </span>
                <span className="text-[11px] text-slate-500">
                  Khách có báo giá mới nhất [D-7, D-1] chưa phát sinh đơn
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-rose-700 dark:text-rose-400 text-sm">
                  {Math.round((quotedNotOrderedCount / Math.max(1, totalQueue)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({quotedNotOrderedCount}/{totalQueue})
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Tỷ lệ Action khắc phục đúng hạn (On-time Action)
                </span>
                <span className="text-[11px] text-slate-500">
                  Action VERIFIED_CLOSED đúng hạn / Toàn bộ action (trừ WAIVED)
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                  {onTimeActionRate}%
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({closedOnTimeActions}/{totalActions})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Group B: Business Outcome KPIs */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <h3 className="font-semibold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                2. KPI Tác động Kinh doanh (Outcome)
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Attribution chuẩn
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Tổng Doanh thu Đơn hàng Cứu được
                </span>
                <span className="text-[11px] text-slate-500">
                  Đơn hợp lệ trong cửa sổ 14-30 ngày sau Action audit
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {(totalRescuedVal / 1000000).toLocaleString('vi-VN')} tr ₫
                </span>
                <span className="text-[10px] text-slate-500 block">
                  ({rescuedOrders.length} đơn hàng)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Tỷ lệ Cứu đơn Trung bình Portfolio
                </span>
                <span className="text-[11px] text-slate-500">
                  Customer có đơn / Customer có action đủ điều kiện đo
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  29.2%
                </span>
                <span className="text-[10px] text-slate-500 block">37/124 ca đo</span>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Mức Tăng trưởng Hiệu suất Sale Sau Audit
                </span>
                <span className="text-[11px] text-slate-500">
                  So sánh cùng cohort sale trước vs sau khi khép kín action
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                  +13.8%
                </span>
                <span className="text-[10px] text-slate-500 block">Cohort 124 sale</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Table by Team & Sale */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
          Phân tích Chi tiết theo Team & Khối Kinh doanh
        </h3>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Team Sale</th>
                <th className="py-2.5 px-3 font-semibold">Tổng khách trong kỳ</th>
                <th className="py-2.5 px-3 font-semibold">Chưa báo giá 2d</th>
                <th className="py-2.5 px-3 font-semibold">Báo giá chưa chốt 7d</th>
                <th className="py-2.5 px-3 font-semibold">Action hoàn tất</th>
                <th className="py-2.5 px-3 font-semibold">Đơn cứu (Giá trị)</th>
                <th className="py-2.5 px-3 font-semibold">Cải thiện KPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                  Team B2B Miền Bắc
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">48 khách</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">14.5%</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">22.0%</td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">96.0%</td>
                <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                  45.000.000 ₫
                </td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">+15.4%</td>
              </tr>
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                  Team Enterprise
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">36 khách</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">8.3%</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">18.5%</td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">94.8%</td>
                <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                  88.000.000 ₫
                </td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">+12.1%</td>
              </tr>
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                  Team B2B Miền Nam
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">40 khách</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">12.0%</td>
                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">19.2%</td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">97.5%</td>
                <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                  25.000.000 ₫
                </td>
                <td className="py-2.5 px-3 text-emerald-700 dark:text-emerald-400 font-semibold">+13.8%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
