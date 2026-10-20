# AuditPulse — See risk early. Recover revenue.

> **Hệ thống Audit Vận hành Sale B2B SaaS**  
> Tuân thủ 100% **AuditFlow Operating Specification v1.1** (Múi giờ chuẩn: `Asia/Ho_Chi_Minh`).

---

## 1. Giới thiệu tổng quan

**AuditPulse** là giải pháp audit vận hành dành riêng cho khối kinh doanh B2B/SaaS, giúp phát hiện sớm các rủi ro bỏ sót khách hàng, giao việc sửa lỗi minh bạch, kiểm tra lại (recheck) đa tầng và đo lường tác động trực tiếp tới tỷ lệ cứu đơn và doanh thu phục hồi.

### Điểm nổi bật:
- **Giao diện B2B SaaS hiện đại & sắc nét**: Tối ưu tốc độ thao tác cho auditor (high-velocity audit), hỗ trợ Dark/Light mode tinh tế.
- **Phân quyền vai trò thực tế (RBAC)**:
  - 👑 **Head Auditor**: Quản trị queue, duyệt mức độ catalog lỗi, điều phối 3 Auditor, phê duyệt miễn trừ (waive), giám sát toàn bộ KPI.
  - 🔍 **3 Auditor cố định (Linh Nguyễn, Huy Trần, Trang Đỗ)**: Chấm case, bắt lỗi, giao action cho sale, recheck và là **người DUY NHẤT** có quyền đóng/mở lại action.
  - 💼 **Sale (Nam Vũ, Hương Lê)**: Chỉ xem case của mình; khu vực rõ ràng để tick *"Tôi đã thực hiện"*, ghi chú ngắn và đính kèm bằng chứng. Sale **không thể tự đóng** action hay tự chấm recheck.
  - 👥 **Team Lead (Phong Lê)**: Giám sát KPI team, action quá hạn; không xem evidence/hội thoại nhạy cảm theo quy chuẩn bảo mật.
- **Demo Role Switcher Bar**: Thanh chuyển đổi role tức thì ở đầu trang giúp kiểm thử trải nghiệm và phân quyền ngay lập tức.
- **Tuân thủ chặt chẽ 100% Operating Spec v1.1**:
  - Gộp 1 khách / 1 dòng queue trong ngày với nhiều risk tag: `YESTERDAY_CUSTOMERS`, `NO_QUOTATION`, `QUOTED_NOT_ORDERED`.
  - Trạng thái `Đang theo dõi` khi action cũ còn mở (chống tạo action trùng lặp).
  - Trạng thái Action chuẩn: `OPEN`, `SALE_MARKED_DONE`, `IN_RECHECK`, `VERIFIED_CLOSED`, `REOPENED`, dẫn xuất `OVERDUE`, `WAIVED`.
  - Quản lý phân công Auditor bằng ngày hiệu lực (`effective_from`, `effective_to`), cảnh báo sale đổi team.
  - Đo lường 2 lớp: **Chất lượng thực thi** (SLA, QA, backlog) vs **Tác động kinh doanh** (Đơn cứu được gán nhãn `AUDIT_ASSISTED`, tỷ lệ cải thiện sale cohort).

---

## 2. Hướng dẫn cài đặt và chạy ứng dụng

### Yêu cầu môi trường:
- Node.js >= 18.x (khuyến nghị 20.x hoặc 24.x)
- npm >= 9.x

### Các bước khởi chạy:
```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi chạy dev server (Vite)
npm run dev

# 3. Mở trình duyệt tại:
http://localhost:5173
```

### Build bản Production:
```bash
npm run build
npm run preview
```

---

## 3. Cấu trúc thư mục mã nguồn

