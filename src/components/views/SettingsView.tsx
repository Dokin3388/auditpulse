import React, { useEffect, useMemo, useState } from 'react';
import { useAuditStore } from '../../services/auditStore';
import {
  Database,
  Shield,
  Clock,
  Lock,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';
import { Badge, SeverityBadge } from '../common/Badge';
import { DataOnboardingTab } from './DataOnboardingTab';
import { bootstrapAuditorAccounts, getGoogleSheetSyncRuns, getSourceIssueLogs, type GoogleSheetSyncRun, type SourceIssueLog } from '../../services/api';

const googleSourceLabels: Record<GoogleSheetSyncRun['sourceId'], string> = {
  'sales-operations': 'Vận hành Sale',
  'sale-issues': 'Chấm lỗi Sale',
  'audit-team': 'Team Audit',
};

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    issueDefinitions,
    approveIssueDefinition,
  } = useAuditStore();

  const isHeadAuditor = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'onboarding' | 'catalog' | 'sync'>('onboarding');
  const [googleSyncRuns, setGoogleSyncRuns] = useState<GoogleSheetSyncRun[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [issueLogs, setIssueLogs] = useState<SourceIssueLog[]>([]);
  const [issueLogTotal, setIssueLogTotal] = useState(0);
  const [bootstrapAccounts, setBootstrapAccounts] = useState<Array<{ id: string; name: string; email: string; password: string }>>([]);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const createAuditorAccounts = async () => {
    setBootstrapError(null);
    try {
      setBootstrapAccounts(await bootstrapAuditorAccounts());
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : 'Không thể tạo tài khoản Auditor.');
    }
  };

  const refreshGoogleSyncStatus = async () => {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const [runs, issueLogResult] = await Promise.all([getGoogleSheetSyncRuns(), getSourceIssueLogs()]);
      setGoogleSyncRuns(runs);
      setIssueLogs(issueLogResult.data);
      setIssueLogTotal(issueLogResult.total);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Không thể tải trạng thái đồng bộ.');
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'sync') return;

    let cancelled = false;
    void Promise.all([getGoogleSheetSyncRuns(), getSourceIssueLogs()])
      .then(([runs, issueLogResult]) => {
        if (!cancelled) {
          setGoogleSyncRuns(runs);
          setIssueLogs(issueLogResult.data);
          setIssueLogTotal(issueLogResult.total);
          setSyncError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : 'Không thể tải trạng thái đồng bộ.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const latestGoogleRuns = useMemo(
    () => Object.keys(googleSourceLabels).map((sourceId) =>
      googleSyncRuns.find((run) => run.sourceId === sourceId)
    ),
    [googleSyncRuns]
  );

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Quản trị Cấu hình Hệ thống
            </span>
            <span className="text-xs text-slate-500">Spec v1.1 Mục 6 & 11</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
            Cấu hình & Data Onboarding
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quản lý import dữ liệu Neon PostgreSQL, danh mục lỗi chuẩn hóa, phiên bản SLA và trạng thái đồng bộ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isHeadAuditor && (
            <button
              onClick={createAuditorAccounts}
              className="rounded-md bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Tạo 3 tài khoản Auditor nội bộ
            </button>
          )}

          {!isHeadAuditor && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-slate-700">
              <Lock className="w-3.5 h-3.5" />
              <span>Quyền hạn ghi chỉ dành cho Head Auditor</span>
            </div>
          )}
        </div>
      </div>

      {(bootstrapAccounts.length > 0 || bootstrapError) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-3 text-xs text-amber-900 dark:text-amber-200">
          {bootstrapError && <p className="text-rose-700 dark:text-rose-400 font-semibold">{bootstrapError}</p>}
          {bootstrapAccounts.length > 0 && (
            <>
              <p className="font-semibold">Đã tạo/cập nhật tài khoản Auditor. Gửi riêng thông tin dưới đây cho từng người:</p>
              <div className="mt-1.5 space-y-1 font-mono text-[11px]">
                {bootstrapAccounts.map((account) => (
                  <div key={account.id} className="p-1.5 bg-white dark:bg-slate-900 rounded border border-amber-200 dark:border-amber-900/40">
                    {account.name} — {account.email} — <strong className="text-slate-900 dark:text-slate-100">{account.password}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sub Tabs Bar */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-slate-700 w-fit">
        <button
          onClick={() => setActiveTab('onboarding')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            activeTab === 'onboarding'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Data Onboarding (CSV Import)</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
            Phase 1.5
          </span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            activeTab === 'catalog'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Issue Catalog & SLA</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            activeTab === 'sync'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Đồng bộ Dữ liệu Nguồn</span>
        </button>
      </div>

      {/* Tab Content 1: Data Onboarding Engine (Phase 1.5) */}
      {activeTab === 'onboarding' && <DataOnboardingTab />}

      {/* Tab Content 2: Issue Catalog & SLA Settings */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  Danh mục Catalog Lỗi (Issue Definition Catalog)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lỗi chưa duyệt vẫn cho phép auditor ghi nhận thủ công, nhưng không kích hoạt chế tài tự động.
                </p>
              </div>
              <Badge variant="neutral" size="sm">
                Phiên bản: {issueDefinitions[0]?.version || 'v1.4'}
              </Badge>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Mã lỗi</th>
                    <th className="py-2.5 px-3 font-semibold">Tên lỗi & Mô tả</th>
                    <th className="py-2.5 px-3 font-semibold">Nhóm lỗi</th>
                    <th className="py-2.5 px-3 font-semibold">Mức độ</th>
                    <th className="py-2.5 px-3 font-semibold">Hard Fail</th>
                    <th className="py-2.5 px-3 font-semibold">Trạng thái duyệt</th>
                    {isHeadAuditor && <th className="py-2.5 px-3 text-right font-semibold">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {issueDefinitions.map((def) => (
                    <tr key={def.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {def.issueCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {def.issueName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Hướng dẫn: {def.recheckGuidanceTemplate}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{def.issueGroupName}</td>
                      <td className="py-2.5 px-3">
                        <SeverityBadge severity={def.severity} />
                      </td>
                      <td className="py-2.5 px-3">
                        {def.hardFail ? (
                          <Badge variant="danger" size="xs">Bắt buộc</Badge>
                        ) : (
                          <span className="text-slate-400">Không</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {def.isDefinitionComplete ? (
                          <Badge variant="success" size="xs">Đã duyệt</Badge>
                        ) : (
                          <Badge variant="warning" size="xs">Đang soạn</Badge>
                        )}
                      </td>
                      {isHeadAuditor && (
                        <td className="py-2.5 px-3 text-right">
                          {!def.isDefinitionComplete && (
                            <button
                              onClick={() => approveIssueDefinition(def.id)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 rounded text-[11px] font-medium transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              Quy chuẩn SLA & Escalation Engine (Spec v1.1)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  SLA Chấm Queue Hằng ngày:
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  Tối đa <strong>12 tiếng</strong> từ thời điểm gán queue (07:00 đến 19:00 cùng ngày audit D).
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  SLA Sale Khắc phục & Recheck:
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  Sale có <strong>48 tiếng</strong> để bổ sung báo giá/follow-up. Auditor recheck trong vòng <strong>24 tiếng</strong> kể từ khi sale bấm gửi.
                </p>
              </div>

              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Escalation Chặn Recheck Vô hạn:
                </span>
                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  Sau <strong>2 lần NOT_IMPROVED</strong> liên tiếp, action tự động leo thang (Escalate) lên Team Lead và Head Auditor.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: Data Source Sync Status */}
      {activeTab === 'sync' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                Trạng thái Đồng bộ Dữ liệu Nguồn (Source Sync Status)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy tắc bất biến: Queue ngày D snapshot từ nguồn chốt 00:00; dữ liệu muộn được dời sang run tiếp theo.
              </p>
            </div>
            <button
              onClick={() => void refreshGoogleSyncStatus()}
              disabled={syncLoading}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          {syncError && (
            <div className="p-3 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs">
              {syncError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {latestGoogleRuns.map((run, index) => {
              const sourceId = Object.keys(googleSourceLabels)[index] as GoogleSheetSyncRun['sourceId'];
              const isCompleted = run?.status === 'COMPLETED';
              const isFailed = run?.status === 'FAILED';
              return (
                <div
                  key={sourceId}
                  className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {googleSourceLabels[sourceId]}
                    </span>
                    <Badge variant={isCompleted ? 'success' : isFailed ? 'danger' : 'warning'} size="xs">
                      {isCompleted ? 'Đã đồng bộ' : isFailed ? 'Lỗi' : run ? 'Đang xử lý' : 'Chưa có dữ liệu'}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                    <div>
                      Dòng nhận: <strong className="text-slate-900 dark:text-slate-100">{run?.totalRows ?? 0}</strong>
                    </div>
                    <div>
                      Đã áp dụng: <strong className="text-slate-900 dark:text-slate-100">{run?.appliedRows ?? 0}</strong>
                    </div>
                    <div>
                      Lần gần nhất: <span className="font-mono">{run ? new Date(run.receivedAt).toLocaleString('vi-VN') : '—'}</span>
                    </div>
                  </div>

                  {run?.sheetName && (
                    <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800 line-clamp-2">
                      Sheet: {run.sheetName}
                    </p>
                  )}

                  {run?.errorMessage && (
                    <p className="text-[11px] text-rose-600 pt-1 border-t border-rose-200 dark:border-rose-900 line-clamp-2">
                      {run.errorMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Nhật ký lỗi Sale cần auditor review</h4>
                <p className="text-[11px] text-slate-500">Dữ liệu gốc từ fact_issue_log, chưa tự tạo corrective action.</p>
              </div>
              <Badge variant="warning" size="xs">{issueLogTotal.toLocaleString('vi-VN')} dòng</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-semibold">
                  <tr>
                    <th className="py-2 px-3">Ngày</th>
                    <th className="py-2 px-3">Sale</th>
                    <th className="py-2 px-3">SĐT/KH</th>
                    <th className="py-2 px-3">Mã lỗi</th>
                    <th className="py-2 px-3">Đồng bộ lần cuối</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {issueLogs.slice(0, 20).map((item) => {
                    const payload = item.payload || {};
                    return (
                      <tr key={item.sourceRowKey} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{payload.date || payload.ngay || '—'}</td>
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{payload.sale || payload.sale_name || payload.ten_sale || '—'}</td>
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{payload.sdt || payload.phone || '—'}</td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">{payload.issue_code || payload.ma_loi || '—'}</td>
                        <td className="py-2 px-3 text-slate-500">{new Date(item.lastSyncedAt).toLocaleString('vi-VN')}</td>
                      </tr>
                    );
                  })}
                  {issueLogs.length === 0 && (
                    <tr><td colSpan={5} className="py-4 px-3 text-center text-slate-400">Chưa có nhật ký lỗi để review.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
