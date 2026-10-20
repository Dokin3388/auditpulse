import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  Sparkles,
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
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              Báo cáo & Phân tích Đa chiều
            </span>
            <span className="text-xs text-slate-400">Spec v1.1 Mục 9 (KPI Dictionary)</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
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
            className="text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
          >
            <option value="OCT_2026">Tháng 10/2026 (Kỳ hiện hành)</option>
            <option value="Q3_2026">Quý 3/2026</option>
            <option value="YEAR_2026">Năm 2026</option>
          </select>
        </div>
      </div>

      {/* KPI Dictionary Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Group A: Execution Quality KPIs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                1. KPI Chất lượng Thực thi (Execution)
              </h3>
            </div>
            <Badge variant="info" size="xs">
              Mẫu số chuẩn
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Tỷ lệ chưa báo giá 2 ngày (NO_QUOTATION)
                </span>
                <span className="text-[11px] text-slate-400">
                  Số khách NO_QUOTATION / Cohort [D-2, D-1] có sale
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-amber-600 text-sm">
                  {Math.round((noQuoteCount / Math.max(1, totalQueue)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({noQuoteCount}/{totalQueue})
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Tỷ lệ báo giá chưa chốt 7 ngày (QUOTED_NOT_ORDERED)
                </span>
                <span className="text-[11px] text-slate-400">
                  Khách có báo giá mới nhất [D-7, D-1] chưa phát sinh đơn
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-rose-600 text-sm">
                  {Math.round((quotedNotOrderedCount / Math.max(1, totalQueue)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({quotedNotOrderedCount}/{totalQueue})
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Tỷ lệ Action khắc phục đúng hạn (On-time Action)
                </span>
                <span className="text-[11px] text-slate-400">
                  Action VERIFIED_CLOSED đúng hạn / Toàn bộ action (trừ WAIVED)
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-emerald-600 text-sm">
                  {onTimeActionRate}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({closedOnTimeActions}/{totalActions})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Group B: Business Outcome KPIs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                2. KPI Tác động Kinh doanh (Outcome)
              </h3>
            </div>
            <Badge variant="success" size="xs">
              Attribution chuẩn
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between">
              <div>
                <span className="font-bold text-emerald-950 dark:text-emerald-200 block">
                  Tổng Doanh thu Đơn hàng Cứu được
                </span>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
                  Đơn hợp lệ trong cửa sổ 14-30 ngày sau Action audit
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-emerald-600 text-sm">
                  {(totalRescuedVal / 1000000).toLocaleString('vi-VN')} tr ₫
                </span>
                <span className="text-[10px] text-emerald-600/80 block">
                  ({rescuedOrders.length} đơn hàng)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Tỷ lệ Cứu đơn Trung bình Portfolio
                </span>
                <span className="text-[11px] text-slate-400">
                  Customer có đơn / Customer có action đủ điều kiện đo
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-slate-900 dark:text-slate-100 text-sm">
                  29.2%
                </span>
                <span className="text-[10px] text-slate-400 block">37/124 ca đo</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Mức Tăng trưởng Hiệu suất Sale Sau Audit
                </span>
                <span className="text-[11px] text-slate-400">
                  So sánh cùng cohort sale trước vs sau khi khép kín action
                </span>
              </div>
              <div className="text-right">
                <span className="font-black text-sky-600 text-sm">
                  +13.8%
                </span>
                <span className="text-[10px] text-slate-400 block">Cohort 124 sale</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Table by Team & Sale */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Phân tích Chi tiết theo Team & Khối Kinh doanh
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-400 border-b dark:border-slate-800">
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
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                  Team B2B Miền Bắc
                </td>
                <td className="py-3 px-3">48 khách</td>
                <td className="py-3 px-3 text-amber-600 font-bold">14.5%</td>
                <td className="py-3 px-3 text-rose-600 font-bold">22.0%</td>
                <td className="py-3 px-3 text-emerald-600 font-bold">96.0%</td>
                <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                  45.000.000 ₫
                </td>
                <td className="py-3 px-3 text-sky-600 font-bold">+15.4%</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                  Team Enterprise
                </td>
                <td className="py-3 px-3">36 khách</td>
                <td className="py-3 px-3 text-amber-600 font-bold">8.3%</td>
                <td className="py-3 px-3 text-rose-600 font-bold">18.5%</td>
                <td className="py-3 px-3 text-emerald-600 font-bold">94.8%</td>
                <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                  88.000.000 ₫
                </td>
                <td className="py-3 px-3 text-sky-600 font-bold">+12.1%</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                  Team B2B Miền Nam
                </td>
                <td className="py-3 px-3">40 khách</td>
                <td className="py-3 px-3 text-amber-600 font-bold">12.0%</td>
                <td className="py-3 px-3 text-rose-600 font-bold">19.2%</td>
                <td className="py-3 px-3 text-emerald-600 font-bold">97.5%</td>
                <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                  25.000.000 ₫
                </td>
                <td className="py-3 px-3 text-sky-600 font-bold">+13.8%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