```
d:\Webapp Audit/
├── index.html                   # HTML entry point với favicon & font Inter
├── package.json                 # Cấu hình dự án & scripts
├── vite.config.ts               # Vite configuration
├── postcss.config.js            # PostCSS cho Tailwind CSS v4
├── tsconfig.json                # TypeScript root configuration
├── tsconfig.app.json            # TypeScript bundler compiler options
├── README.md                    # Tài liệu dự án & UAT
├── src/
│   ├── main.tsx                 # React DOM mount point
│   ├── App.tsx                  # App shell, Navbar, Sidebar & tab router
│   ├── index.css                # Tailwind directives & CSS custom styles
│   ├── types/
│   │   └── index.ts             # Domain models chuẩn spec (Queue, Case, Issue, Action, Recheck, Assignment, v.v.)
│   ├── services/
│   │   ├── mockData.ts          # Dataset phong phú, sát thực tế B2B Việt Nam
│   │   └── auditStore.tsx       # Reactive state store & business logic methods
│   └── components/
│       ├── common/
│       │   ├── Badge.tsx            # Badge màu chuẩn (Status, Severity, RiskTag, Attribution)
│       │   ├── EvidencePreview.tsx  # Lightbox xem ảnh/file bằng chứng & tải lên
│       │   ├── TimelineTrail.tsx    # Lịch sử thay đổi audit trail bất biến
│       │   ├── Modal.tsx            # Accessible modal dialog
│       │   ├── EmptyState.tsx       # Trạng thái empty, no-filter, source-delayed, permission-denied
│       │   └── Skeleton.tsx         # Skeleton loading effect
│       ├── layout/
│       │   ├── RoleSwitcherBar.tsx  # Thanh demo đổi vai trò trên đầu trang
│       │   ├── Navbar.tsx           # Brand header, sync indicator, dark/light toggle
│       │   └── Sidebar.tsx          # Thanh điều hướng phân hệ kèm badge đếm số lượng
│       └── views/
│           ├── DashboardView.tsx        # Màn hình Tổng quan Rủi ro & Cứu đơn
│           ├── AuditQueueView.tsx       # Bảng Audit Queue đa tag, bộ lọc sâu, gán auditor
│           ├── AuditCaseDetailModal.tsx # Chấm case, checklist catalog lỗi, lịch sử báo giá
│           ├── SaleActionDetailView.tsx # Dual pane: Sale khắc phục vs Auditor Recheck
│           ├── RecheckTodayView.tsx     # Hàng chờ Recheck ưu tiên quá hạn & rủi ro cao
│           ├── AuditorPortfolioView.tsx # Phân công 3 auditor, ngày hiệu lực & cảnh báo sale đổi team
│           ├── AuditorPerformanceView.tsx # Đo lường 2 lớp: SLA, QA, Đơn cứu được, Tăng trưởng sale
│           ├── ReportsView.tsx          # Báo cáo drill-down KPI Dictionary chuẩn hóa
│           └── SettingsView.tsx         # Issue Catalog (duyệt mức độ), SLA & đồng bộ dữ liệu
```

---

## 4. Các màn hình và tính năng đã hoàn thiện

