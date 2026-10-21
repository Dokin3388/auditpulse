// AuditPulse - Database Invariant & Integration Tests on Neon PostgreSQL
import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
// CI intentionally does not receive a database credential. Live invariant
// checks run only in the protected development environment, never against an
// implicit localhost fallback.
const liveTest = DATABASE_URL ? test : test.skip;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

liveTest('Neon DB: Database connectivity and version verification', async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT version(), current_database();');
    assert.ok(res.rows[0].version.includes('PostgreSQL'));
    assert.equal(res.rows[0].current_database, 'neondb');
  } finally {
    client.release();
  }
});

liveTest('Neon DB Invariant: Anti-Duplicate Action Constraint blocks duplicate active action on (customer_id, issue_code)', async () => {
  const client = await pool.connect();
  try {
    // There is already an active action for CUST-004 with issue DISC_001 (ACT-2026-0985 at REOPENED)
    const duplicateAction = {
      id: `TEST-DUP-${Date.now()}`,
      code: `ACT-DUP-${Date.now()}`,
      case_id: 'CASE-2026-0801',
      customer_id: 'CUST-004',
      issue_code: 'DISC_001',
      issue_name: 'Áp dụng chiết khấu vượt khung',
      sale_id: 'SALE-03',
      auditor_id: 'AUD-02',
      severity: 'HIGH',
      status: 'OPEN', // Active status
      due_date: '2026-10-25T18:00:00Z',
      sla_rule_version: 'v1.4',
      completion_criteria: 'Test criteria',
      snapshot_customer_name: 'Test Customer',
      snapshot_sale_name: 'Test Sale',
      snapshot_team_name: 'Test Team',
      snapshot_auditor_name: 'Test Auditor',
    };

    let caughtError: any = null;
    try {
      await client.query(
        `INSERT INTO corrective_actions (
           id, code, case_id, customer_id, issue_code, issue_name, sale_id, auditor_id,
           severity, status, due_date, sla_rule_version, completion_criteria,
           snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          duplicateAction.id,
          duplicateAction.code,
          duplicateAction.case_id,
          duplicateAction.customer_id,
          duplicateAction.issue_code,
          duplicateAction.issue_name,
          duplicateAction.sale_id,
          duplicateAction.auditor_id,
          duplicateAction.severity,
          duplicateAction.status,
          duplicateAction.due_date,
          duplicateAction.sla_rule_version,
          duplicateAction.completion_criteria,
          duplicateAction.snapshot_customer_name,
          duplicateAction.snapshot_sale_name,
          duplicateAction.snapshot_team_name,
          duplicateAction.snapshot_auditor_name,
        ]
      );
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Expected unique index violation on duplicate active action');
    assert.equal(caughtError.code, '23505', 'PostgreSQL error code must be 23505 (unique_violation)');
    assert.ok(
      caughtError.constraint === 'idx_prevent_duplicate_active_action' ||
        caughtError.message.includes('idx_prevent_duplicate_active_action')
    );
  } finally {
    client.release();
  }
});

liveTest('Neon DB Invariant: Assignment Overlap Exclusion Constraint blocks 2 overlapping assignments for same sale', async () => {
  const client = await pool.connect();
  try {
    // SALE-02 has Assignment A from 2026-08-01 to 2026-10-26
    // Attempting to insert an overlapping assignment for SALE-02 starting in that window (e.g. 2026-09-01 to 2026-10-01)
    const overlappingAsg = {
      id: `TEST-OVERLAP-${Date.now()}`,
      sale_id: 'SALE-02',
      auditor_id: 'AUD-02',
      effective_from: '2026-09-01',
      effective_to: '2026-10-01',
      assignment_reason: 'Test overlap collision',
      created_by: 'Head Auditor',
      snapshot_sale_name: 'Lê Thu Hương',
      snapshot_auditor_name: 'Trần Quang Huy',
      snapshot_team_name: 'Team B2B Miền Bắc',
    };

    let caughtError: any = null;
    try {
      await client.query(
        `INSERT INTO auditor_assignments (
           id, sale_id, auditor_id, effective_from, effective_to,
           assignment_reason, created_by, is_active,
           snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10)`,
        [
          overlappingAsg.id,
          overlappingAsg.sale_id,
          overlappingAsg.auditor_id,
          overlappingAsg.effective_from,
          overlappingAsg.effective_to,
          overlappingAsg.assignment_reason,
          overlappingAsg.created_by,
          overlappingAsg.snapshot_sale_name,
          overlappingAsg.snapshot_auditor_name,
          overlappingAsg.snapshot_team_name,
        ]
      );
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Expected exclusion constraint violation on overlapping assignment intervals');
    assert.equal(caughtError.code, '23P01', 'PostgreSQL error code must be 23P01 (exclusion_violation)');
    assert.ok(
      caughtError.constraint === 'exclude_overlapping_auditor_assignments' ||
        caughtError.message.includes('exclude_overlapping_auditor_assignments')
    );
  } finally {
    client.release();
  }
});

liveTest('Neon DB Reporting View: v_rescued_orders_attribution calculates valid rescued orders dynamically', async () => {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM v_rescued_orders_attribution;');
    assert.ok(res.rows.length >= 1, 'View must return rescued orders');
    const first = res.rows[0];
    assert.ok(first.order_id);
    assert.ok(first.order_value > 0);
    assert.ok(first.window_days >= 0 && first.window_days <= 30);
    assert.ok(['AUDIT_ASSISTED', 'SALE_SELF_RESOLVED'].includes(first.attribution_status));
  } finally {
    client.release();
    await pool.end();
  }
});
