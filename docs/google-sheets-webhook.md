# Đồng bộ Google Sheets gần như tức thì

AuditPulse nhận **chỉ những dòng vừa thay đổi** từ Google Sheets. Mỗi lần gửi tối đa 500 dòng để tránh nghẽn; server chống trùng theo `deliveryId` và theo nội dung từng dòng.

## Quy tắc dữ liệu

- `data_team_sale`, `data_sale`, `Trang tính1`, `data_customers`, `misa_bao_gia_ggs`, `misa_don_hang_ggs`, `dim_issue`: được đưa vào các bảng vận hành phù hợp.
- `fact_issue_log` và những tab chấm lỗi khác: được lưu nguyên trạng trong ledger đồng bộ. Chúng **không tự tạo action/phạt**; auditor vẫn phải review.
- Do file nguồn hiện chưa có email sale/auditor, hệ thống dùng định danh nội bộ dạng `@pending.auditpulse.local` và không dùng chúng để đăng nhập. Khi triển khai đăng nhập thật, Head Auditor sẽ bổ sung email thật cho từng người.

## Cấu hình server

Trên môi trường chạy API đặt hai biến môi trường server-only:

```text
DATABASE_URL=...
GOOGLE_SHEETS_WEBHOOK_SECRET=<một chuỗi dài, ngẫu nhiên>
```

Không đưa hai giá trị này vào React, Google Sheet cell hay GitHub.

## Apps Script

Trong **mỗi spreadsheet nguồn**, vào `Extensions` → `Apps Script`, dán đoạn dưới đây. Thay `WEBHOOK_URL` và `SOURCE_ID` bằng giá trị của môi trường tương ứng. Mỗi file dùng một `SOURCE_ID` khác nhau (ví dụ `sales-operations`, `sale-issues`, `audit-team`).

```javascript
const WEBHOOK_URL = 'https://YOUR-API-DOMAIN/api/sync/google-sheets/webhook';
const SOURCE_ID = 'sales-operations';
const MAX_ROWS_PER_DELIVERY = 500;

function configureAuditPulseSecret() {
  const secret = Browser.inputBox('Dán secret đồng bộ AuditPulse');
  if (!secret || secret === 'cancel') return;
  PropertiesService.getScriptProperties()
    .setProperty('AUDITPULSE_WEBHOOK_SECRET', secret);
}

function installAuditPulseTrigger() {
  ScriptApp.newTrigger('sendAuditPulseChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

function sendAuditPulseChange(event) {
  const webhookSecret = PropertiesService.getScriptProperties().getProperty('AUDITPULSE_WEBHOOK_SECRET');
  if (!webhookSecret) throw new Error('Thiếu AUDITPULSE_WEBHOOK_SECRET trong Script Properties.');
  const range = event.range;
  const sheet = range.getSheet();
  if (range.getRow() === 1) return; // header only

  const headerWidth = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, headerWidth).getDisplayValues()[0];
  const startRow = range.getRow();
  const rowCount = Math.min(range.getNumRows(), MAX_ROWS_PER_DELIVERY);
  const rows = sheet.getRange(startRow, 1, rowCount, headerWidth).getDisplayValues();
  const payload = {
    sourceId: SOURCE_ID,
    sheetName: sheet.getName(),
    deliveryId: Utilities.getUuid(),
    spreadsheetId: SpreadsheetApp.getActive().getId(),
    rowStart: startRow,
    headers: headers,
    rows: rows
  };
  const response = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-auditpulse-webhook-secret': webhookSecret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() >= 300) {
    throw new Error(`AuditPulse sync failed: ${response.getResponseCode()} ${response.getContentText()}`);
  }
}
```

Sau khi lưu, chạy `configureAuditPulseSecret` **một lần**, dán secret khi hộp thoại hiện ra, rồi chạy `installAuditPulseTrigger` **một lần** để cho phép quyền. Đây là installable trigger nên hoạt động cả khi người khác sửa Sheet. Secret nằm trong Script Properties, không nằm trong cell hoặc mã nguồn GitHub.

## Đồng bộ dữ liệu lịch sử lần đầu

Webhook xử lý thay đổi mới. Với dữ liệu sẵn có lớn, dùng một nút/chức năng import theo từng tab, hoặc chạy `sendInitialBatch` theo lô 500 dòng ở giờ thấp điểm. Không dán hàng chục nghìn dòng vào webhook trong một request.