| Màn hình | Mục đích & Điểm nổi bật |
|---|---|
| **Demo Role Switcher** | Đổi vai trò ngay lập tức giữa Head Auditor, 3 Auditor (Linh/Huy/Trang), 2 Sale (Nam/Hương) và Team Lead (Phong) để kiểm thử phân quyền RBAC. |
| **Tổng quan (Dashboard)** | Thẻ KPI rủi ro ngày D, action quá hạn, tỷ lệ hoàn tất, tổng giá trị đơn cứu được, phân bổ 3 rule rủi ro và audit trail realtime. |
| **Audit Queue** | Bảng dữ liệu 1 khách / dòng, nhiều risk tag, badge "Đang theo dõi", lọc đa tiêu chí (ngày/team/sale/auditor/tag/status), nút chuyển giao auditor có cờ `shared_work`. |
| **Audit Case Detail** | Xem lý do vào queue, dữ liệu báo giá ERP mới nhất vs cũ hơn, checklist catalog lỗi v1.4, đính kèm bằng chứng sai phạm và tự động sinh Corrective Action khi fail. |
| **Sale Action Detail** | **Phân tách 2 phân vùng nghiệp vụ**: Phân vùng 1 dành cho Sale (checkbox *"Tôi đã thực hiện"*, ghi chú, đính kèm bằng chứng) → `SALE_MARKED_DONE`; Phân vùng 2 dành cho Auditor (đánh giá `IMPROVED` → đóng action `VERIFIED_CLOSED`, hoặc `NOT_IMPROVED` → mở lại `REOPENED` kèm hạn mới). Hỗ trợ nút Miễn trừ (`WAIVED`) cho Head Auditor. |
| **Recheck Hôm nay** | Hàng chờ ưu tiên các action quá hạn và lỗi nghiêm trọng (`HIGH`), đếm số việc khẩn cấp cần auditor nghiệm thu trong ngày. |
| **Auditor Portfolio** | Quản lý tải của 3 Auditor cố định, danh sách sale gán kèm ngày hiệu lực (`effective_from`/`to`), cảnh báo sale chuyển team nhưng chưa đổi auditor. |
| **Hiệu suất Auditor** | Đánh giá 2 lớp: Lớp thực thi (Sản lượng, SLA %, Median handling time, Tỷ lệ đồng thuận QA) và Lớp kết quả (Đơn cứu được, Tỷ lệ cứu đơn %, Tăng trưởng năng lực sale cohort). Không xếp hạng bằng số lỗi tìm được. |
| **Báo cáo & KPI** | Drill-down theo team/sale, phân tách rõ KPI chất lượng thực thi và KPI outcome, hiển thị mẫu số thực tế tránh hiểu lầm. |
| **Catalog & Cấu hình** | Quản lý catalog lỗi, nút Head Auditor duyệt chuẩn hóa định nghĩa lỗi (`isDefinitionComplete`), trạng thái đồng bộ 4 nguồn (CRM, ERP, POS, HR) và nút đồng bộ thủ công. |

---

## 5. Các Ràng buộc Nghiệp vụ Cốt lõi Đã Chuẩn hóa (Business Workflow Invariants)

Hệ thống tuân thủ nghiêm ngặt các bất biến nghiệp vụ quy định trong **AuditFlow Operating Specification v1.1**:

1. **Lưu trữ Audit Case Bất biến (Immutable Audit Case & Issues Snapshot)**:
   - Khi hoàn tất chấm điểm queue, hệ thống tạo một thực thể `AuditCase` bất biến kèm theo snapshot ngữ cảnh tại thời điểm chấm: `snapshotCustomerId`, `snapshotCustomerName`, `snapshotSaleId`, `snapshotTeamId`, `snapshotAuditorId`, `ruleVersion`.
   - Danh sách vi phạm được lưu thành các bản ghi `AuditIssue` riêng biệt với đầy đủ mã lỗi, tên lỗi, mức độ nghiêm trọng (`severity`), cờ `hardFail`, ghi chú và bằng chứng.
   - Các `CorrectiveAction` sinh ra tham chiếu chính xác đến `caseId` và `issueId` tương ứng.

2. **Chống Tạo Action Trùng Lặp (Anti-duplicate Action Guarantee)**:
   - Trước khi tạo action mới, hệ thống tự động kiểm tra cặp `customerId + issueCode`.
   - Nếu đã tồn tại action ở một trong các trạng thái đang mở (`OPEN`, `SALE_MARKED_DONE`, `IN_RECHECK`, `REOPENED`), hệ thống chặn tạo action trùng lặp, tự động liên kết queue item với action cũ qua `activeActionId` và hiển thị trạng thái `Đang theo dõi`.

