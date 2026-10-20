// AuditPulse Integration & Unit Tests: Data Onboarding Engine (Phase 1.5)
import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  parseCsv,
  validateEntityData,
  commitImportBatch,
} from '../../server/services/dataOnboarding.ts';

dotenv.config();

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

test('Data Onboarding Engine: CSV Parser (RFC 4180)', () => {
  const csvContent = `# Header comment
team_code,team_name,notes
TEAM-A,"Team Alpha, Direct Sales","Hỗ trợ ""VIP"" clients"
TEAM-B,Team Beta,Telesales
`;

  const parsed = parseCsv(csvContent);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].team_code, 'TEAM-A');
  assert.equal(parsed.rows[0].team_name, 'Team Alpha, Direct Sales');
  assert.equal(parsed.rows[0].notes, 'Hỗ trợ "VIP" clients');
  assert.equal(parsed.rows[1].team_code, 'TEAM-B');
});

test('Data Onboarding Engine: Validation detects duplicate codes within batch', async () => {
  const duplicateTeams = [
    { team_code: 'TEAM-DUP', team_name: 'Team 1' },
    { team_code: 'TEAM-DUP', team_name: 'Team 2' },
  ];

  const result = await validateEntityData('TEAMS', duplicateTeams, [2, 3], null);
  assert.equal(result.hasErrors, true);
  const dupError = result.errors.find((e) => e.field === 'team_code' && e.error.includes('trùng'));
  assert.ok(dupError, 'Phải phát hiện lỗi trùng mã team trong batch');
  assert.equal(dupError?.rowNumber, 3);
});

test('Data Onboarding Engine: Sale bắt buộc có team', async () => {
  const invalidSales = [
    { sale_code: 'SALE-NO-TEAM', name: 'Nguyễn Văn A', email: 'a@auditpulse.vn', team_code: '' },
  ];

  const result = await validateEntityData('SALES', invalidSales, [2], null);
  assert.equal(result.hasErrors, true);
  const teamError = result.errors.find((e) => e.field === 'team_code');
  assert.ok(teamError, 'Phải báo lỗi khi sale không có team');
  assert.ok(teamError?.error.includes('Sale bắt buộc có team'));
});

test('Data Onboarding Engine: Prevents overlapping assignment intervals in batch', async () => {
  const overlappingAssignments = [
    {
      sale_code: 'SALE-TEST-01',
      auditor_code: 'AUD-01',
      effective_from: '2026-10-01',
      effective_to: '2026-10-15',
      assignment_reason: 'Phân công đợt 1',
    },
    {
      sale_code: 'SALE-TEST-01',
      auditor_code: 'AUD-02',
      effective_from: '2026-10-10', // Overlaps with 2026-10-01 -> 2026-10-15
      effective_to: '2026-10-31',
      assignment_reason: 'Phân công đợt 2 bị trùng',
    },
  ];

  const result = await validateEntityData('ASSIGNMENTS', overlappingAssignments, [2, 3], null);
  assert.equal(result.hasErrors, true);
  const overlapError = result.errors.find((e) => e.error.includes('Trùng lặp phân công trong batch'));
  assert.ok(overlapError, 'Phải phát hiện overlap giữa 2 phân công cho cùng sale trong batch');
  assert.equal(overlapError?.rowNumber, 3);
});

test('Data Onboarding Engine: Issue catalog approval rule (Chỉ duyệt mới kích hoạt tự động)', async () => {
  const issues = [
    {
      issue_code: 'ISSUE-DRAFT-01',
      issue_name: 'Lỗi đang soạn thảo',
      issue_group_code: 'GRP-TEST',
      severity: 'MEDIUM',
      is_definition_complete: 'false',
    },
    {
      issue_code: 'ISSUE-APPROVED-01',
      issue_name: 'Lỗi đã phê duyệt',
      issue_group_code: 'GRP-TEST',
      severity: 'HIGH',
      is_definition_complete: 'true',
    },
  ];

  const result = await validateEntityData('ISSUES', issues, [2, 3], null);
  const unapprovedWarn = result.errors.find(
    (e) => e.field === 'is_definition_complete' && e.severity === 'WARNING'
  );
  assert.ok(unapprovedWarn, 'Phải cảnh báo issue chưa được phê duyệt');
  assert.equal(unapprovedWarn?.rowNumber, 2);
  assert.ok(unapprovedWarn?.error.includes('chưa được phê duyệt'));
});

test('Data Onboarding Engine: Database commit and audit trail logging (Live Neon)', async (t) => {
  if (!DATABASE_URL) {
    t.skip('Skipping Live Neon DB commit test because DATABASE_URL is not set');
    return;
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const testCode = `TEAM-TEST-${Date.now()}`;
    const testRows = [
      {
        team_code: testCode,
        team_name: 'Team Test Onboarding Live',
        notes: 'Kiểm tra commit & audit trail',
      },
    ];

    // 1. Validate
    const valResult = await validateEntityData('TEAMS', testRows, [2], client);
    assert.equal(valResult.hasErrors, false, 'Dữ liệu test phải hợp lệ');

    // 2. Commit
    const commitRes = await commitImportBatch(
      'TEAMS',
      'test_teams_commit.csv',
      testRows,
      'Test Suite Runner',
      valResult.errors,
      client
    );

    assert.equal(commitRes.successRows, 1);
    assert.ok(commitRes.batchId.startsWith('BATCH-'));
    assert.ok(commitRes.auditEventId.startsWith('EVT-IMPORT-'));

    // 3. Verify in data_import_batches
    const batchRes = await client.query('SELECT * FROM data_import_batches WHERE id = $1', [
      commitRes.batchId,
    ]);
    assert.equal(batchRes.rows.length, 1);
    assert.equal(batchRes.rows[0].entity_type, 'TEAMS');
    assert.equal(batchRes.rows[0].status, 'COMMITTED');

    // 4. Verify in audit_trail_events
    const eventRes = await client.query('SELECT * FROM audit_trail_events WHERE id = $1', [
      commitRes.auditEventId,
    ]);
    assert.equal(eventRes.rows.length, 1);
    assert.equal(eventRes.rows[0].action_type, 'DATA_ONBOARDING_IMPORT');

    // Clean up test team
    await client.query('DELETE FROM teams WHERE code = $1', [testCode]);
  } finally {
    client.release();
    await pool.end();
  }
});
