# AuditPulse Data Onboarding Validation Rules & Report Engine

Tài liệu quy định chi tiết bộ quy tắc kiểm tra (Validation Rules) và cơ chế báo cáo lỗi theo từng dòng của hệ thống Onboarding.

---

## 1. Nguyên tắc Thẩm định (Validation Philosophy)

1. **Kiểm tra 2 lớp (In-Batch & In-Database)**:
   - *Lớp 1 (In-Batch)*: Phát hiện lỗi định dạng, giá trị trống, trùng lặp mã nội bộ trong file import trước khi gửi truy vấn đến DB.
   - *Lớp 2 (In-Database)*: Kiểm tra khóa ngoại (Foreign Keys), trùng lặp với bản ghi đã tồn tại trên Neon, và các ràng buộc loại trừ khoảng thời gian (Interval Exclusions).
2. **Báo cáo lỗi chi tiết theo dòng (Row-by-Row Error Report)**:
   - Không dừng lại ở dòng đầu tiên bị lỗi; hệ thống quét toàn bộ tệp và tổng hợp tất cả lỗi.
   - Mỗi lỗi được định danh theo: `rowNumber` (số dòng thực tế trên file), `field` (tên cột), `error` (thông điệp lỗi cụ thể), `rawValue` (giá trị thực tế trong file).
3. **An toàn Giao dịch (Transactional Commit)**:
   - Nếu có bất kỳ lỗi nghiêm trọng nào, việc commit bị từ chối trừ khi chạy chế độ skip invalid rows hoặc sửa xong file.
   - Khi commit thành công, mọi thao tác được bọc trong PostgreSQL transaction (`BEGIN ... COMMIT`) và ghi nhật ký Audit Trail đầy đủ.

---

## 2. Chi tiết Bộ Quy tắc Kiểm tra Theo Thực Thể

### 2.1. Đội ngũ Kinh doanh (Teams)
- `RULE-TEAM-01`: Cột `team_code` và `team_name` không được để trống.
- `RULE-TEAM-02`: `team_code` không được trùng với các dòng khác trong file import.
- `RULE-TEAM-03`: `team_code` không được trùng với team đã tồn tại trên hệ thống Neon.

### 2.2. Nhân viên Kinh doanh (Sale Profiles)
- `RULE-SALE-01`: Cột `sale_code`, `name`, `email`, `team_code` bắt buộc phải có giá trị.
- `RULE-SALE-02`: Email phải đúng định dạng (`regex: ^[^\s@]+@[^\s@]+\.[^\s@]+$`).
- `RULE-SALE-03`: `sale_code` và `email` không được trùng lặp trong file hoặc trong hệ thống.
- `RULE-SALE-04` *(Bắt buộc)*: **Sale bắt buộc có team**. Giá trị `team_code` phải tồn tại trong danh mục Teams (đã có trong DB hoặc được khai báo cùng batch).

### 2.3. Chuyên viên Kiểm toán (Auditor Profiles)
- `RULE-AUD-01`: Cột `auditor_code`, `name`, `email` bắt buộc phải có giá trị.
- `RULE-AUD-02`: `auditor_code` và `email` không được trùng lặp.
- `RULE-AUD-03`: `max_daily_capacity` nếu có phải là số nguyên dương hợp lệ ($> 0$).

### 2.4. Phân công Auditor (Auditor Assignments)
- `RULE-ASSIGN-01`: `sale_code` và `auditor_code` phải tồn tại trong hệ thống.
- `RULE-ASSIGN-02`: `effective_from` phải đúng định dạng ngày `YYYY-MM-DD`.
- `RULE-ASSIGN-03`: Nếu có `effective_to`, giá trị phải $\ge$ `effective_from`.
- `RULE-ASSIGN-04` *(In-Batch Overlap Prevention)*: Một sale không được xuất hiện 2 lần trong file với khoảng ngày bị chồng lấn.
- `RULE-ASSIGN-05` *(Database Overlap Prevention)*: Khoảng `[effective_from, effective_to]` không được giao nhau với bất kỳ phân công nào đang tồn tại của cùng Sale trên database Neon (đáp ứng ràng buộc `btree_gist` Exclusion Constraint).
- `RULE-ASSIGN-06`: Không cho phép 2 phân công vô thời hạn (`effective_to` để trống) cho cùng 1 sale.