3. **Siết Chặt Chu Trình Chuyển Trạng Thái Action (Action State Transitions Gate)**:
   - Toàn bộ validation được kiểm soát chặt chẽ tại `workflowRules.ts` và `auditStore.tsx`:
     - `saleMarkActionDone`: **CHỈ cho phép** khi action ở `OPEN` hoặc `REOPENED`. Từ chối mọi can thiệp khi action ở `SALE_MARKED_DONE`, `IN_RECHECK`, `VERIFIED_CLOSED`, `WAIVED` hoặc `CANCELLED`.
     - `auditorStartRecheck`: **CHỈ cho phép** khi action đang ở trạng thái `SALE_MARKED_DONE`.
     - `auditorSubmitRecheck`: **CHỈ cho phép** khi action đang ở `IN_RECHECK`.
       - Kết luận `IMPROVED` **CHỈ chuyển sang** `VERIFIED_CLOSED`.
       - Kết luận `NOT_IMPROVED` **CHỈ chuyển sang** `REOPENED`, bắt buộc phải có `nextDueDate` hợp lệ và lịch recheck tiếp theo.
     - Mọi transition bị từ chối đều trả về thông báo lỗi rõ ràng, **tuyệt đối không thay đổi dữ liệu** và **không ghi log audit trail**.
     - UI vô hiệu hóa và ẩn các nút thao tác không hợp lệ tương ứng với từng trạng thái.

4. **Kiểm Tra & Ngăn Chặn Overlap Phân Công Auditor (Auditor Assignment Interval Overlap Guarantees)**:
   - Một sale **không thể có 2 assignment hiệu lực trong cùng bất kỳ ngày nào**.
   - Kiểm tra overlap theo toàn bộ khoảng ngày `[effective_from, effective_to]` (với `effective_to = null` biểu thị vô hạn thời gian / open-ended).
   - Khi tạo phân công mở mới (`effectiveTo = null`):
     - Hệ thống tự động đóng phân công mở liền trước tại ngày trước ngày bắt đầu mới: `previous.effectiveTo = dayBefore(newEffectiveFrom)`.
     - **Không bao giờ để 2 phân công tương lai cùng mở**.
     - Ngăn chặn triệt để xung đột: Báo lỗi nếu trùng ngày bắt đầu hoặc rơi vào khoảng thời gian đã chốt lịch của phân công khác.
     - Phân công tương lai **không làm thay đổi người phụ trách ở queue đã snapshot**.

5. **Đo lường KPI "Đơn Cứu Được" Chuẩn Xác (Data-grounded Rescued Orders Attribution)**:
   - Loại bỏ hoàn toàn việc tăng giá trị doanh thu cứu được bằng số hard-code khi auditor duyệt đóng action.
   - Ghi nhận `AUDIT_ASSISTED` chỉ khi phát hiện bản ghi `SalesOrder` hợp lệ (`VALID`, không bị hủy/hoàn), phát sinh sau thời điểm tạo action (`actionCreatedAt`) và nằm trong attribution window (30 ngày).
   - Khử trùng lặp: Mỗi khách hàng / nhóm action chỉ được tính đơn cứu một lần trong chu kỳ.
   - Chỉ số hiệu suất auditor được tính toán động (dynamically derived) trực tiếp từ danh sách đơn hàng thực tế thỏa mãn điều kiện.

6. **Siết Chặt Phân Quyền Tại Tầng Nghiệp Vụ (Strict RBAC in Store/Service Layer)**:
   - Validation quyền hạn được đóng gói hoàn toàn tại store layer (`auditStore.tsx`), UI chỉ đóng vai trò hiển thị:
     - `saleMarkActionDone`: Chỉ Sale sở hữu action mới có quyền thực hiện.
     - `auditorStartRecheck` và `auditorSubmitRecheck`: Chỉ Auditor được phân công phụ trách action mới có quyền thao tác.
     - `createAuditCaseForQueue`: Chỉ Auditor phụ trách queue item hoặc Head Auditor mới có quyền chấm case.
     - `reassignQueueItem`, `createAuditorAssignment`, `headAuditorWaiveAction`, `triggerManualSync`: Giới hạn độc quyền cho Head Auditor / Admin.

