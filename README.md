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

## 5. Danh sách các phần đang Mock & Hướng dẫn đấu nối API thật

Tất cả logic nghiệp vụ, trạng thái và dữ liệu được đóng gói độc lập trong `src/types/index.ts` và `src/services/auditStore.tsx`. Khi chuyển sang backend thực tế (ví dụ: REST API, FastAPI, NestJS hoặc Supabase):

1. **Thay thế In-memory State bằng React Query / SWR**:
   - `useAuditStore` hiện tại quản lý state reactive trong bộ nhớ. Bạn có thể thay thế các hàm `fetch` trong `AuditProvider` bằng các hook `useQuery(['queue', filters])` và `useMutation`.
2. **Đấu nối Supabase / PostgreSQL**:
   - Schema trong `src/types/index.ts` đã ánh xạ 1:1 với các bảng trong Operating Specification: `audit_queue_item`, `audit_case`, `audit_issue`, `issue_definition`, `corrective_action`, `recheck`, `auditor_assignment`, `evidence`.
   - File upload: Thay thế hàm tạo mock Evidence trong `EvidencePreview.tsx` bằng upload lên Supabase Storage hoặc AWS S3/Cloud Storage, lưu URL vào bảng `evidence`.
3. **Xác thực người dùng (Auth)**:
   - Thay thế `allUsers` và `currentUser` bằng JWT session / Supabase Auth (`supabase.auth.getUser()`).

---

## 6. Hướng dẫn kịch bản Demo & Kiểm thử (UAT)

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