### 2.5. Danh mục Lỗi (Issue Catalog)
- `RULE-ISSUE-01`: `issue_code`, `issue_name`, `issue_group_code`, `severity`, `is_definition_complete` bắt buộc phải có giá trị.
- `RULE-ISSUE-02`: `issue_code` không được trùng lặp.
- `RULE-ISSUE-03`: `severity` bắt buộc thuộc tập giá trị hợp lệ: `LOW`, `MEDIUM`, `HIGH`.
- `RULE-ISSUE-04` *(Chế tài tự động)*: **Chỉ danh mục lỗi đã duyệt (`is_definition_complete = true`) mới được phép dùng cho chế tài tự động**. Nếu `is_definition_complete = false`, hệ thống gắn nhãn cảnh báo (Warning) và không cấp quyền kích hoạt Corrective Action tự động.

### 2.6. Cấu hình Quy tắc SLA (SLA Configuration)
- `RULE-SLA-01`: `target_type` phải là `ISSUE` hoặc `GROUP`.
- `RULE-SLA-02`: `target_code` phải tồn tại trong danh mục lỗi hoặc danh mục nhóm lỗi.
- `RULE-SLA-03`: `action_due_hours`, `recheck_due_hours`, `max_rechecks` phải là số nguyên dương $> 0$.

### 2.7. Nguồn Vận hành (Operational Data)
- `RULE-OP-01` *(Customer)*: `customer_code`, `customer_name`, `current_sale_code` bắt buộc có giá trị. `current_sale_code` phải thuộc danh mục Sale.
- `RULE-OP-02` *(Quotation)*: `quote_code` duy nhất, `customer_code` và `sale_code` phải tồn tại. `total_amount` $\ge 0$. `status` $\in$ `['PENDING', 'ACCEPTED', 'EXPIRED', 'REJECTED']`.
- `RULE-OP-03` *(Sales Order)*: `order_code` duy nhất, `customer_code` và `sale_code` phải tồn tại. `order_date` hợp lệ. `status` $\in$ `['VALID', 'DRAFT', 'CANCELLED', 'REFUNDED']`.

---

## 3. Cấu trúc Báo Cáo Lỗi (Error Report Schema)

Khi validation engine chạy, kết quả trả về có định dạng chuẩn:

```typescript
export interface RowValidationError {
  rowNumber: number;      // Dòng trên file CSV/Excel (bắt đầu từ 2, sau header)
  field: string;          // Tên cột bị lỗi (vd: "team_code", "email")
  error: string;          // Thông điệp lỗi chi tiết tiếng Việt
  rawValue?: string;      // Giá trị sai được ghi nhận từ file
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationSummaryReport {
  entityType: string;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  hasErrors: boolean;
  errors: RowValidationError[];
  previewRows: Record<string, any>[];
}
```

### Ví dụ Báo Cáo Lỗi Trả Về:
```json
{
  "entityType": "SALES",
  "totalRows": 4,
  "validRowsCount": 2,
  "invalidRowsCount": 2,
  "hasErrors": true,
  "errors": [
    {
      "rowNumber": 3,
      "field": "team_code",
      "error": "Sale bắt buộc có team: Mã team 'TEAM-UNKNOWN' không tồn tại trong danh mục.",
      "rawValue": "TEAM-UNKNOWN",
      "severity": "ERROR"
    },
    {
      "rowNumber": 4,
      "field": "sale_code",
      "error": "Mã sale 'SALE-01' bị trùng lặp với dòng 2.",
      "rawValue": "SALE-01",
      "severity": "ERROR"
    }
  ]
}
```

---

## 4. Nhật Ký Audit Trail Sau Khi Commit
Khi người dùng hoặc script thực thi lệnh Commit vào Neon:
1. Tạo một bản ghi trong `data_import_batches` lưu: `entity_type`, `file_name`, `total_rows`, `success_rows`, `failed_rows`, `imported_by`, `validation_report`.
2. Tạo một sự kiện trong `audit_trail_events` với action `DATA_ONBOARDING_IMPORT` kèm chi tiết số dòng đã import và người thực hiện.
3. Cập nhật `source_sync_logs` tương ứng để Dashboard hiển thị thời điểm đồng bộ mới nhất.
