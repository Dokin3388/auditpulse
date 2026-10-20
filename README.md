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

Hệ thống tuân thủ nghiêm ngặt 5 bất biến nghiệp vụ quy định trong **AuditFlow Operating Specification v1.1**:

1. **Lưu trữ Audit Case Bất biến (Immutable Audit Case & Issues Snapshot)**:
   - Khi hoàn tất chấm điểm queue, hệ thống tạo một thực thể `AuditCase` bất biến kèm theo snapshot ngữ cảnh tại thời điểm chấm: `snapshotCustomerId`, `snapshotCustomerName`, `snapshotSaleId`, `snapshotTeamId`, `snapshotAuditorId`, `ruleVersion`.
   - Danh sách vi phạm được lưu thành các bản ghi `AuditIssue` riêng biệt với đầy đủ mã lỗi, tên lỗi, mức độ nghiêm trọng (`severity`), cờ `hardFail`, ghi chú và bằng chứng.
   - Các `CorrectiveAction` sinh ra tham chiếu chính xác đến `caseId` và `issueId` tương ứng.

2. **Chống Tạo Action Trùng Lặp (Anti-duplicate Action Guarantee)**:
   - Trước khi tạo action mới, hệ thống tự động kiểm tra cặp `customerId + issueCode`.
   - Nếu đã tồn tại action ở một trong các trạng thái đang mở (`OPEN`, `SALE_MARKED_DONE`, `IN_RECHECK`, `REOPENED`), hệ thống chặn tạo action trùng lặp, tự động liên kết queue item với action cũ qua `activeActionId` và hiển thị trạng thái `Đang theo dõi`.

3. **Phân công Auditor Theo Ngày Hiệu Lực (Effective-date Assignment Resolution)**:
   - Không đóng assignment hiện tại nếu phân công mới có ngày hiệu lực ở tương lai (`effectiveFrom > today`).
   - Assignment hợp lệ được phân giải chính xác theo ngày chạy queue: `effective_from <= audit_date` và (`effective_to` rỗng hoặc `>= audit_date`).
   - Chặn overlap: Một sale chỉ có duy nhất một auditor hiệu lực trong cùng một ngày.
   - Queue đã tạo giữ nguyên `assignedAuditorId` dạng snapshot lịch sử, không bị ghi đè khi có phân công mới.

4. **Đo lường KPI "Đơn Cứu Được" Chuẩn Xác (Data-grounded Rescued Orders Attribution)**:
   - Loại bỏ hoàn toàn việc tăng giá trị doanh thu cứu được bằng số hard-code khi auditor duyệt đóng action.
   - Ghi nhận `AUDIT_ASSISTED` chỉ khi phát hiện bản ghi `SalesOrder` hợp lệ (`VALID`, không bị hủy/hoàn), phát sinh sau thời điểm tạo action (`actionCreatedAt`) và nằm trong attribution window (30 ngày).
   - Khử trùng lặp: Mỗi khách hàng / nhóm action chỉ được tính đơn cứu một lần trong chu kỳ.
   - Chỉ số hiệu suất auditor được tính toán động (dynamically derived) trực tiếp từ danh sách đơn hàng thực tế thỏa mãn điều kiện.

5. **Siết Chặt Phân Quyền Tại Tầng Nghiệp Vụ (Strict RBAC in Store/Service Layer)**:
   - Validation quyền hạn được đóng gói hoàn toàn tại store layer (`auditStore.tsx`), UI chỉ đóng vai trò hiển thị:
     - `saleMarkActionDone`: Chỉ Sale sở hữu action mới có quyền thực hiện.
     - `auditorStartRecheck` và `auditorSubmitRecheck`: Chỉ Auditor được phân công phụ trách action mới có quyền thao tác.
     - `createAuditCaseForQueue`: Chỉ Auditor phụ trách queue item hoặc Head Auditor mới có quyền chấm case.
     - `reassignQueueItem`, `createAuditorAssignment`, `headAuditorWaiveAction`, `triggerManualSync`: Giới hạn độc quyền cho Head Auditor / Admin.

---

## 6. Danh sách các phần đang Mock & Hướng dẫn đấu nối API / Supabase

### A. Giới hạn của bản Mock hiện tại:
- **In-Memory Reactive State**: Dữ liệu được lưu trong React state và bộ nhớ client; khi reload trang (F5), dữ liệu sẽ khởi tạo lại từ `mockData.ts`.
- **Upload bằng chứng (Evidence Upload)**: Tạo object URL và snapshot metadata giả lập; chưa lưu file nhị phân lên bucket thực tế.
- **Giả lập đồng bộ (Source Sync)**: Nút đồng bộ thủ công chạy timer 1.5s và cập nhật timestamp `lastSyncAt`.

### B. Các bước chuyển đổi sang Supabase / Real REST API:
1. **Thiết lập Database Tables**:
   - Sử dụng các interface TypeScript trong `src/types/index.ts` để tạo schema PostgreSQL trên Supabase:
     ```sql
     create table audit_cases (...);
     create table audit_issues (...);
     create table corrective_actions (...);
     create table auditor_assignments (...);
     create table sales_orders (...);
     ```
2. **Thay thế Store Layer bằng Supabase Client / React Query**:
   - Trong `src/services/auditStore.tsx`, thay thế các hàm `setQueueItems`, `setAuditCases`, `setActions` bằng các lời gọi:
     - `const { data } = await supabase.from('audit_cases').insert(...)`
     - Kích hoạt Row-Level Security (RLS) trên Supabase tương đương với các hàm kiểm tra quyền trong `auditStore.tsx`:
       - Policy cho Sale: `auth.uid() = sale_id`
       - Policy cho Auditor: `auth.uid() = auditor_id`
3. **Lưu trữ Bằng chứng qua Supabase Storage**:
   - Tích hợp `supabase.storage.from('evidence').upload(...)` bên trong `EvidencePreview.tsx` để lấy URL file thật.
4. **Thay thế Demo Role Switcher bằng Supabase Auth**:
   - Gắn `supabase.auth.signInWithPassword()` hoặc SSO, lấy JWT token để định danh vai trò người dùng thay cho thanh demo.

---

## 7. CI/CD & Quality Gate

Dự án tích hợp GitHub Actions workflow tại `.github/workflows/ci.yml`:
- Tự động chạy kiểm tra trên mỗi lần `push` và `pull_request` vào nhánh `main`.
- Thực thi kiểm tra chất lượng code nghiêm ngặt:
  - `npm run lint` (Oxlint / ESLint validation)
  - `npm run build` (TypeScript type checking và đóng gói production bundle Vite)

---

## 8. Hướng dẫn kịch bản Demo & Kiểm thử (UAT)

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
