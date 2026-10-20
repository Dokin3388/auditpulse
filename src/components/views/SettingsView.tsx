import React, { useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  Database,
  CheckCircle2,
  RotateCcw,
  Shield,
  Clock,
  Lock,
  UploadCloud,
} from 'lucide-react';
import { Badge, SeverityBadge } from '../common/Badge';
import { DataOnboardingTab } from './DataOnboardingTab';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    issueDefinitions,
    sourceSyncLogs,
    approveIssueDefinition,
    triggerManualSync,
  } = useAuditStore();

  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'onboarding' | 'catalog' | 'sync'>('onboarding');
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
            Cấu hình & Data Onboarding
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý import dữ liệu Neon PostgreSQL, danh mục lỗi chuẩn hóa, phiên bản SLA và trạng thái đồng bộ.
          </p>
        </div>

        {!isHeadAuditor && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <Lock className="w-3.5 h-3.5" />
            <span>Quyền hạn ghi chỉ dành cho Head Auditor</span>
          </div>
        )}
      </div>

      {/* Sub Tabs Bar */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-850 rounded-xl border border-slate-200/80 dark:border-slate-800 w-fit">
        <button
          onClick={() => setActiveTab('onboarding')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'onboarding'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Data Onboarding (CSV Import)</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
            Phase 1.5
          </span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'catalog'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Issue Catalog & SLA</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'sync'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Đồng bộ Dữ liệu Nguồn</span>
        </button>
      </div>

      {syncFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {syncFeedback}
        </div>
      )}

      {/* Tab Content 1: Data Onboarding Engine (Phase 1.5) */}
      {activeTab === 'onboarding' && <DataOnboardingTab />}

      {/* Tab Content 2: Issue Catalog & SLA Settings */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-600" />
                  Danh mục Catalog Lỗi (Issue Definition Catalog)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lỗi chưa duyệt vẫn cho phép auditor ghi nhận thủ công, nhưng không kích hoạt chế tài tự động.
                </p>
              </div>
              <Badge variant="purple" size="sm">
                Phiên bản: {issueDefinitions[0]?.version || 'v1.4'}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-400 border-b dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Mã lỗi</th>
                    <th className="py-2.5 px-3">Tên lỗi & Mô tả</th>
                    <th className="py-2.5 px-3">Nhóm lỗi</th>
                    <th className="py-2.5 px-3">Mức độ</th>
                    <th className="py-2.5 px-3">Hard Fail</th>
                    <th className="py-2.5 px-3">Trạng thái duyệt</th>
                    {isHeadAuditor && <th className="py-2.5 px-3 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {issueDefinitions.map((def) => (
                    <tr key={def.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {def.issueCode}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {def.issueName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Hướng dẫn: {def.recheckGuidanceTemplate}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{def.issueGroupName}</td>
                      <td className="py-3 px-3">
                        <SeverityBadge severity={def.severity} />
                      </td>
                      <td className="py-3 px-3">
                        {def.hardFail ? (
                          <Badge variant="danger" size="xs">Bắt buộc</Badge>
                        ) : (
                          <span className="text-slate-400">Không</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {def.isDefinitionComplete ? (
                          <Badge variant="success" size="xs">Đã duyệt</Badge>
                        ) : (
                          <Badge variant="warning" size="xs">Đang soạn</Badge>
                        )}
                      </td>
                      {isHeadAuditor && (
                        <td className="py-3 px-3 text-right">
                          {!def.isDefinitionComplete && (
                            <button
                              onClick={() => approveIssueDefinition(def.id)}
                              className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-[11px] font-semibold transition-colors"
                            >
                              Phê duyệt
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

          {/* SLA Rule Engine Settings */}
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
      )}

      {/* Tab Content 3: Data Source Sync Status */}
      {activeTab === 'sync' && (
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
      )}
    </div>
  );
};
