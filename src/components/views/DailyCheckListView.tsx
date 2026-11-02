import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { createManualAuditQueue, tomorrowInVietnam } from '../../services/api';

const TEMPLATE = `customer_name,phone,sale_code,team_code,check_reason,priority,notes
Nguyễn Văn An,0901234567,SALE-01,TEAM-ALPHA,Khách cần gọi lại để làm rõ nhu cầu,HIGH,Đã im lặng 2 ngày
Trần Thị Bình,0912345678,SALE-02,TEAM-ALPHA,Kiểm tra chất lượng tư vấn báo giá,MEDIUM,Ưu tiên liên hệ buổi sáng`;

const CANONICAL_HEADERS = ['customer_name', 'phone', 'sale_code', 'team_code', 'check_reason', 'priority', 'notes'];
const HEADER_ALIASES: Record<string, string> = {
  customer_name: 'customer_name', 'tên khách hàng': 'customer_name', 'ten khach hang': 'customer_name', 'khách hàng': 'customer_name', 'khach hang': 'customer_name',
  phone: 'phone', 'sđt': 'phone', 'sdt': 'phone', 'số điện thoại': 'phone', 'so dien thoai': 'phone',
  sale_code: 'sale_code', 'mã sale': 'sale_code', 'ma sale': 'sale_code', 'mã nhân viên': 'sale_code', 'ma nhan vien': 'sale_code',
  team_code: 'team_code', 'mã team': 'team_code', 'ma team': 'team_code', 'mã nhóm': 'team_code', 'ma nhom': 'team_code',
  check_reason: 'check_reason', 'lý do check': 'check_reason', 'ly do check': 'check_reason', 'lý do kiểm tra': 'check_reason', 'ly do kiem tra': 'check_reason',
  priority: 'priority', 'ưu tiên': 'priority', 'uu tien': 'priority',
  notes: 'notes', 'ghi chú': 'notes', 'ghi chu': 'notes',
};

function normaliseHeader(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
}

async function getXlsx() {
  return import('xlsx');
}

function createCsvFromRows(rows: unknown[][], xlsx: typeof import('xlsx')) {
  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders) throw new Error('File chưa có dòng tiêu đề.');
  const sourceHeaders = rawHeaders.map(normaliseHeader);
  const headerIndexes = CANONICAL_HEADERS.map((header) => sourceHeaders.findIndex((source) => HEADER_ALIASES[source] === header));
  const missing = CANONICAL_HEADERS.slice(0, 5).filter((_, index) => headerIndexes[index] < 0);
  if (missing.length) throw new Error(`File thiếu cột: ${missing.join(', ')}.`);
  const outputRows = dataRows
    .filter((row) => row.some((value) => String(value ?? '').trim()))
    .map((row) => headerIndexes.map((index) => index < 0 ? '' : String(row[index] ?? '').trim()));
  return xlsx.utils.sheet_to_csv(xlsx.utils.aoa_to_sheet([CANONICAL_HEADERS, ...outputRows]));
}

async function downloadTemplate() {
  const xlsx = await getXlsx();
  const rows = TEMPLATE.split(/\r?\n/).map((line) => line.split(','));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Danh sách check');
  const blob = new Blob([xlsx.write(workbook, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mau-danh-sach-kiem-tra.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export const DailyCheckListView: React.FC = () => {
  const [auditDate, setAuditDate] = useState(tomorrowInVietnam);
  const [fileName, setFileName] = useState('danh-sach-kiem-tra-ngay-mai.xlsx');
  const [csvText, setCsvText] = useState(TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const count = useMemo(() => Math.max(csvText.split(/\r?\n/).filter((line) => line.trim()).length - 1, 0), [csvText]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const xlsx = await getXlsx();
      const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('File chưa có sheet dữ liệu.');
      const rows = xlsx.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
      const csv = createCsvFromRows(rows, xlsx);
      setFileName(file.name);
      setCsvText(csv);
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Không thể đọc file Excel.' });
    }
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
          <label className="block cursor-pointer rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><UploadCloud className="mx-auto mb-2 h-5 w-5" /><span className="font-semibold">Chọn file Excel</span><span className="mt-1 block text-xs">Nhận .xlsx, .xls hoặc .csv; đọc sheet đầu tiên</span><input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={handleFile} className="hidden" /></label>
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