---

## 6. Kiến trúc Neon PostgreSQL & API Server (Phase 1 Ready)

Hệ thống đã hoàn tất thiết lập nền tảng cơ sở dữ liệu **Neon PostgreSQL** và tầng **API Server Node.js/TypeScript**, bảo đảm phân tách hoàn toàn giữa Client và Database:
- **Frontend Vite/React**: Giữ nguyên trạng thái mock UI phục vụ trình diễn; không kết nối trực tiếp đến Neon.
- **Server API**: Sử dụng `express` và `pg` (Pool), truy vấn **100% Parameterized Queries** (`$1, $2, ...`), tuyệt đối không nối chuỗi SQL từ input.
- **Biến môi trường**: Kết nối bảo mật thông qua `DATABASE_URL` trong file `.env` (được bảo vệ bởi `.gitignore`, có template mẫu tại `.env.example`).

### A. Cấu trúc Schema 6 Nhóm Bảng trên Neon:
1. **Identity & Organization**:
   - `teams`: Danh mục phòng ban kinh doanh B2B.
   - `app_users`: Người dùng định danh với role chuẩn: `HEAD_AUDITOR`, `AUDITOR`, `SALE`, `TEAM_LEAD`, `ADMIN`.
   - `sales_profiles` & `auditor_profiles`: Thông tin chuyên môn, quota, KPI đồng thuận QA.
2. **Source Data (CRM, ERP, POS)**:
   - `customers`: Hồ sơ khách hàng, kênh tiếp cận, sale phụ trách.
   - `quotations`: Báo giá gửi khách, tổng tiền, trạng thái (`PENDING`, `ACCEPTED`, `EXPIRED`, `REJECTED`).
   - `sales_orders`: Đơn hàng chốt (`VALID`, `DRAFT`, `CANCELLED`, `REFUNDED`).
3. **Audit Core**:
   - `issue_definitions`: Catalog định nghĩa lỗi, nhóm lỗi, severity, hard fail, rule version.
   - `audit_queue_runs` & `audit_queue_items`: Hàng chờ audit hằng ngày, snapshot thông tin bất biến, cờ `shared_work`. Ràng buộc `UNIQUE(audit_date, customer_id)` đảm bảo 1 khách chỉ có 1 dòng queue/ngày.
   - `audit_cases`: Hồ sơ chấm audit hoàn tất, lưu snapshot người chấm, sale, team, rule version.
   - `audit_issues`: Danh sách lỗi vi phạm kèm bằng chứng và ghi chú.
4. **Workflow & Khắc phục**:
   - `corrective_actions`: Giao việc sửa lỗi, SLA deadline, tiêu chuẩn nghiệm thu. **Ràng buộc chống trùng lặp cấp cơ sở dữ liệu**: Partial Unique Index `idx_prevent_duplicate_active_action` trên `(customer_id, issue_code)` với trạng thái `OPEN`, `SALE_MARKED_DONE`, `IN_RECHECK`, `REOPENED`.
   - `rechecks`: Lịch sử các lần auditor kiểm tra lại, kết luận `IMPROVED` / `NOT_IMPROVED`.
   - `evidences`: Chỉ lưu metadata và URL file/ảnh, không lưu binary blob trong database.
5. **Operations**:
   - `auditor_assignments`: Lịch sử phân công auditor theo ngày hiệu lực. **Ràng buộc toán học chống overlap cấp cơ sở dữ liệu**: PostgreSQL Extension `btree_gist` Exclusion Constraint `exclude_overlapping_auditor_assignments` chặn mọi khoảng ngày giao nhau trên cùng một sale.
   - `audit_trail_events`: Nhật ký audit trail hệ thống bất biến.
   - `source_sync_logs`: Lịch sử đồng bộ 4 nguồn dữ liệu.
