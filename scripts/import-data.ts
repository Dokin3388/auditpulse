// AuditPulse CLI Data Onboarding Script
// Usage: node --experimental-strip-types scripts/import-data.ts --file=<path> --entity=<type> [--commit] [--actor=<name>]
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  parseCsv,
  validateEntityData,
  commitImportBatch,
  type EntityType,
} from '../server/services/dataOnboarding.ts';

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

function parseArgs(): {
  filePath?: string;
  entityType?: EntityType;
  commit: boolean;
  actor: string;
} {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let entityType: EntityType | undefined;
  let commit = false;
  let actor = 'Vũ Thùy Linh (Head Auditor)';

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filePath = arg.substring('--file='.length);
    } else if (arg.startsWith('--entity=')) {
      entityType = arg.substring('--entity='.length).toUpperCase() as EntityType;
    } else if (arg === '--commit') {
      commit = true;
    } else if (arg.startsWith('--actor=')) {
      actor = arg.substring('--actor='.length);
    }
  }

  return { filePath, entityType, commit, actor };
}

async function main() {
  const { filePath, entityType, commit, actor } = parseArgs();

  if (!filePath || !entityType) {
    console.log(`
╔═════════════════════════════════════════════════════════════════════════════════╗
║                      AuditPulse Data Onboarding CLI Tool                        ║
║                 Phase 1.5 Neon Development Data Onboarding                      ║
╚═════════════════════════════════════════════════════════════════════════════════╝

Cách sử dụng:
  npm run data:import -- --file=<đường-dẫn-file-csv> --entity=<thực-thể> [--commit] [--actor=<tên>]

Danh sách các thực thể (--entity):
  - TEAMS              : Đội ngũ kinh doanh
  - USERS              : Head Auditor, Team Lead, Admin
  - AUDITORS           : Chuyên viên kiểm toán
  - SALES              : Nhân viên kinh doanh (bắt buộc có team)
  - ASSIGNMENTS        : Phân công Auditor phụ trách Sale (chống overlap)
  - ISSUES             : Danh mục lỗi kiểm toán (chỉ duyệt mới auto action)
  - SLA                : Cấu hình quy tắc hạn xử lý & recheck SLA
  - CUSTOMERS          : Khách hàng mẫu 30-60 ngày
  - QUOTATIONS         : Báo giá mẫu 30-60 ngày
  - ORDERS             : Đơn hàng mẫu 30-60 ngày
  - SALE_TEAM_HISTORY  : Lịch sử chuyển team của Sale

Ví dụ:
  # Chế độ Validate & Preview:
  npm run data:import -- --file=data/templates/01_teams_template.csv --entity=TEAMS

  # Chế độ Commit lưu vào Neon DB:
  npm run data:import -- --file=data/templates/01_teams_template.csv --entity=TEAMS --commit
`);
    process.exit(0);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Lỗi: Không tìm thấy tệp tin tại ${resolvedPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(resolvedPath, 'utf8');
  const { headers, rows, rawLineNumbers } = parseCsv(csvContent);

  console.log(`\n📂 Đang xử lý: ${path.basename(filePath)}`);
  console.log(`📊 Thực thể: ${entityType} | Tổng số dòng: ${rows.length}`);
  console.log(`📋 Các cột nhận diện được: [ ${headers.join(', ')} ]\n`);

  let pool: pg.Pool | null = null;
  let client: pg.PoolClient | null = null;

  if (DATABASE_URL) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    client = await pool.connect();
  } else {
    console.warn('⚠️ Cảnh báo: DATABASE_URL chưa được thiết lập, chỉ kiểm tra cú pháp tệp (in-memory validation).');
  }

  try {
    // 1. Run Validation
    console.log('🔍 Đang kiểm tra tính hợp lệ của dữ liệu (Validation Engine)...');
    const result = await validateEntityData(entityType, rows, rawLineNumbers, client);

    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`✅ Hợp lệ: ${result.validRowsCount}/${result.totalRows} dòng`);
    console.log(`❌ Không hợp lệ: ${result.invalidRowsCount}/${result.totalRows} dòng`);
    console.log('─────────────────────────────────────────────────────────────────\n');

    // Print Preview (first 3 rows)
    if (rows.length > 0) {
      console.log('👀 Xem trước dữ liệu (Preview 3 dòng đầu):');
      console.table(rows.slice(0, 3));
      console.log('');
    }

    // Print Validation Errors if any
    if (result.errors.length > 0) {
      console.log('🚨 BÁO CÁO CHI TIẾT LỖI THEO TỪNG DÒNG (Row-by-Row Report):');
      const formattedErrors = result.errors.map((e) => ({
        'Dòng (Row)': e.rowNumber,
        'Cột (Field)': e.field,
        'Mức độ': e.severity,
        'Lỗi chi tiết': e.error,
        'Giá trị gốc': e.rawValue ?? '-',
      }));
      console.table(formattedErrors);
      console.log('');
    }

    // 2. Commit Mode
    if (commit) {
      if (result.hasErrors) {
        console.error('⛔ COMMIT BỊ TỪ CHỐI: Tệp chứa lỗi nghiêm trọng. Vui lòng sửa các lỗi trên trước khi commit.');
        process.exit(1);
      }

      if (!client) {
        console.error('❌ Lỗi: Không thể commit vì chưa kết nối được tới Neon PostgreSQL.');
        process.exit(1);
      }

      console.log(`🚀 Đang thực thi commit vào Neon PostgreSQL bởi '${actor}'...`);
      const commitRes = await commitImportBatch(
        entityType,
        path.basename(filePath),
        rows,
        actor,
        result.errors,
        client
      );

      console.log('\n🎉 COMMIT THÀNH CÔNG VÀO NEON DATABASE!');
      console.log(`📦 Batch ID: ${commitRes.batchId}`);
      console.log(`📝 Audit Trail Event ID: ${commitRes.auditEventId}`);
      console.log(`✅ Đã thêm/cập nhật thành công: ${commitRes.successRows} bản ghi.`);
    } else {
      console.log('ℹ️ Kết quả: Chạy chế độ Preview & Validate thành công.');
      console.log('👉 Thêm cờ --commit vào cuối lệnh để ghi dữ liệu thật vào Neon DB.');
    }
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Lỗi xử lý import:', err);
  process.exit(1);
});
