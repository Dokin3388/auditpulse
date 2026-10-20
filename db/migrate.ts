// AuditPulse - Database Migration Runner for Neon PostgreSQL
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Lỗi: DATABASE_URL chưa được thiết lập trong biến môi trường (.env).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureMigrationTable(client: pg.PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function runMigrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Đang kết nối tới Neon PostgreSQL...');
    await ensureMigrationTable(client);

    const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('Không tìm thấy thư mục db/migrations');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const appliedRes = await client.query('SELECT version FROM _schema_migrations ORDER BY id ASC');
    const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏩ Đã áp dụng trước đó: ${file}`);
        continue;
      }

      console.log(`🚀 Đang chạy migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Hoàn thành migration: ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Thất bại khi áp dụng migration ${file}:`, err);
        throw err;
      }
    }

    if (count === 0) {
      console.log('✨ Cơ sở dữ liệu đã ở phiên bản mới nhất. Không có migration mới.');
    } else {
      console.log(`🎉 Đã áp dụng thành công ${count} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function runRollback() {
  const client = await pool.connect();
  try {
    console.log('🔄 Đang kiểm tra migration để rollback...');
    await ensureMigrationTable(client);

    const latestRes = await client.query(
      'SELECT version FROM _schema_migrations ORDER BY id DESC LIMIT 1'
    );

    if (latestRes.rows.length === 0) {
      console.log('ℹ️ Không có migration nào để rollback.');
      return;
    }

    const latestVersion = latestRes.rows[0].version;
    console.log(`⚠️ Đang rollback migration: ${latestVersion}...`);

    await client.query('BEGIN');
    try {
      if (latestVersion === '0002_anti_duplicate_and_overlap_guards.sql') {
        await client.query('DROP INDEX IF EXISTS idx_prevent_duplicate_active_action;');
        await client.query(
          'ALTER TABLE auditor_assignments DROP CONSTRAINT IF EXISTS exclude_overlapping_auditor_assignments;'
        );
      } else if (latestVersion === '0001_initial_schema.sql') {
        await client.query(`
          DROP VIEW IF EXISTS v_rescued_orders_attribution;
          DROP TABLE IF EXISTS rescued_orders CASCADE;
          DROP TABLE IF EXISTS source_sync_logs CASCADE;
          DROP TABLE IF EXISTS audit_trail_events CASCADE;
          DROP TABLE IF EXISTS auditor_assignments CASCADE;
          DROP TABLE IF EXISTS evidences CASCADE;
          DROP TABLE IF EXISTS rechecks CASCADE;
          DROP TABLE IF EXISTS corrective_actions CASCADE;
          DROP TABLE IF EXISTS audit_issues CASCADE;
          DROP TABLE IF EXISTS audit_cases CASCADE;
          DROP TABLE IF EXISTS audit_queue_items CASCADE;
          DROP TABLE IF EXISTS audit_queue_runs CASCADE;
          DROP TABLE IF EXISTS issue_definitions CASCADE;
          DROP TABLE IF EXISTS sales_orders CASCADE;
          DROP TABLE IF EXISTS quotations CASCADE;
          DROP TABLE IF EXISTS customers CASCADE;
          DROP TABLE IF EXISTS auditor_profiles CASCADE;
          DROP TABLE IF EXISTS sales_profiles CASCADE;
          DROP TABLE IF EXISTS app_users CASCADE;
          DROP TABLE IF EXISTS teams CASCADE;
        `);
      }

      await client.query('DELETE FROM _schema_migrations WHERE version = $1', [latestVersion]);
      await client.query('COMMIT');
      console.log(`✅ Đã rollback migration thành công: ${latestVersion}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Lỗi khi rollback migration ${latestVersion}:`, err);
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

const isRollback = process.argv.includes('rollback');

if (isRollback) {
  runRollback().catch((err) => {
    console.error('Lỗi rollback:', err);
    process.exit(1);
  });
} else {
  runMigrate().catch((err) => {
    console.error('Lỗi migrate:', err);
    process.exit(1);
  });
}
