import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  ShieldCheck,
  Sparkles,
  DollarSign,
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
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Đo lường 2 Lớp: Thực thi & Doanh thu
            </span>
            <span className="text-xs text-slate-400">Spec v1.1 Mục 9</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
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
            className="text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
          >
            <option value="ALL">Toàn bộ 3 Auditor</option>
            <option value="AUD-01">Linh Nguyễn (AUD-01)</option>
            <option value="AUD-02">Huy Trần (AUD-02)</option>
            <option value="AUD-03">Trang Đỗ (AUD-03)</option>
          </select>
        </div>
      </div>

      {/* Critical Rule Banner from Spec Section 9 */}
      <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs">
        <HelpCircle className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-slate-600 dark:text-slate-300">
          <p className="font-bold text-slate-900 dark:text-slate-100">
            Nguyên tắc đánh giá Auditor công bằng (Spec v1.1):
          </p>
          <p className="leading-relaxed">
            Hệ thống <strong>không xếp hạng auditor bằng số lỗi tìm được</strong> hoặc tỷ lệ fail, vì rủi ro phụ thuộc vào chất lượng portfolio sale.
            Sản lượng đo theo người được <em>snapshot tại Queue Item</em> và thời gian xử lý dùng <em>median</em> để tránh méo chỉ số.
          </p>
        </div>
      </div>

      {/* 2-Layer Performance Summary Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filteredMetrics.map((auditor) => (
          <div
            key={auditor.auditorId}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-5"
          >
            {/* Auditor Header */}
            <div className="flex items-center gap-3">
              <img
                src={auditor.avatarUrl}
                alt={auditor.auditorName}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-500/20"
              />
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {auditor.auditorName}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="info" size="xs">
                    {auditor.auditorId}
                  </Badge>
                  <span className="text-[11px] text-slate-400">
                    Cohort: {auditor.evaluationCohortSize} case
                  </span>
                </div>
              </div>
            </div>

            {/* Layer 1: Execution Quality (Chất lượng thực thi) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b pb-1 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  1. Chất lượng Thực thi
                </span>
                <span className="text-[10px] text-slate-400">KPI Chính</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                  <span className="text-[10px] text-slate-400 block">Sản lượng hoàn tất</span>
                  <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.auditThroughput}{' '}
                    <span className="text-[10px] font-normal text-slate-400">
                      / {auditor.auditTarget} chỉ tiêu
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                  <span className="text-[10px] text-slate-400 block">Tuân thủ SLA</span>
                  <div className="font-extrabold text-emerald-600 text-sm">
                    {auditor.slaComplianceRate}%
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                  <span className="text-[10px] text-slate-400 block">Median Xử lý (Phút)</span>
                  <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                    {auditor.medianHandlingMinutes} phút
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850">
                  <span className="text-[10px] text-slate-400 block">Đồng thuận QA</span>
                  <div className="font-extrabold text-brand-600 text-sm">
                    {auditor.qaAgreementRate}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>QA trả lại: <strong>{auditor.qaReturnRate}%</strong></span>
                <span>Backlog quá hạn: <strong className={auditor.overdueBacklog > 0 ? 'text-rose-600' : ''}>{auditor.overdueBacklog}</strong></span>
              </div>
            </div>

            {/* Layer 2: Business Outcome (Tác động kinh doanh) */}
            <div className="space-y-2.5 pt-2 border-t dark:border-slate-800">
              <div className="flex items-center justify-between border-b pb-1 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  2. Tác động Kinh doanh
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">Outcome</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-900 dark:text-emerald-200 font-bold">
                    Doanh số Đơn cứu:
                  </span>
                  <span className="font-black text-emerald-700 dark:text-emerald-300 text-sm">
                    {(auditor.rescuedOrdersValue / 1000000).toLocaleString('vi-VN')} tr ₫
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span>Số đơn cứu được:</span>
                  <strong>{auditor.rescuedOrdersCount} đơn hợp lệ</strong>
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span>Tỷ lệ cứu đơn:</span>
                  <strong>{auditor.rescueRate}%</strong>
                </div>
              </div>

              {/* Sale Performance Improvement Cohort */}
              <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sky-900 dark:text-sky-200 font-semibold">
                    Cải thiện Sale Cohort:
                  </span>
                  <span className="font-extrabold text-sky-700 dark:text-sky-300">
                    +{auditor.salePerformanceDeltaPct}%
                  </span>
                </div>
                <p className="text-[10px] text-sky-700/80 dark:text-sky-400">
                  So sánh tỷ lệ chốt và SLA của sale sau khi nhận action audit so với baseline.
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rescued Orders Attribution Breakdown Table per Spec */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Chi tiết Đơn hàng Cứu được & Gán nhãn Attribution
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chỉ tính cho khách hàng có action NO_QUOTATION hoặc QUOTED_NOT_ORDERED có đơn hợp lệ sau action.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Tổng giá trị:</span>
            <span className="text-base font-extrabold text-emerald-600">
              {(totalRescuedVal / 1000000).toLocaleString('vi-VN')} triệu VNĐ
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-400 border-b dark:border-slate-800">
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
                <tr key={ord.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                    {ord.customerName}
                  </td>
                  <td className="py-3 px-3 font-mono text-brand-600">{ord.actionCode}</td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                    {ord.orderCode}
                  </td>
                  <td className="py-3 px-3 font-extrabold text-emerald-600">
                    {ord.orderValue.toLocaleString('vi-VN')} ₫
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {ord.windowDays} ngày sau action
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                    {ord.auditorName}
                  </td>
                  <td className="py-3 px-3">
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
