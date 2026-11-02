import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { createManualAuditQueue, tomorrowInVietnam } from '../../services/api';

const TEMPLATE = `customer_name,phone,sale_code,team_code,check_reason,priority,notes
Nguyễn Văn An,0901234567,SALE-01,TEAM-ALPHA,Khách cần gọi lại để làm rõ nhu cầu,HIGH,Đã im lặng 2 ngày
Trần Thị Bình,0912345678,SALE-02,TEAM-ALPHA,Kiểm tra chất lượng tư vấn báo giá,MEDIUM,Ưu tiên liên hệ buổi sáng`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'danh-sach-kiem-tra-ngay-mai.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export const DailyCheckListView: React.FC = () => {
  const [auditDate, setAuditDate] = useState(tomorrowInVietnam);
  const [fileName, setFileName] = useState('danh-sach-kiem-tra-ngay-mai.csv');
  const [csvText, setCsvText] = useState(TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const count = useMemo(() => Math.max(csvText.split(/\r?\n/).filter((line) => line.trim()).length - 1, 0), [csvText]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  };

  const submit = async () => {
    if (saving || !csvText.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await createManualAuditQueue({ auditDate, fileName, csvText });
      setFeedback({ kind: 'success', text: `Đã lập ${result.createdCount} case cho ngày ${auditDate}. ${result.unassignedCount ? `${result.unassignedCount} case chưa có Auditor phụ trách.` : 'Toàn bộ case đã xác định Auditor theo phân công hiện hành.'}` });
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Không thể lập danh sách kiểm tra.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><CalendarDays className="h-4 w-4" /> Lập kế hoạch kiểm tra</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Danh sách khách cần check</h1>
          <p className="mt-1 text-sm text-slate-500">Bạn chuẩn bị hôm nay; Auditor nhận đúng danh sách vào ngày kiểm tra.</p>
        </div>
        <button onClick={downloadTemplate} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Download className="h-4 w-4" /> Tải file mẫu
        </button>
      </div>

      {feedback && <div className={`rounded-md border px-3 py-2 text-sm ${feedback.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>{feedback.text}</div>}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Ngày Auditor kiểm tra</label><input type="date" value={auditDate} min={tomorrowInVietnam()} onChange={(event) => setAuditDate(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" /></div>
          <label className="block cursor-pointer rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><UploadCloud className="mx-auto mb-2 h-5 w-5" /><span className="font-semibold">Chọn file CSV</span><span className="mt-1 block text-xs">hoặc dán trực tiếp nội dung ở bên phải</span><input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" /></label>
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><div className="mb-1 flex items-center gap-1.5 font-bold"><FileSpreadsheet className="h-4 w-4" /> Cột bắt buộc</div><p><code>customer_name, phone, sale_code, team_code, check_reason</code></p><p className="mt-1">Tùy chọn: <code>priority</code> (LOW/MEDIUM/HIGH), <code>notes</code>.</p></div>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
          <div className="flex items-center justify-between"><div><h2 className="font-bold">Xem trước danh sách</h2><p className="text-xs text-slate-500">{fileName} · {count} dòng dữ liệu</p></div></div>
          <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={14} spellCheck={false} className="w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800 outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Hệ thống kiểm tra mã sale/team, trùng SĐT trong ngày và phân công Auditor trước khi ghi dữ liệu.</p><button onClick={submit} disabled={saving || count === 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"><CheckCircle2 className="h-4 w-4" />{saving ? 'Đang kiểm tra và lưu...' : `Chốt ${count} case`}</button></div>
        </section>
      </div>
    </div>
  );
};
