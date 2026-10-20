# AuditPulse Data Mapping Specification & Onboarding Guide (v1.1)

Tài liệu đặc tả ánh xạ dữ liệu (Data Mapping) phục vụ giai đoạn **Phase 1.5: Data Onboarding cho Neon Development**.

---

## 1. Tổng quan Kiến trúc Dữ liệu & Quy trình Onboarding

Hệ thống AuditPulse phân tách dữ liệu thành 3 tầng:
1. **Org & Identity (Danh mục tổ chức)**: Teams, App Users, Sale Profiles, Auditor Profiles.
2. **Audit Catalog & Rules (Quy chế & SLA)**: Issue Definitions, SLA Configurations.
3. **Operational Source Data (Dữ liệu vận hành 30–60 ngày)**: Customers (CRM), Quotations (ERP), Sales Orders (POS/ERP), Sale Team History (HR).

### Sơ đồ luồng Data Onboarding:
```
File CSV/XLSX ─────────> CSV Parser (BOM, Quotes, Trim)
                               │
                               ▼
                        Validation Engine
                  (In-batch & Database checks)
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       Có lỗi (Validation Report)      Hợp lệ 100%
       (Xuất lỗi theo từng dòng)              │
                                              ▼
                                    Neon DB Transaction
                               (Parameterized Inserts/Upserts)
                                              │
                                              ▼
                                    Ghi nhận Audit Trail
                              (audit_trail_events & import_batches)
```

---

## 2. Chi tiết Mapping Danh mục Cột & Định dạng

### 2.1. Đội ngũ Kinh doanh (Teams)
- **Tệp mẫu**: `data/templates/01_teams_template.csv`
- **Bảng đích**: `teams`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `team_code` | `code` | `VARCHAR(50)` | **Có** | Mã duy nhất viết hoa, ví dụ: `TEAM-ALPHA`. |
| `team_name` | `name` | `VARCHAR(100)` | **Có** | Tên hiển thị đầy đủ của team. |
| `team_lead_email`| - | `VARCHAR(100)` | Không | Email của Trưởng nhóm phụ trách. |
| `team_lead_name` | - | `VARCHAR(100)` | Không | Tên hiển thị của Trưởng nhóm. |
| `notes` | - | `TEXT` | Không | Ghi chú nội bộ. |

---

### 2.2. Người dùng & Ban Lãnh đạo (App Users / Leads)
- **Tệp mẫu**: `data/templates/02_users_leads_template.csv`
- **Bảng đích**: `app_users`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `email` | `email` | `VARCHAR(100)` | **Có** | Email duy nhất, định dạng hợp lệ. |
| `name` | `name` | `VARCHAR(100)` | **Có** | Họ và tên người dùng. |
| `role` | `role` | `VARCHAR(50)` | **Có** | Một trong các vai trò: `HEAD_AUDITOR`, `TEAM_LEAD`, `ADMIN`. |
| `is_active` | `is_active` | `BOOLEAN` | Không | Mặc định `true`. |

---

### 2.3. Chuyên viên Kiểm toán (Auditor Profiles)
- **Tệp mẫu**: `data/templates/03_auditors_template.csv`
- **Bảng đích**: `app_users`, `auditor_profiles`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `auditor_code` | `auditor_code` | `VARCHAR(50)` | **Có** | Mã duy nhất: `AUD-01`, `AUD-02`,... |
| `name` | `name` | `VARCHAR(100)` | **Có** | Họ tên chuyên viên kiểm toán. |
| `email` | `email` | `VARCHAR(100)` | **Có** | Email định danh. Role tự động là `AUDITOR`. |
| `max_daily_capacity` | `max_daily_capacity` | `INT` | Không | Công suất tối đa/ngày (mặc định: 80). |
| `is_active` | `is_active` | `BOOLEAN` | Không | Mặc định `true`. |

---

### 2.4. Nhân viên Kinh doanh (Sale Profiles)
- **Tệp mẫu**: `data/templates/04_sales_template.csv`
- **Bảng đích**: `app_users`, `sales_profiles`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `sale_code` | `sale_code` | `VARCHAR(50)` | **Có** | Mã duy nhất: `SALE-01`, `SALE-02`,... |
| `name` | `name` | `VARCHAR(100)` | **Có** | Họ và tên nhân viên kinh doanh. |
| `email` | `email` | `VARCHAR(100)` | **Có** | Email định danh. Role tự động là `SALE`. |
| `team_code` | `team_id` | `VARCHAR(50)` | **Có** | **BẮT BUỘC**: Mã team phải tồn tại trong bảng `teams`. |
| `phone` | `phone` | `VARCHAR(50)` | Không | Số điện thoại liên hệ. |
| `is_active` | `is_active` | `BOOLEAN` | Không | Mặc định `true`. |

---

