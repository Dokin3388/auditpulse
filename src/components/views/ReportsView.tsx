import React, { useMemo, useState } from 'react';
import { TrendingUp, ShieldCheck } from 'lucide-react';
import { useAuditStore } from '../../services/auditStore';
import { Badge } from '../common/Badge';

const iso = (value: string) => value.slice(0, 10);
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const Metric = ({ label, value, hint }: { label: string; value: string; hint: string }) => <div className="p-2.5 rounded-md bg-slate-50 border flex items-center justify-between"><div className="font-medium">{label}</div><div className="text-right"><strong>{value}</strong><span className="block text-[10px] text-slate-500">{hint}</span></div></div>;

export const ReportsView: React.FC = () => {
  const { queueItems, correctiveActions, rescuedOrders } = useAuditStore();
  const dates = queueItems.map((item) => iso(item.auditDate)).sort();
  const [dateFrom, setDateFrom] = useState(dates[0] || '');
  const [dateTo, setDateTo] = useState(dates[dates.length - 1] || '');
  const [team, setTeam] = useState('ALL');
  const teams = useMemo(() => [...new Set(queueItems.map((item) => item.teamName).filter(Boolean))].sort(), [queueItems]);
  const inRange = (date: string, teamName?: string) => (!dateFrom || iso(date) >= dateFrom) && (!dateTo || iso(date) <= dateTo) && (team === 'ALL' || teamName === team);
  const filteredQueue = queueItems.filter((item) => inRange(item.auditDate, item.teamName));
  const filteredActions = correctiveActions.filter((item) => inRange(item.createdAt, item.teamName));
  const filteredOrders = rescuedOrders.filter((item) => inRange(item.orderDate, queueItems.find((q) => q.saleId === item.saleId)?.teamName));
  const noQuote = filteredQueue.filter((item) => item.riskTags.some((tag) => tag.code === 'NO_QUOTATION')).length;
  const quotedNotOrdered = filteredQueue.filter((item) => item.riskTags.some((tag) => tag.code === 'QUOTED_NOT_ORDERED')).length;
  const closedOnTime = filteredActions.filter((item) => item.status === 'VERIFIED_CLOSED' && !item.isOverdue).length;
  const rescuedValue = filteredOrders.reduce((sum, item) => sum + item.orderValue, 0);
  const teamRows = teams.filter((name) => team === 'ALL' || name === team).map((name) => {
    const items = filteredQueue.filter((item) => item.teamName === name);
    const actions = filteredActions.filter((item) => item.teamName === name);
    const orders = filteredOrders.filter((item) => queueItems.find((q) => q.saleId === item.saleId)?.teamName === name);
    return { name, total: items.length, noQuote: items.filter((i) => i.riskTags.some((t) => t.code === 'NO_QUOTATION')).length, quoted: items.filter((i) => i.riskTags.some((t) => t.code === 'QUOTED_NOT_ORDERED')).length, closed: actions.filter((a) => a.status === 'VERIFIED_CLOSED').length, orders: orders.length, value: orders.reduce((sum, o) => sum + o.orderValue, 0) };
  });
  return <div className="space-y-5 pb-12">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">Báo cáo dữ liệu thật</span><Badge variant="neutral" size="xs">Không dùng mockup</Badge></div><h1 className="text-2xl font-bold mt-1">Báo cáo KPI Vận hành & Tác động Doanh thu</h1><p className="text-xs text-slate-500">Số liệu lấy từ Queue, Corrective Action và đơn hàng attribution.</p></div><div className="flex flex-wrap gap-2 text-xs"><label>Từ <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-1.5 border rounded" /></label><label>Đến <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-1.5 border rounded" /></label><select value={team} onChange={(e) => setTeam(e.target.value)} className="px-2 py-1.5 border rounded"><option value="ALL">Tất cả Team</option>{teams.map((name) => <option key={name}>{name}</option>)}</select></div></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><section className="bg-white rounded-lg border p-4 space-y-3"><h3 className="font-semibold text-xs uppercase flex items-center gap-2"><ShieldCheck className="w-4 h-4" />KPI Chất lượng Thực thi</h3><div className="text-xs space-y-2"><Metric label="NO_QUOTATION" value={`${Math.round(noQuote / Math.max(1, filteredQueue.length) * 100)}%`} hint={`${noQuote}/${filteredQueue.length} case`} /><Metric label="QUOTED_NOT_ORDERED" value={`${Math.round(quotedNotOrdered / Math.max(1, filteredQueue.length) * 100)}%`} hint={`${quotedNotOrdered}/${filteredQueue.length} case`} /><Metric label="Action đóng đúng hạn" value={`${Math.round(closedOnTime / Math.max(1, filteredActions.length) * 100)}%`} hint={`${closedOnTime}/${filteredActions.length} action`} /></div></section><section className="bg-white rounded-lg border p-4 space-y-3"><h3 className="font-semibold text-xs uppercase flex items-center gap-2"><TrendingUp className="w-4 h-4" />KPI Tác động Kinh doanh</h3><div className="text-xs space-y-2"><Metric label="Doanh thu đơn cứu được" value={money(rescuedValue)} hint={`${filteredOrders.length} đơn attribution`} /><Metric label="Case được lọc" value={String(filteredQueue.length)} hint={dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'Toàn bộ dữ liệu'} /></div></section></div>
    <section className="bg-white rounded-lg border p-4"><h3 className="text-xs font-semibold uppercase mb-3">Chi tiết theo Team</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="py-2">Team</th><th>Case</th><th>NO_QUOTATION</th><th>QUOTED_NOT_ORDERED</th><th>Action đóng</th><th>Đơn cứu</th><th>Giá trị</th></tr></thead><tbody>{teamRows.map((row) => <tr key={row.name} className="border-b"><td className="py-2 font-medium">{row.name}</td><td>{row.total}</td><td>{row.noQuote}</td><td>{row.quoted}</td><td>{row.closed}</td><td>{row.orders}</td><td>{money(row.value)}</td></tr>)}{teamRows.length === 0 && <tr><td colSpan={7} className="py-5 text-center text-slate-500">Không có dữ liệu trong bộ lọc.</td></tr>}</tbody></table></div></section>
  </div>;
};
