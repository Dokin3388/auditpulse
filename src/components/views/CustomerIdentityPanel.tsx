import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, GitMerge } from 'lucide-react';
import {
  applyCustomerMergeBatch,
  getCustomerIdentityReport,
  previewCustomerMerge,
  type CustomerIdentityReport,
  type CustomerMergePreview,
  type CustomerMergeResult,
} from '../../services/api';

const number = (value: number) => value.toLocaleString('vi-VN');

const Kpi: React.FC<{ label: string; value: number; hint: string; bad?: boolean }> = ({ label, value, hint, bad }) => (
  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-lg font-semibold ${bad && value > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>{number(value)}</div>
    <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{hint}</div>
  </div>
);

/** Data-quality panel for the phone-first customer/quotation/order mapping (Head Auditor/Admin). */
export const CustomerIdentityPanel: React.FC = () => {
  const [report, setReport] = useState<CustomerIdentityReport | null>(null);
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
  const [progress, setProgress] = useState<CustomerMergeResult | null>(null);
  const [busy, setBusy] = useState<'report' | 'preview' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setBusy('report');
    setError(null);
    try {
      setReport(await getCustomerIdentityReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải báo cáo.');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCustomerIdentityReport()
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không thể tải báo cáo.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runPreview = async () => {
    setBusy('preview');
    setError(null);
    setProgress(null);
    setConfirming(false);
    try {
      setPreview(await previewCustomerMerge());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xem trước.');
    } finally {
      setBusy(null);
    }
  };

  const runApply = async () => {
    setBusy('apply');
    setError(null);
    setConfirming(false);
    const total: CustomerMergeResult = { merged: 0, customersRemoved: 0, quotationsMoved: 0, ordersMoved: 0, failed: [], remaining: 0, identifiersAdded: 0, done: false };
    try {
      // Each call is time-boxed on the server; repeat until nothing is left.
      for (let round = 0; round < 50; round++) {
        const batch = await applyCustomerMergeBatch();
        total.merged += batch.merged;
        total.customersRemoved += batch.customersRemoved;
        total.quotationsMoved += batch.quotationsMoved;
        total.ordersMoved += batch.ordersMoved;
        total.identifiersAdded += batch.identifiersAdded;
        total.failed = batch.failed;
        total.remaining = batch.remaining;
        total.done = batch.done;
        setProgress({ ...total });
        if (batch.remaining === 0) break;
      }
      setPreview(null);
      await loadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể gộp khách trùng.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b pb-2 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            Chất lượng map Khách ↔ Báo giá ↔ Đơn hàng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            SĐT chuẩn hóa là khóa chính; mã khách hàng được học từ báo giá. Dòng không khớp được giữ lại để xử lý, hệ thống không tự tạo khách ma.
          </p>
        </div>
        <button
          onClick={() => void loadReport()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy === 'report' ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi label="Tổng khách" value={report.customers.total} hint="Số bản ghi khách hiện có" />
            <Kpi label="Nhóm khách trùng SĐT" value={report.duplicates.phoneGroups} hint={`${number(report.duplicates.customersInvolved)} bản ghi liên quan, cần gộp`} bad />
            <Kpi label="Khách ma (tạo từ giao dịch)" value={report.customers.placeholder} hint="Không có trong CRM; hệ thống không tạo thêm" bad />
            <Kpi label="Báo giá + đơn nằm ở khách ma" value={report.transactions.quotations.onPlaceholder + report.transactions.orders.onPlaceholder} hint={`${number(report.transactions.quotations.onPlaceholder)} báo giá, ${number(report.transactions.orders.onPlaceholder)} đơn`} bad />
            <Kpi label="Giao dịch chưa khớp khách" value={report.unmatched.quotations + report.unmatched.orders} hint={`${number(report.unmatched.quotations)} báo giá, ${number(report.unmatched.orders)} đơn; tự áp dụng khi khách xuất hiện ở CRM`} bad />
            <Kpi label="Giao dịch thiếu SĐT và mã" value={report.unmatched.noIdentifier} hint="Không thể map, cần bổ sung ở sheet nguồn" bad />
            <Kpi label="Khách không có SĐT" value={report.customers.withoutPhone} hint="Chỉ map được bằng mã khách" />
            <Kpi label="Khách có ngày tạo nghi hỏng" value={report.customers.suspectCreatedDate} hint="Ngày tạo trùng giờ đồng bộ (ngày nguồn trống/sai)" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => void runPreview()}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-medium disabled:opacity-50"
              >
                {busy === 'preview' ? 'Đang phân tích...' : 'Xem trước gộp khách trùng'}
              </button>
              <span className="text-[11px] text-slate-500">Xem trước không ghi gì vào dữ liệu.</span>
            </div>

            {preview && (
              <div className="rounded-md border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs">
                <p className="text-slate-800 dark:text-slate-200">
                  Sẽ gộp <strong>{number(preview.totals.customersToRemove)}</strong> bản ghi trùng vào <strong>{number(preview.totals.clusters)}</strong> khách chính,
                  chuyển <strong>{number(preview.totals.quotationsToMove)}</strong> báo giá và <strong>{number(preview.totals.ordersToMove)}</strong> đơn.
                  Thêm <strong>{number(preview.totals.identifiersToAdd)}</strong> định danh SĐT/mã.
                </p>
                {preview.totals.ownerConflicts > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">{number(preview.totals.ownerConflicts)} nhóm có hai Sale phụ trách khác nhau; hệ thống giữ Sale của bản ghi chính.</p>
                )}
                {preview.needsReview.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">{number(preview.needsReview.length)} SĐT dùng chung cho quá nhiều khách (tổng đài, đại lý): không tự gộp.</p>
                )}
                {preview.sharedCodes.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Mã khách dùng chung nhiều người (không gộp): {preview.sharedCodes.slice(0, 5).map((c) => `${c.code} (${c.customers})`).join(', ')}
                  </p>
                )}
                {preview.clusters.length > 0 && (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                        <tr>
                          <th className="py-1.5 px-2 font-semibold">Giữ lại</th>
                          <th className="py-1.5 px-2 font-semibold">Gộp vào</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Báo giá</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Đơn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {preview.clusters.slice(0, 10).map((cluster) => (
                          <tr key={cluster.winnerId}>
                            <td className="py-1.5 px-2 font-mono">{cluster.members[0]?.name} <span className="text-slate-400">({cluster.winnerId})</span></td>
                            <td className="py-1.5 px-2 font-mono text-slate-500">{cluster.loserIds.join(', ')}</td>
                            <td className="py-1.5 px-2 text-right">{cluster.quotationsToMove}</td>
                            <td className="py-1.5 px-2 text-right">{cluster.ordersToMove}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {preview.totals.clusters === 0 && preview.totals.identifiersToAdd === 0 ? (
                  <p className="text-emerald-700 dark:text-emerald-400">Không còn khách trùng. Dữ liệu đã sạch.</p>
                ) : confirming ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      Các bản ghi trùng sẽ bị xóa (bản sao đầy đủ được lưu trong nhật ký gộp). Xác nhận gộp?
                    </span>
                    <button onClick={() => void runApply()} className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium">Xác nhận gộp</button>
                    <button onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs">Hủy</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(true)} disabled={busy !== null} className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium disabled:opacity-50">
                    Áp dụng gộp
                  </button>
                )}
              </div>
            )}

            {busy === 'apply' && <p className="text-xs text-slate-600 dark:text-slate-300">Đang gộp... {progress ? `đã gộp ${number(progress.customersRemoved)} bản ghi, còn ${number(progress.remaining)} nhóm.` : ''}</p>}
            {progress && busy !== 'apply' && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/60 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                Đã gộp {number(progress.customersRemoved)} bản ghi trùng; chuyển {number(progress.quotationsMoved)} báo giá và {number(progress.ordersMoved)} đơn; thêm {number(progress.identifiersAdded)} định danh.
                {progress.failed.length > 0 && (
                  <p className="mt-1 text-rose-700 dark:text-rose-400 font-semibold">
                    {progress.failed.length} nhóm bị cơ sở dữ liệu từ chối (thường do có hành động/audit đang mở) và được giữ nguyên: {progress.failed.slice(0, 3).map((f) => f.winnerId).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {report.unmatched.sample.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Giao dịch chưa khớp khách (mới nhất)</h4>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                    <tr>
                      <th className="py-1.5 px-2 font-semibold">Loại</th>
                      <th className="py-1.5 px-2 font-semibold">Số chứng từ</th>
                      <th className="py-1.5 px-2 font-semibold">SĐT</th>
                      <th className="py-1.5 px-2 font-semibold">Mã khách</th>
                      <th className="py-1.5 px-2 font-semibold">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.unmatched.sample.map((row) => (
                      <tr key={`${row.kind}-${row.sourceCode}`}>
                        <td className="py-1.5 px-2">{row.kind === 'QUOTATION' ? 'Báo giá' : 'Đơn hàng'}</td>
                        <td className="py-1.5 px-2 font-mono">{row.sourceCode}</td>
                        <td className="py-1.5 px-2 font-mono">{row.phones.join(', ') || '—'}</td>
                        <td className="py-1.5 px-2 font-mono">{row.customerCode || '—'}</td>
                        <td className="py-1.5 px-2">{row.reason === 'NO_IDENTIFIER' ? 'Thiếu SĐT và mã' : 'Khách chưa có trong CRM'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.lastSyncs.some((run) => run.identity) && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Chất lượng map theo từng lần đồng bộ</h4>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                    <tr>
                      <th className="py-1.5 px-2 font-semibold">Sheet</th>
                      <th className="py-1.5 px-2 font-semibold">Thời gian</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Dòng áp dụng</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Khách mới</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Chưa khớp</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Xung đột</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Dòng CRM bị từ chối</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Ngày lỗi</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Sale không nhận ra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.lastSyncs.filter((run) => run.identity).map((run, index) => (
                      <tr key={`${run.sheetName}-${run.receivedAt}-${index}`}>
                        <td className="py-1.5 px-2 font-mono">{run.sheetName}</td>
                        <td className="py-1.5 px-2">{new Date(run.receivedAt).toLocaleString('vi-VN')}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.appliedRows)}/{number(run.totalRows)}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.identity?.customersCreated ?? 0)}</td>
                        <td className="py-1.5 px-2 text-right">{number((run.identity?.unmatchedQuotations ?? 0) + (run.identity?.unmatchedOrders ?? 0))}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.identity?.identityConflicts ?? 0)}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.identity?.customerRowsRejected ?? 0)}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.identity?.invalidDates ?? 0)}</td>
                        <td className="py-1.5 px-2 text-right">{number(run.identity?.ownerUnresolved ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
