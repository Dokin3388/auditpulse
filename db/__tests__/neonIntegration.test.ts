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
  const suffix = `DUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const teamId = `TEST-TEAM-${suffix}`;
  const saleId = `TEST-SALE-${suffix}`;
  const auditorId = `TEST-AUD-${suffix}`;
  const customerId = `TEST-CUST-${suffix}`;
  const issueCode = `ISSUE_${suffix}`;
  const actionId1 = `TEST-ACT1-${suffix}`;
  const actionId2 = `TEST-ACT2-${suffix}`;

  try {
    await client.query('BEGIN');

    // 1. Self-contained minimum valid fixtures
    await client.query(
      `INSERT INTO teams (id, code, name) VALUES ($1, $1, 'Test Team')`,
      [teamId]
    );
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Sale', 'SALE')`,
      [saleId, `sale.${suffix}@auditpulse.test`]
    );
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Auditor', 'AUDITOR')`,
      [auditorId, `auditor.${suffix}@auditpulse.test`]
    );
    await client.query(
      `INSERT INTO customers (id, code, name, first_seen_date, current_sale_id, current_team_id)
       VALUES ($1, $1, 'Test Customer', NOW(), $2, $3)`,
      [customerId, saleId, teamId]
    );

    // 2. Insert first active corrective action
    await client.query(
      `INSERT INTO corrective_actions (
         id, code, customer_id, sale_id, auditor_id, issue_code, issue_name,
         severity, status, due_date, sla_rule_version, completion_criteria,
         snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
       ) VALUES ($1, $2, $3, $4, $5, $6, 'Test Issue', 'HIGH', 'OPEN', NOW() + INTERVAL '3 days', 'v1.0', 'Test criteria', 'Test Customer', 'Test Sale', 'Test Team', 'Test Auditor')`,
      [actionId1, `ACT1-${suffix}`, customerId, saleId, auditorId, issueCode]
    );

    // 3. Attempt inserting duplicate active action on same (customer_id, issue_code)
    let caughtError: any = null;
    try {
      await client.query(
        `INSERT INTO corrective_actions (
           id, code, customer_id, sale_id, auditor_id, issue_code, issue_name,
           severity, status, due_date, sla_rule_version, completion_criteria,
           snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
         ) VALUES ($1, $2, $3, $4, $5, $6, 'Test Issue', 'HIGH', 'OPEN', NOW() + INTERVAL '3 days', 'v1.0', 'Test criteria', 'Test Customer', 'Test Sale', 'Test Team', 'Test Auditor')`,
        [actionId2, `ACT2-${suffix}`, customerId, saleId, auditorId, issueCode]
      );
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Expected unique index violation on duplicate active action');
    assert.equal(caughtError.code, '23505', 'PostgreSQL error code must be 23505 (unique_violation)');
    assert.ok(
      caughtError.constraint === 'idx_prevent_duplicate_active_action' ||
        caughtError.message.includes('idx_prevent_duplicate_active_action'),
      'Must violate idx_prevent_duplicate_active_action constraint'
    );
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors if transaction was already aborted
    }
    try {
      await client.query(`DELETE FROM corrective_actions WHERE id IN ($1, $2)`, [actionId1, actionId2]);
      await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      await client.query(`DELETE FROM app_users WHERE id IN ($1, $2)`, [saleId, auditorId]);
      await client.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
    } catch {
      // ignore cleanup errors
    }
    client.release();
  }
});

liveTest('Neon DB Invariant: Assignment Overlap Exclusion Constraint blocks 2 overlapping assignments for same sale', async () => {
  const client = await pool.connect();
  const suffix = `OVL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const saleId = `TEST-SALE-${suffix}`;
  const auditorId = `TEST-AUD-${suffix}`;
  const asgId1 = `TEST-ASG1-${suffix}`;
  const asgId2 = `TEST-ASG2-${suffix}`;

  try {
    await client.query('BEGIN');

    // 1. Self-contained minimum valid fixtures
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Sale', 'SALE')`,
      [saleId, `sale.${suffix}@auditpulse.test`]
    );
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Auditor', 'AUDITOR')`,
      [auditorId, `auditor.${suffix}@auditpulse.test`]
    );

    // 2. Insert initial assignment with date window (2026-08-01 to 2026-10-26)
    await client.query(
      `INSERT INTO auditor_assignments (
         id, sale_id, auditor_id, effective_from, effective_to,
         assignment_reason, created_by, is_active,
         snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
       ) VALUES ($1, $2, $3, '2026-08-01', '2026-10-26', 'Initial assignment', 'Head Auditor', TRUE, 'Test Sale', 'Test Auditor', 'Test Team')`,
      [asgId1, saleId, auditorId]
    );

    // 3. Attempt inserting overlapping assignment for same sale_id (2026-09-01 to 2026-10-01)
    let caughtError: any = null;
    try {
      await client.query(
        `INSERT INTO auditor_assignments (
           id, sale_id, auditor_id, effective_from, effective_to,
           assignment_reason, created_by, is_active,
           snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
         ) VALUES ($1, $2, $3, '2026-09-01', '2026-10-01', 'Overlap assignment', 'Head Auditor', FALSE, 'Test Sale', 'Test Auditor', 'Test Team')`,
        [asgId2, saleId, auditorId]
      );
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Expected exclusion constraint violation on overlapping assignment intervals');
    assert.equal(caughtError.code, '23P01', 'PostgreSQL error code must be 23P01 (exclusion_violation)');
    assert.ok(
      caughtError.constraint === 'exclude_overlapping_auditor_assignments' ||
        caughtError.message.includes('exclude_overlapping_auditor_assignments'),
      'Must violate exclude_overlapping_auditor_assignments constraint'
    );
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors if transaction was already aborted
    }
    try {
      await client.query(`DELETE FROM auditor_assignments WHERE id IN ($1, $2)`, [asgId1, asgId2]);
      await client.query(`DELETE FROM app_users WHERE id IN ($1, $2)`, [saleId, auditorId]);
    } catch {
      // ignore cleanup errors
    }
    client.release();
  }
});