6. **Reporting**:
   - `rescued_orders`: Bảng lưu vết đơn hàng phục hồi.
   - `v_rescued_orders_attribution`: SQL View tự động tính toán động đơn cứu được có gắn nhãn `AUDIT_ASSISTED` / `SALE_SELF_RESOLVED` trong attribution window 30 ngày.

### B. Hướng dẫn Lệnh Quản trị Database & Backend:

```bash
# 1. Thiết lập biến môi trường (copy từ .env.example)
cp .env.example .env
# Chỉnh sửa DATABASE_URL thành chuỗi kết nối Neon của bạn

# 2. Chạy Migration tạo schema trên Neon PostgreSQL
npm run db:migrate

# 3. Nạp dữ liệu mẫu (Seeding) từ bộ mock data chuẩn spec
npm run db:seed

# 4. Rollback migration gần nhất (khi cần hoàn tác)
npm run db:rollback

# 5. Khởi động API Server Node.js/TypeScript độc lập
npm run server
# API lắng nghe tại http://localhost:3001

# 6. Chạy toàn bộ Test Suite (11 unit & integration tests)
npm test
```

---

## 7. CI/CD & Quality Gate

Dự án tích hợp GitHub Actions workflow tại `.github/workflows/ci.yml`:
- Tự động chạy kiểm tra trên mỗi lần `push` và `pull_request` vào nhánh `main`.
- Thực thi kiểm tra chất lượng code nghiêm ngặt:
  - `npm run lint` (Oxlint / ESLint validation - 0 warnings, 0 errors)
  - `npm test` (Bộ automated unit tests kiểm tra toàn bộ state transitions & overlap intervals)
  - `npm run build` (TypeScript type checking và đóng gói production bundle Vite)

---

## 8. Hướng dẫn kịch bản Demo & Kiểm thử (UAT)

1. **Kịch bản Khách hàng đa tag & Báo giá chưa chốt**:
   - Vào menu **Audit Queue**, thấy dòng đầu tiên *"Công ty CP Kỹ thuật Hoàng Phát"* có 2 tag: `Khách hôm qua` và `Chưa báo giá 2 ngày`.
   - Dòng *"Tập đoàn Xây dựng An Phong"* có tag `Báo giá chưa chốt 7 ngày` và badge `Đang theo dõi` (do đã có action mở trước đó).
2. **Kịch bản Chấm Case & Sinh Action**:
   - Bấm nút **Chấm Case** tại 1 dòng queue. Modal hiển thị lịch sử báo giá. Chọn 1 hoặc nhiều lỗi từ Checklist Catalog → Bấm *"Giao Action Khắc Phục (FAIL)"*.
   - Hệ thống tự động chuyển trạng thái queue sang `COMPLETED_FAIL` và tạo Corrective Action mới giao cho Sale.
3. **Kịch bản Chu Trình State Transition Nghiêm Ngặt của Corrective Action**:
   - Chọn vai trò **Sale Nam Vũ**:
     - Tại action `OPEN` hoặc `REOPENED`, tick *"Tôi đã thực hiện khắc phục"*, nhập ghi chú và tải ảnh bằng chứng → Bấm gửi. Trạng thái chuyển thành `SALE_MARKED_DONE`.
     - Ngay sau khi chuyển thành `SALE_MARKED_DONE`, biểu mẫu gửi bị ẩn/khóa, hiển thị ghi chú đã nộp và thông báo chờ Auditor recheck. Sale không thể sửa đổi tiếp.
   - Chọn vai trò **Auditor Linh Nguyễn**:
     - Vào action ở `SALE_MARKED_DONE`: Khu vực đánh giá kết quả được khóa, hiển thị nút *"Bắt đầu Recheck"*.
     - Bấm *"Bắt đầu Recheck"*: Trạng thái chuyển sang `IN_RECHECK` và mở biểu mẫu đánh giá.
     - Thử chọn `NOT_IMPROVED`: Bắt buộc phải có ngày hạn mới (`nextDueDate`) → Bấm gửi → Action chuyển sang `REOPENED`.
     - Thử chọn `IMPROVED`: Bấm gửi → Action chính thức ĐÓNG (`VERIFIED_CLOSED`).
