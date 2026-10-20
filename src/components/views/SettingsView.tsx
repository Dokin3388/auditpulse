import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Shield,
  Clock,
  Lock,
} from 'lucide-react';
import { Badge, SeverityBadge } from '../common/Badge';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    issueDefinitions,
    sourceSyncLogs,
    approveIssueDefinition,
    triggerManualSync,
  } = useAuditStore();

  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const handleManualSync = (sourceId: string, name: string) => {
    if (!isHeadAuditor) return;
    triggerManualSync(sourceId);
    setSyncFeedback(`Đã kích hoạt đồng bộ lại nguồn ${name} thành công.`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
              Quản trị Cấu hình Hệ thống
            </span>
            <span className="text-xs text-slate-400">Spec v1.1 Mục 6 & 11</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            Issue Catalog & Đồng bộ Nguồn Dữ liệu
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý danh mục lỗi chuẩn hóa, phiên bản SLA và trạng thái đồng bộ dữ liệu.
          </p>
        </div>

        {!isHeadAuditor && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <Lock className="w-3.5 h-3.5" />
            <span>Quyền hạn ghi chỉ dành cho Head Auditor</span>
          </div>
        )}
      </div>

      {syncFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {syncFeedback}
        </div>
      )}

      {/* Section 1: Issue Catalog Management */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-600" />
              Danh mục Catalog Lỗi (Issue Definition Catalog)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Lỗi chưa duyệt mức độ vẫn cho phép auditor ghi nhận, nhưng không kích hoạt chế tài tự động.
            </p>
          </div>
          <Badge variant="purple" size="sm">
            Catalog v1.4
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850 text-slate-400 border-b dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Mã lỗi</th>
                <th className="py-2.5 px-3 font-semibold">Tên lỗi & Hướng dẫn recheck</th>
                <th className="py-2.5 px-3 font-semibold">Nhóm lỗi</th>
                <th className="py-2.5 px-3 font-semibold">Mức độ</th>
                <th className="py-2.5 px-3 font-semibold">Trạng thái Duyệt (Head Auditor)</th>
                {isHeadAuditor && <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {issueDefinitions.map((def) => (
                <tr key={def.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                    {def.issueCode}
                  </td>
                  <td className="py-3 px-3 max-w-md">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {def.issueName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {def.recheckGuidanceTemplate}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-500">{def.issueGroupName}</td>
                  <td className="py-3 px-3">
                    <SeverityBadge severity={def.severity} hardFail={def.hardFail} />
                  </td>
                  <td className="py-3 px-3">
                    {def.isDefinitionComplete ? (
                      <Badge variant="success" size="xs">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                        Đã duyệt chuẩn hóa
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="xs">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" />
                        Chờ duyệt mức độ
                      </Badge>
                    )}
                  </td>
                  {isHeadAuditor && (
                    <td className="py-3 px-3 text-right">
                      {!def.isDefinitionComplete && (
                        <button
                          onClick={() => approveIssueDefinition(def.id)}
                          className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded text-[11px] transition-colors"
                        >
                          Duyệt lỗi
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Data Source Sync Status & Daily Runbook */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              Trạng thái Đồng bộ 4 Nguồn Dữ liệu (Source Sync Status)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Quy tắc bất biến: Queue ngày D snapshot từ nguồn chốt 00:00; dữ liệu muộn được dời sang run tiếp theo.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Múi giờ: Asia/Ho_Chi_Minh
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sourceSyncLogs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {log.sourceName}
                </span>
                <Badge variant={log.status === 'SYNCED' ? 'success' : 'warning'} size="xs">
                  {log.status === 'SYNCED' ? 'Đã chốt' : 'Chậm'}
                </Badge>
              </div>

              <div className="space-y-1 text-slate-500">
                <div>
                  Bản ghi: <strong className="text-slate-800 dark:text-slate-200">{log.recordCount.toLocaleString('vi-VN')}</strong>
                </div>
                <div>
                  Độ trễ: <span className="font-mono">{log.latencySeconds}s</span>
                </div>
                <div>
                  Chốt lúc: <span className="font-mono">{new Date(log.lastSyncTime).toLocaleTimeString('vi-VN')}</span>
                </div>
              </div>

              {log.notes && (
                <p className="text-[11px] text-slate-400 pt-1 border-t dark:border-slate-800 line-clamp-2">
                  {log.notes}
                </p>
              )}

              {isHeadAuditor && (
                <button
                  onClick={() => handleManualSync(log.id, log.sourceName)}
                  className="w-full mt-2 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  Đồng bộ thủ công
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: SLA & Rule Engine Settings */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-600" />
          Quy chuẩn SLA & Escalation Engine (Spec v1.1)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200 block">
              SLA Chấm Queue Hằng ngày:
            </span>
            <p className="text-slate-500 text-[11px]">
              Tối đa <strong>12 tiếng</strong> từ thời điểm gán queue (07:00 đến 19:00 cùng ngày audit D).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200 block">
              SLA Sale Khắc phục & Recheck:
            </span>
            <p className="text-slate-500 text-[11px]">
              Sale có <strong>48 tiếng</strong> để bổ sung báo giá/follow-up. Auditor recheck trong vòng <strong>24 tiếng</strong> kể từ khi sale bấm gửi.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 space-y-1">
            <span className="font-bold text-slate-800 dark:text-slate-200 block">
              Escalation Chặn Recheck Vô hạn:
            </span>
            <p className="text-slate-500 text-[11px]">
              Sau <strong>2 lần NOT_IMPROVED</strong> liên tiếp, action tự động leo thang (Escalate) lên Team Lead và Head Auditor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
