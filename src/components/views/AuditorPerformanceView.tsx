import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldCheck,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';
import { Badge, AttributionBadge } from '../common/Badge';

export const AuditorPerformanceView: React.FC = () => {
  const { performanceMetrics, rescuedOrders } = useAuditStore();
  const [selectedAuditorId, setSelectedAuditorId] = useState<string>('ALL');

  const filteredMetrics =
    selectedAuditorId === 'ALL'
      ? performanceMetrics
      : performanceMetrics.filter((m) => m.auditorId === selectedAuditorId);

  const totalRescuedVal = rescuedOrders.reduce((sum, r) => sum + r.orderValue, 0);

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Đo lường 2 Lớp: Thực thi & Doanh thu
            </span>
            <span className="text-xs text-slate-500">Spec v1.1 Mục 9</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            Hiệu suất Auditor & Tác động Cứu Đơn
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chất lượng thực thi (SLA, QA, backlog) là KPI chính; Tác động kinh doanh (đơn cứu, tăng trưởng sale) là KPI outcome.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedAuditorId}
            onChange={(e) => setSelectedAuditorId(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400 font-medium"
          >
            <option value="ALL">Toàn bộ 3 Auditor</option>
            <option value="AUD-01">Linh Nguyễn (AUD-01)</option>
            <option value="AUD-02">Huy Trần (AUD-02)</option>
            <option value="AUD-03">Trang Đỗ (AUD-03)</option>
          </select>
        </div>
      </div>

      {/* Critical Rule Banner from Spec Section 9 */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs">
        <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-1 text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            Nguyên tắc đánh giá Auditor công bằng (Spec v1.1):
          </p>
          <p className="leading-relaxed text-[11px]">
            Hệ thống <strong>không xếp hạng auditor bằng số lỗi tìm được</strong> hoặc tỷ lệ fail, vì rủi ro phụ thuộc vào chất lượng portfolio sale.
            Sản lượng đo theo người được <em>snapshot tại Queue Item</em> và thời gian xử lý dùng <em>median</em> để tránh méo chỉ số.
          </p>
        </div>
      </div>

      {/* 2-Layer Performance Summary Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredMetrics.map((auditor) => (
          <div
            key={auditor.auditorId}
            className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4"
          >
            {/* Auditor Header */}
            <div className="flex items-center gap-3">
              <img
                src={auditor.avatarUrl}
                alt={auditor.auditorName}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {auditor.auditorName}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="neutral" size="xs">
                    {auditor.auditorId}
                  </Badge>
                  <span className="text-[11px] text-slate-500">
                    Cohort: {auditor.evaluationCohortSize} case
                  </span>
                </div>
              </div>
            </div>

            {/* Layer 1: Execution Quality (Chất lượng thực thi) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b pb-1 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  1. Chất lượng Thực thi
                </span>
                <span className="text-[10px] text-slate-500 font-medium">KPI Chính</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Sản lượng hoàn tất</span>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.auditThroughput}{' '}
                    <span className="text-[10px] font-normal text-slate-500">
                      / {auditor.auditTarget}
                    </span>
                  </div>
                </div>

                <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Tuân thủ SLA</span>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.slaComplianceRate}%
                  </div>
                </div>

                <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Median Xử lý</span>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.medianHandlingMinutes} phút
                  </div>
                </div>

                <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Đồng thuận QA</span>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.qaAgreementRate}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>QA trả lại: <strong className="text-slate-700 dark:text-slate-300">{auditor.qaReturnRate}%</strong></span>
                <span>Backlog quá hạn: <strong className={auditor.overdueBacklog > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-700 dark:text-slate-300'}>{auditor.overdueBacklog}</strong></span>
              </div>
            </div>

            {/* Layer 2: Business Outcome (Tác động kinh doanh) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between border-b pb-1 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  2. Tác động Kinh doanh
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Outcome</span>
              </div>

              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Doanh số Đơn cứu:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {(auditor.rescuedOrdersValue / 1000000).toLocaleString('vi-VN')} tr ₫
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Số đơn cứu được:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{auditor.rescuedOrdersCount} đơn hợp lệ</strong>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Tỷ lệ cứu đơn:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{auditor.rescueRate}%</strong>
                </div>
              </div>

              {/* Sale Performance Improvement Cohort */}
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    Cải thiện Sale Cohort:
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    +{auditor.salePerformanceDeltaPct}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  So sánh tỷ lệ chốt và SLA của sale sau khi nhận action audit so với baseline.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rescued Orders Attribution Breakdown Table per Spec */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              Chi tiết Đơn hàng Cứu được & Gán nhãn Attribution
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chỉ tính cho khách hàng có action NO_QUOTATION hoặc QUOTED_NOT_ORDERED có đơn hợp lệ sau action.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-500 block">Tổng giá trị:</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {(totalRescuedVal / 1000000).toLocaleString('vi-VN')} triệu VNĐ
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Khách hàng</th>
                <th className="py-2.5 px-3 font-semibold">Mã Action</th>
                <th className="py-2.5 px-3 font-semibold">Đơn hàng POS</th>
                <th className="py-2.5 px-3 font-semibold">Giá trị đơn</th>
                <th className="py-2.5 px-3 font-semibold">Cửa sổ phát sinh</th>
                <th className="py-2.5 px-3 font-semibold">Auditor ghi nhận</th>
                <th className="py-2.5 px-3 font-semibold">Phân loại Attribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rescuedOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                    {ord.customerName}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">{ord.actionCode}</td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {ord.orderCode}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                    {ord.orderValue.toLocaleString('vi-VN')} ₫
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {ord.windowDays} ngày sau action
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                    {ord.auditorName}
                  </td>
                  <td className="py-2.5 px-3">
                    <AttributionBadge status={ord.attributionStatus} />
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