4. **Kịch bản Phân Công Auditor Liên Hoàn Không Trùng Lặp (A → B → C)**:
   - Vào menu **Auditor Portfolio**, kiểm tra Sale **Lê Thu Hương (SALE-02)**:
     - **Assignment A**: `Nguyễn Thùy Linh` từ `2026-08-01` đến `2026-10-26` (Đang hiệu lực hôm nay 20/10/2026).
     - **Assignment B**: `Trần Quang Huy` từ `2026-10-27` đến `2026-11-02` (Sắp hiệu lực tuần sau).
     - **Assignment C**: `Đỗ Thu Trang` từ `2026-11-03` trở đi (Sắp hiệu lực hai tuần sau, `effectiveTo = null`).
     - Hoàn toàn **không có bất kỳ ngày nào bị overlap** giữa A, B và C.
     - Hàng chờ audit quá khứ và hôm nay vẫn giữ nguyên snapshot phụ trách ban đầu của Linh Nguyễn.
   - Thử tạo phân công trùng ngày hoặc chèn vào khoảng ngày đã có: Hệ thống lập tức chặn thao tác và hiển thị thông báo lỗi rõ ràng.

1. **Kịch bản Khách hàng đa tag & Báo giá chưa chốt**:
   - Vào menu **Audit Queue**, thấy dòng đầu tiên *"Công ty CP Kỹ thuật Hoàng Phát"* có 2 tag: `Khách hôm qua` và `Chưa báo giá 2 ngày`.
   - Dòng *"Tập đoàn Xây dựng An Phong"* có tag `Báo giá chưa chốt 7 ngày` và badge `Đang theo dõi` (do đã có action mở trước đó).
2. **Kịch bản Chấm Case & Sinh Action**:
   - Bấm nút **Chấm Case** tại 1 dòng queue. Modal hiển thị lịch sử báo giá. Chọn 1 hoặc nhiều lỗi từ Checklist Catalog → Bấm *"Giao Action Khắc Phục (FAIL)"*.
   - Hệ thống tự động chuyển trạng thái queue sang `COMPLETED_FAIL` và tạo Corrective Action mới giao cho Sale.
3. **Kịch bản Sale khắc phục**:
   - Ở thanh Demo Role Switcher, bấm chọn **Sale Nam Vũ**.
   - Vào **Sale Action**: Chỉ thấy các action của Nam Vũ.
   - Tại action `OPEN` hoặc `REOPENED`, tick vào ô *"Tôi đã thực hiện khắc phục"*, nhập ghi chú và tải ảnh bằng chứng → Bấm gửi.
   - Trạng thái chuyển thành `SALE_MARKED_DONE`. Lưu ý nút đóng action hoàn toàn bị vô hiệu hóa đối với Sale.
4. **Kịch bản Auditor Recheck**:
   - Ở thanh Demo Role Switcher, chuyển sang **Auditor Linh Nguyễn**.
   - Vào **Recheck Hôm nay** hoặc **Sale Action**, thấy action đang ở `SALE_MARKED_DONE`.
   - Bấm *"Bắt đầu Recheck"* (`IN_RECHECK`).
   - Lựa chọn `IMPROVED` → Action chính thức đóng `VERIFIED_CLOSED`. Hoặc chọn `NOT_IMPROVED` → Bắt buộc chọn ngày gia hạn mới → Action chuyển sang `REOPENED`.
5. **Kịch bản Sale đổi team & Phân công Auditor**:
   - Vào **Auditor Portfolio**: Thấy thông báo cảnh báo sale *Đào Thị Mai* chuyển sang Team Key Account.
   - Bấm *"Tạo Phân công Mới"*: Chọn ngày hiệu lực từ ngày mai. Hệ thống tự động đóng phân công cũ và cập nhật sang Auditor mới, lưu audit trail.
