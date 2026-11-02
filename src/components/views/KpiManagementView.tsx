import React, { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Plus, Settings2, Target } from 'lucide-react';
import { useAuditStore } from '../../services/auditStore';
import {
  createKpiPeriod,
  getKpiMetricDefinitions,
  getKpiPeriods,
  saveKpiPeriodMetrics,
  type KpiMetricDefinition,
  type KpiPeriod,
} from '../../services/api';

export const KpiManagementView: React.FC = () => {
  const { currentUser } = useAuditStore();
  const canManage = currentUser.role === 'HEAD_AUDITOR' || currentUser.role === 'ADMIN';
  const [periods, setPeriods] = useState<KpiPeriod[]>([]);
  const [metrics, setMetrics] = useState<KpiMetricDefinition[]>([]);
  const [name, setName] = useState('KPI Tháng 11/2026');
  const [startsOn, setStartsOn] = useState('2026-11-01');
  const [endsOn, setEndsOn] = useState('2026-11-30');
  const [selectedId, setSelectedId] = useState('');
  const [weights, setWeights] = useState<Record<string, string>>({
    TEAM_QUOTE_RATE: '20', TEAM_CLOSE_RATE: '25', RESCUED_ORDERS: '25', ON_TIME_CASE_RATE: '15', SALE_PERFORMANCE_IMPROVEMENT: '15',
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalWeight = useMemo(() => Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0), [weights]);

  useEffect(() => {
    Promise.all([getKpiPeriods(), getKpiMetricDefinitions()])
      .then(([nextPeriods, nextMetrics]) => { setPeriods(nextPeriods); setMetrics(nextMetrics); })
      .catch((error) => setFeedback(error instanceof Error ? error.message : 'Không thể tải cấu hình KPI.'));
  }, []);

  const createPeriod = async () => {
    if (!canManage || saving) return;
    setSaving(true); setFeedback(null);
    try {
      const period = await createKpiPeriod({ name, startsOn, endsOn });
      setPeriods((old) => [period, ...old]); setSelectedId(period.id);
      setFeedback('Đã tạo kỳ KPI ở trạng thái Nháp. Hãy lưu trọng số trước khi áp dụng.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Không thể tạo kỳ KPI.'); }
    finally { setSaving(false); }
  };

  const saveWeights = async () => {
    if (!selectedId || totalWeight !== 100 || saving) return;
    setSaving(true); setFeedback(null);
    try {
      await saveKpiPeriodMetrics(selectedId, metrics.map((metric) => ({ metricId: metric.id, weight: Number(weights[metric.code] || 0) })));
      setFeedback('Đã lưu phiên bản chỉ tiêu và trọng số cho kỳ KPI.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Không thể lưu trọng số KPI.'); }
    finally { setSaving(false); }
  };

  if (!canManage) return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">Chỉ Head Auditor hoặc Admin được xem cấu hình KPI và thưởng.</div>;

  return <div className="space-y-5 pb-12">
    <div><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Settings2 className="w-4 h-4"/> Quản trị KPI & thưởng</div><h1 className="mt-1 text-2xl font-bold">Kỳ KPI của Auditor</h1><p className="mt-1 text-sm text-slate-500">Thiết lập chỉ tiêu trước, sau đó mới giao mục tiêu từng Auditor và khóa sổ thưởng.</p></div>
    {feedback && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{feedback}</div>}
    <div className="grid gap-5 lg:grid-cols-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Plus className="w-4 h-4"/> Tạo kỳ KPI</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Tên kỳ KPI" />
        <div className="grid grid-cols-2 gap-2"><input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm"/><input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm"/></div>
        <button onClick={createPeriod} disabled={saving} className="w-full rounded bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-40">Tạo kỳ Nháp</button>
        <div className="border-t pt-3 space-y-2">{periods.map((period) => <button key={period.id} onClick={() => setSelectedId(period.id)} className={`w-full rounded border p-2 text-left text-sm ${selectedId === period.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}><div className="font-semibold">{period.name}</div><div className="text-xs text-slate-500">{period.startsOn} → {period.endsOn} · {period.status}</div></button>)}{periods.length === 0 && <p className="text-sm text-slate-500">Chưa có kỳ KPI nào.</p>}</div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3 space-y-3">
        <div className="flex justify-between gap-3"><div><h2 className="font-bold flex items-center gap-2"><Target className="w-4 h-4"/> Bộ chỉ tiêu của kỳ</h2><p className="text-xs text-slate-500 mt-1">Tổng trọng số phải bằng 100%. Kỳ đã khóa không được sửa.</p></div><div className={`text-sm font-bold ${totalWeight === 100 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalWeight}%</div></div>
        <div className="space-y-2">{metrics.map((metric) => <div key={metric.id} className="grid grid-cols-[1fr_88px] gap-3 rounded border border-slate-200 p-3"><div><div className="font-semibold text-sm">{metric.name}</div><div className="text-xs text-slate-500">{metric.description}</div></div><label className="text-xs font-semibold text-slate-500">Trọng số<input type="number" min="0" max="100" value={weights[metric.code] || ''} onChange={(e) => setWeights((old) => ({ ...old, [metric.code]: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"/></label></div>)}</div>
        <button onClick={saveWeights} disabled={!selectedId || totalWeight !== 100 || saving} className="w-full rounded bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-40">Lưu bộ KPI cho kỳ đang chọn</button>
        <div className="flex gap-2 rounded bg-amber-50 p-3 text-xs text-amber-900"><LockKeyhole className="h-4 w-4 shrink-0"/>Khi kỳ được khóa sổ, công thức và trọng số phải được giữ nguyên; mọi điều chỉnh thưởng cần có lý do và người duyệt.</div>
      </section>
    </div>
  </div>;
};