liveTest('Neon DB Reporting View: v_rescued_orders_attribution calculates valid rescued orders dynamically', async () => {
  const client = await pool.connect();
  const suffix = `RSC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const teamId = `TEST-TEAM-${suffix}`;
  const saleId = `TEST-SALE-${suffix}`;
  const auditorId = `TEST-AUD-${suffix}`;
  const customerId = `TEST-CUST-${suffix}`;
  const actionId = `TEST-ACT-${suffix}`;
  const orderId = `TEST-ORD-${suffix}`;

  try {
    await client.query('BEGIN');

    // 1. Self-contained minimum valid fixtures
    await client.query(
      `INSERT INTO teams (id, code, name) VALUES ($1, $1, 'Test Team')`,
      [teamId]
    );
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Sale', 'SALE')`,
      [saleId, `sale.${suffix}@auditpulse.test`]
    );
    await client.query(
      `INSERT INTO app_users (id, email, name, role) VALUES ($1, $2, 'Test Auditor', 'AUDITOR')`,
      [auditorId, `auditor.${suffix}@auditpulse.test`]
    );
    await client.query(
      `INSERT INTO customers (id, code, name, first_seen_date, current_sale_id, current_team_id)
       VALUES ($1, $1, 'Test Customer', NOW(), $2, $3)`,
      [customerId, saleId, teamId]
    );

    // 2. Insert corrective action created 5 days ago
    await client.query(
      `INSERT INTO corrective_actions (
         id, code, customer_id, sale_id, auditor_id, issue_code, issue_name,
         severity, status, due_date, sla_rule_version, completion_criteria,
         snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, 'ISSUE_TEST', 'Test Issue', 'HIGH', 'VERIFIED_CLOSED', NOW() + INTERVAL '2 days', 'v1.0', 'Criteria', 'Test Customer', 'Test Sale', 'Test Team', 'Test Auditor', NOW() - INTERVAL '5 days')`,
      [actionId, `ACT-${suffix}`, customerId, saleId, auditorId]
    );

    // 3. Insert valid sales order placed 2 days ago (3 days after action created_at)
    await client.query(
      `INSERT INTO sales_orders (
         id, code, customer_id, sale_id, order_date, total_amount, status
       ) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '2 days', 5000000, 'VALID')`,
      [orderId, `ORD-${suffix}`, customerId, saleId]
    );

    // 4. Query rescued orders view filtered to the fixture customer
    const res = await client.query(
      `SELECT * FROM v_rescued_orders_attribution WHERE customer_id = $1;`,
      [customerId]
    );

    assert.ok(res.rows.length >= 1, 'View must return rescued orders');
    const matched = res.rows.find((r: any) => r.order_id === orderId) || res.rows[0];
    assert.equal(matched.order_id, orderId);
    assert.equal(matched.customer_id, customerId);
    assert.ok(Number(matched.order_value) > 0);
    assert.ok(Number(matched.window_days) >= 0 && Number(matched.window_days) <= 30);
    assert.ok(['AUDIT_ASSISTED', 'SALE_SELF_RESOLVED'].includes(matched.attribution_status));
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors if transaction was already aborted
    }
    try {
      await client.query(`DELETE FROM sales_orders WHERE id = $1`, [orderId]);
      await client.query(`DELETE FROM corrective_actions WHERE id = $1`, [actionId]);
      await client.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      await client.query(`DELETE FROM app_users WHERE id IN ($1, $2)`, [saleId, auditorId]);
      await client.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
    } catch {
      // ignore cleanup errors
    }
    client.release();
    await pool.end();
  }
});