### 2.5. Phân công Auditor Phụ trách Sale (Auditor Assignments)
- **Tệp mẫu**: `data/templates/05_auditor_assignments_template.csv`
- **Bảng đích**: `auditor_assignments`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `sale_code` | `sale_id` | `VARCHAR(50)` | **Có** | Phải tồn tại trong danh mục Sale. |
| `auditor_code` | `auditor_id`| `VARCHAR(50)` | **Có** | Phải tồn tại trong danh mục Auditor. |
| `effective_from` | `effective_from` | `DATE` | **Có** | Định dạng `YYYY-MM-DD`. |
| `effective_to` | `effective_to` | `DATE` | Không | Để trống nếu phân công mở (active). |
| `assignment_reason` | `assignment_reason` | `TEXT` | **Có** | Lý do phân công (Audit trail). |

---

### 2.6. Danh mục Lỗi (Issue Catalog)
- **Tệp mẫu**: `data/templates/06_issue_catalog_template.csv`
- **Bảng đích**: `issue_definitions`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `issue_code` | `issue_code` | `VARCHAR(50)` | **Có** | Mã duy nhất: `ISSUE-01`, `ISSUE-02`,... |
| `issue_name` | `issue_name` | `VARCHAR(255)` | **Có** | Tên hành vi lỗi hoặc sai phạm quy trình. |
| `issue_group_code` | `issue_group_code` | `VARCHAR(50)` | **Có** | Mã nhóm lỗi (`GRP-SLA`, `GRP-DATA`,...). |
| `issue_group_name` | `issue_group_name` | `VARCHAR(100)` | **Có** | Tên hiển thị nhóm lỗi. |
| `severity` | `severity` | `VARCHAR(20)` | **Có** | Mức độ nghiêm trọng: `LOW`, `MEDIUM`, `HIGH`. |
| `hard_fail` | `hard_fail` | `BOOLEAN` | **Có** | `true` nếu lỗi lập tức fail case và tạo Action. |
| `recheck_guidance_template` | `recheck_guidance_template` | `TEXT` | Không | Hướng dẫn thẩm định khắc phục. |
| `is_definition_complete` | `is_definition_complete` | `BOOLEAN` | **Có** | **RÀNG BUỘC**: Phải `true` (đã duyệt) mới được dùng trong chấm tự động. |
| `version` | `version` | `VARCHAR(50)` | **Có** | Phiên bản quy chế (VD: `v1.4`). |

---

### 2.7. Cấu hình Quy tắc SLA (SLA Configuration)
- **Tệp mẫu**: `data/templates/07_sla_rules_template.csv`
- **Bảng đích**: `sla_configurations`

| Cột File | Cột DB Neon | Kiểu dữ liệu | Bắt buộc | Ghi chú & Quy tắc |
| :--- | :--- | :--- | :---: | :--- |
| `target_type` | `target_type` | `VARCHAR(20)` | **Có** | `ISSUE` (áp dụng theo mã lỗi) hoặc `GROUP` (theo nhóm). |
| `target_code` | `target_code` | `VARCHAR(50)` | **Có** | Mã lỗi hoặc mã nhóm tương ứng. |
| `target_name` | `target_name` | `VARCHAR(255)` | Không | Mô tả cấu hình SLA. |
| `action_due_hours` | `action_due_hours` | `INT` | **Có** | Số giờ hạn chót Sale phải khắc phục (mặc định 48h). |
| `recheck_due_hours`| `recheck_due_hours`| `INT` | **Có** | Số giờ hạn chót Auditor phải recheck (mặc định 24h). |
| `max_rechecks` | `max_rechecks` | `INT` | **Có** | Số vòng recheck tối đa trước khi escalate (mặc định 3). |
| `rule_version` | `rule_version` | `VARCHAR(50)` | **Có** | Phiên bản quy tắc (VD: `v1.4`). |
| `is_active` | `is_active` | `BOOLEAN` | Không | Mặc định `true`. |

---

### 2.8. Nguồn Vận hành (Operational Data - Mẫu 30–60 ngày gần nhất)
- **Khách hàng (`customers`)**: `data/templates/08_operational_customers_sample.csv`
- **Báo giá (`quotations`)**: `data/templates/09_operational_quotations_sample.csv`
- **Đơn hàng (`sales_orders`)**: `data/templates/10_operational_sales_orders_sample.csv`
- **Lịch sử thay đổi Team (`sale_team_history`)**: `data/templates/11_sale_team_history_template.csv`

> [!NOTE]
> Theo thỏa thuận Phase 1.5, toàn bộ dữ liệu nguồn khách hàng thật sẽ chỉ được import sau khi Head Auditor xác nhận mapping chính thức các cột từ hệ thống CRM/ERP. Hiện tại hệ thống cung cấp sẵn dữ liệu mẫu thực tế trong khung 30-60 ngày gần nhất để phục vụ kiểm thử và tinh chỉnh luồng tự động.
