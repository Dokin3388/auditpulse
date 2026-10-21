// AuditPulse API Server - Node.js/TypeScript Backend for Neon PostgreSQL
// Frontend accesses Neon strictly through this API layer.
import express, { type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { query, withTransaction, pool } from './db.ts';
import {
  parseCsv,
  validateEntityData,
  commitImportBatch,
  type EntityType,
} from './services/dataOnboarding.ts';
import { syncGoogleSheetWebhook, type GoogleSheetWebhookPayload } from './services/googleSheetsWebhook.ts';
import {
  canSaleMarkActionDone,
  canAuditorStartRecheck,
  canAuditorSubmitRecheck,
  resolveAssignmentChain,
  getDayBefore,
} from '../src/services/workflowRules.ts';
import type { RecheckResult, CorrectiveActionStatus } from '../src/types/index.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-User-Role,X-User-Id');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// ============================================================================
// 1. HEALTH & METRICS
// ============================================================================
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const dbCheck = await query('SELECT NOW() as db_time, current_database() as db_name;');
    res.json({
      status: 'healthy',
      serverTime: new Date().toISOString(),
      database: {
        connected: true,
        databaseName: dbCheck.rows[0].db_name,
        neonTimestamp: dbCheck.rows[0].db_time,
      },
      app: 'AuditPulse API Server v1.1',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database connection error';
    res.status(500).json({ status: 'unhealthy', error: message });
  }
});

// ============================================================================
// 2. AUDIT QUEUE
// ============================================================================
app.get('/api/queue', async (req: Request, res: Response) => {
  try {
    const { auditDate, status, auditorId, saleId } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (auditDate) {
      values.push(auditDate);
      conditions.push(`q.audit_date = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`q.status = $${values.length}`);
    }
    if (auditorId) {
      values.push(auditorId);
      conditions.push(`q.assigned_auditor_id = $${values.length}`);
    }
    if (saleId) {
      values.push(saleId);
      conditions.push(`q.sale_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        q.id,
        q.queue_run_id AS "queueRunId",
        q.audit_date AS "auditDate",
        q.customer_id AS "customerId",
        q.snapshot_customer_name AS "customerName",
        c.phone AS "customerPhone",
        c.first_seen_date AS "customerFirstSeen",
        q.sale_id AS "saleId",
        q.snapshot_sale_name AS "saleName",
        q.team_id AS "teamId",
        q.snapshot_team_name AS "teamName",
        q.assigned_auditor_id AS "assignedAuditorId",
        q.snapshot_auditor_name AS "assignedAuditorName",
        q.assigned_at AS "assignedAt",
        q.status,
        q.risk_tags AS "riskTags",
        q.active_action_id AS "activeActionId",
        q.rule_version AS "ruleVersion",
        q.sync_timestamp AS "syncTimestamp",
        q.shared_work AS "sharedWork"
      FROM audit_queue_items q
      JOIN customers c ON c.id = q.customer_id
      ${whereClause}
      ORDER BY q.created_at ASC;
    `;

    const result = await query(sql, values);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving queue items';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// 3. CORRECTIVE ACTIONS
// ============================================================================
app.get('/api/actions', async (req: Request, res: Response) => {
  try {
    const { status, saleId, auditorId } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (status) {
      values.push(status);
      conditions.push(`ca.status = $${values.length}`);
    }
    if (saleId) {
      values.push(saleId);
      conditions.push(`ca.sale_id = $${values.length}`);
    }
    if (auditorId) {
      values.push(auditorId);
      conditions.push(`ca.auditor_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        ca.id,
        ca.code,
        ca.case_id AS "caseId",
        ca.issue_id AS "issueId",
        ca.queue_item_id AS "queueItemId",
        ca.customer_id AS "customerId",
        ca.snapshot_customer_name AS "customerName",
        ca.sale_id AS "saleId",
        ca.snapshot_sale_name AS "saleName",
        ca.snapshot_team_name AS "teamName",
        ca.auditor_id AS "auditorId",
        ca.snapshot_auditor_name AS "auditorName",
        ca.issue_code AS "issueCode",
        ca.issue_name AS "issueName",
        ca.severity,
        ca.status,
        ca.created_at AS "createdAt",
        ca.due_date AS "dueDate",
        ca.sla_rule_version AS "slaRuleVersion",
        ca.completion_criteria AS "completionCriteria",
        ca.guidance_notes AS "guidanceNotes",
        ca.sale_marked_done AS "saleMarkedDone",
        ca.sale_marked_done_at AS "saleMarkedDoneAt",
        ca.sale_notes AS "saleNotes",
        ca.waive_reason AS "waiveReason",
        ca.waive_approved_by AS "waiveApprovedBy",
        (ca.due_date < NOW() AND ca.status IN ('OPEN', 'REOPENED')) AS "isOverdue"
      FROM corrective_actions ca
      ${whereClause}
      ORDER BY ca.created_at DESC;
    `;

    const result = await query(sql, values);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving actions';
    res.status(500).json({ error: message });
  }
});

// Sale Marks Action Done (Strict State Transition Gate)
app.post('/api/actions/:id/mark-done', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes, evidenceUrl, fileName } = req.body;
  const actorRole = (req.headers['x-user-role'] as string) || 'SALE';
  const actorSaleId = (req.headers['x-user-id'] as string) || req.body.saleId;

  try {
    const actionRes = await query(
      `SELECT id, code, status, sale_id AS "saleId", snapshot_sale_name AS "saleName" 
       FROM corrective_actions WHERE id = $1`,
      [id]
    );

    if (actionRes.rowCount === 0) {
      res.status(404).json({ error: 'Không tìm thấy action' });
      return;
    }

    const action = actionRes.rows[0];

    // Validate using pure business rules
    const validation = canSaleMarkActionDone(
      { status: action.status as CorrectiveActionStatus, saleId: action.saleId, saleName: action.saleName },
      { role: actorRole as any, saleId: actorSaleId }
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    if (!notes || !notes.trim()) {
      res.status(400).json({ error: 'Ghi chú kết quả khắc phục không được để trống.' });
      return;
    }

    await withTransaction(async (client) => {
      // 1. Update action status
      await client.query(
        `UPDATE corrective_actions 
         SET status = 'SALE_MARKED_DONE',
             sale_marked_done = TRUE,
             sale_marked_done_at = NOW(),
             sale_notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [notes, id]
      );

      // 2. Attach evidence if provided
      if (evidenceUrl) {
        const evidenceId = `EVI-${Date.now()}`;
        await client.query(
          `INSERT INTO evidences (id, target_type, target_id, type, file_name, file_url, uploaded_by_role, uploaded_by_name)
           VALUES ($1, 'SALE_ACTION', $2, 'IMAGE', $3, $4, 'SALE', $5)`,
          [evidenceId, id, fileName || 'evidence.png', evidenceUrl, action.saleName]
        );
      }

      // 3. Record Audit Trail
      await client.query(
        `INSERT INTO audit_trail_events (id, action_type, description, details, actor_name, actor_role)
         VALUES ($1, 'ACTION_MARKED_DONE', $2, $3, $4, 'SALE')`,
        [
          `TRL-${Date.now()}`,
          `Sale ${action.saleName} xác nhận đã thực hiện action ${action.code}.`,
          `Ghi chú: ${notes}`,
          action.saleName,
        ]
      );
    });

    res.json({ success: true, message: 'Đã gửi xác nhận khắc phục thành công! Chờ Auditor recheck.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error marking action done';
    res.status(500).json({ error: message });
  }
});

// Auditor Starts Recheck
app.post('/api/actions/:id/start-recheck', async (req: Request, res: Response) => {
  const { id } = req.params;
  const actorRole = (req.headers['x-user-role'] as string) || 'AUDITOR';
  const actorAuditorId = (req.headers['x-user-id'] as string) || req.body.auditorId;

  try {
    const actionRes = await query(
      `SELECT id, code, status, auditor_id AS "auditorId", snapshot_auditor_name AS "auditorName" 
       FROM corrective_actions WHERE id = $1`,
      [id]
    );

    if (actionRes.rowCount === 0) {
      res.status(404).json({ error: 'Không tìm thấy action' });
      return;
    }

    const action = actionRes.rows[0];

    const validation = canAuditorStartRecheck(
      { status: action.status as CorrectiveActionStatus, auditorId: action.auditorId, auditorName: action.auditorName },
      { role: actorRole as any, auditorId: actorAuditorId }
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE corrective_actions SET status = 'IN_RECHECK', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      await client.query(
        `INSERT INTO audit_trail_events (id, action_type, description, actor_name, actor_role)
         VALUES ($1, 'RECHECK_STARTED', $2, $3, 'AUDITOR')`,
        [
          `TRL-${Date.now()}`,
          `Auditor ${action.auditorName} bắt đầu kiểm tra (IN_RECHECK) action ${action.code}.`,
          action.auditorName,
        ]
      );
    });

    res.json({ success: true, message: 'Đã bắt đầu kiểm tra action (IN_RECHECK).' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error starting recheck';
    res.status(500).json({ error: message });
  }
});

// Auditor Submits Recheck Result
app.post('/api/actions/:id/submit-recheck', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { result, notes, nextDueDate } = req.body;
  const actorRole = (req.headers['x-user-role'] as string) || 'AUDITOR';
  const actorAuditorId = (req.headers['x-user-id'] as string) || req.body.auditorId;

  try {
    const actionRes = await query(
      `SELECT id, code, status, auditor_id AS "auditorId", snapshot_auditor_name AS "auditorName" 
       FROM corrective_actions WHERE id = $1`,
      [id]
    );

    if (actionRes.rowCount === 0) {
      res.status(404).json({ error: 'Không tìm thấy action' });
      return;
    }

    const action = actionRes.rows[0];

    const validation = canAuditorSubmitRecheck(
      { status: action.status as CorrectiveActionStatus, auditorId: action.auditorId, auditorName: action.auditorName },
      { role: actorRole as any, auditorId: actorAuditorId },
      result as RecheckResult,
      nextDueDate
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    await withTransaction(async (client) => {
      const countRes = await client.query(
        `SELECT COUNT(*) FROM rechecks WHERE action_id = $1`,
        [id]
      );
      const recheckNumber = parseInt(countRes.rows[0].count, 10) + 1;
      const recheckId = `RC-${Date.now()}`;

      // Insert recheck record
      await client.query(
        `INSERT INTO rechecks (id, action_id, recheck_number, auditor_id, auditor_name, result, notes, next_due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          recheckId,
          id,
          recheckNumber,
          action.auditorId,
          action.auditorName,
          result,
          notes,
          result === 'NOT_IMPROVED' ? nextDueDate : null,
        ]
      );

      // Update action status
      if (result === 'IMPROVED') {
        await client.query(
          `UPDATE corrective_actions 
           SET status = 'VERIFIED_CLOSED', updated_at = NOW() 
           WHERE id = $1`,
          [id]
        );

        await client.query(
          `INSERT INTO audit_trail_events (id, action_type, description, details, actor_name, actor_role)
           VALUES ($1, 'RECHECK_IMPROVED', $2, $3, $4, 'AUDITOR')`,
          [
            `TRL-${Date.now()}`,
            `Auditor ${action.auditorName} xác nhận IMPROVED. Action ${action.code} được ĐÓNG.`,
            notes,
            action.auditorName,
          ]
        );
      } else {
        await client.query(
          `UPDATE corrective_actions 
           SET status = 'REOPENED', 
               due_date = $1, 
               sale_marked_done = FALSE, 
               updated_at = NOW() 
           WHERE id = $2`,
          [nextDueDate, id]
        );

        await client.query(
          `INSERT INTO audit_trail_events (id, action_type, description, details, actor_name, actor_role)
           VALUES ($1, 'RECHECK_NOT_IMPROVED', $2, $3, $4, 'AUDITOR')`,
          [
            `TRL-${Date.now()}`,
            `Auditor ${action.auditorName} xác nhận NOT_IMPROVED. Mở lại action ${action.code}.`,
            `Hạn mới: ${nextDueDate} • Ghi chú: ${notes}`,
            action.auditorName,
          ]
        );
      }
    });

    res.json({
      success: true,
      message:
        result === 'IMPROVED'
          ? `Action ${action.code} đã được xác nhận cải thiện và ĐÓNG.`
          : `Action ${action.code} đã được MỞ LẠI kèm hạn chót mới.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error submitting recheck';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// 4. AUDITOR ASSIGNMENTS
// ============================================================================
app.get('/api/assignments', async (req: Request, res: Response) => {
  try {
    const { saleId } = req.query;
    const values: unknown[] = [];
    let whereClause = '';

    if (saleId) {
      values.push(saleId);
      whereClause = 'WHERE a.sale_id = $1';
    }

    const sql = `
      SELECT 
        a.id,
        a.sale_id AS "saleId",
        a.snapshot_sale_name AS "saleName",
        a.snapshot_team_name AS "teamName",
        a.auditor_id AS "auditorId",
        a.snapshot_auditor_name AS "auditorName",
        a.effective_from AS "effectiveFrom",
        a.effective_to AS "effectiveTo",
        a.assignment_reason AS "assignmentReason",
        a.created_by AS "createdBy",
        a.created_at AS "createdAt",
        a.is_active AS "isActive"
      FROM auditor_assignments a
      ${whereClause}
      ORDER BY a.effective_from DESC;
    `;

    const result = await query(sql, values);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving assignments';
    res.status(500).json({ error: message });
  }
});

// Create Assignment with Overlap Prevention
app.post('/api/assignments', async (req: Request, res: Response) => {
  const { saleId, auditorId, effectiveFrom, reason } = req.body;
  const actorRole = (req.headers['x-user-role'] as string) || 'HEAD_AUDITOR';
  const createdBy = (req.headers['x-user-name'] as string) || 'Head Auditor';

  if (actorRole !== 'HEAD_AUDITOR' && actorRole !== 'ADMIN') {
    res.status(403).json({ error: 'Từ chối quyền: Chỉ Head Auditor mới có quyền tạo phân công.' });
    return;
  }

  try {
    // 1. Fetch current assignments for this sale
    const existingRes = await query(
      `SELECT id, sale_id AS "saleId", auditor_id AS "auditorId", snapshot_auditor_name AS "auditorName",
              effective_from AS "effectiveFrom", effective_to AS "effectiveTo", is_active AS "isActive"
       FROM auditor_assignments 
       WHERE sale_id = $1 
       ORDER BY effective_from ASC`,
      [saleId]
    );

    // 2. Fetch sale & auditor metadata
    const userRes = await query(
      `SELECT id, name, role FROM app_users WHERE id IN ($1, $2)`,
      [saleId, auditorId]
    );

    const saleUser = userRes.rows.find((u) => u.id === saleId);
    const auditorUser = userRes.rows.find((u) => u.id === auditorId);

    const saleName = saleUser?.name || `Sale ${saleId}`;
    const auditorName = auditorUser?.name || `Auditor ${auditorId}`;
    const teamName = 'Team B2B Miền Bắc';

    // 3. Resolve interval chain using domain math
    const resolution = resolveAssignmentChain(existingRes.rows as any, {
      saleId,
      auditorId,
      effectiveFrom,
      reason,
      createdBy,
      saleName,
      teamName,
      auditorName,
    });

    if (!resolution.success) {
      res.status(409).json({ error: resolution.message });
      return;
    }

    // 4. Apply changes within a single database transaction
    await withTransaction(async (client) => {
      // If there was an open-ended assignment that needs to be capped
      const dayBeforeStr = getDayBefore(effectiveFrom);
      await client.query(
        `UPDATE auditor_assignments 
         SET effective_to = $1 
         WHERE sale_id = $2 AND effective_to IS NULL`,
        [dayBeforeStr, saleId]
      );

      // Insert new assignment
      const newAsgId = `ASG-${Date.now()}`;
      await client.query(
        `INSERT INTO auditor_assignments (
           id, sale_id, auditor_id, effective_from, effective_to,
           assignment_reason, created_by, is_active,
           snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
         ) VALUES ($1, $2, $3, $4, NULL, $5, $6, ($4 <= CURRENT_DATE), $7, $8, $9)`,
        [
          newAsgId,
          saleId,
          auditorId,
          effectiveFrom,
          reason,
          createdBy,
          saleName,
          auditorName,
          teamName,
        ]
      );

      // Audit trail
      await client.query(
        `INSERT INTO audit_trail_events (id, action_type, description, details, actor_name, actor_role)
         VALUES ($1, 'AUDITOR_ASSIGNMENT_UPDATED', $2, $3, $4, 'HEAD_AUDITOR')`,
        [
          `TRL-${Date.now()}`,
          `Head Auditor phân công ${saleName} cho ${auditorName} từ ${effectiveFrom}.`,
          `Lý do: ${reason}`,
          createdBy,
        ]
      );
    });

    res.json({ success: true, message: resolution.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error creating assignment';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// 5. REPORTING: RESCUED ORDERS
// ============================================================================
app.get('/api/reports/rescued-orders', async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        order_id AS "orderId",
        order_code AS "orderCode",
        customer_id AS "customerId",
        customer_name AS "customerName",
        action_id AS "actionId",
        action_code AS "actionCode",
        sale_id AS "saleId",
        auditor_id AS "auditorId",
        order_date AS "orderDate",
        order_value AS "orderValue",
        window_days AS "windowDays",
        attribution_status AS "attributionStatus"
      FROM v_rescued_orders_attribution
      ORDER BY order_date DESC;
    `);

    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving rescued orders';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// 6. GOOGLE SHEETS WEBHOOK SYNC
// The Sheet only sends changed rows (max 500). The server deduplicates every
// delivery and persists raw source rows before applying permitted operational
// mappings. Issue logs intentionally remain raw until an auditor reviews them.
// ============================================================================
function hasValidWebhookSecret(request: Request): boolean {
  const expected = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  const received = request.header('x-auditpulse-webhook-secret');
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

app.post('/api/sync/google-sheets/webhook', async (req: Request, res: Response) => {
  if (!process.env.GOOGLE_SHEETS_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Google Sheets webhook chưa được cấu hình trên server.' });
    return;
  }
  if (!hasValidWebhookSecret(req)) {
    res.status(401).json({ error: 'Webhook không hợp lệ.' });
    return;
  }

  const payload = req.body as GoogleSheetWebhookPayload;
  const client = await pool.connect();
  try {
    const result = await syncGoogleSheetWebhook(client, payload);
    res.status(result.duplicate ? 200 : 202).json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đồng bộ dữ liệu từ Google Sheets.';
    console.error('Google Sheets webhook sync failed', { message, sourceId: payload?.sourceId, sheetName: payload?.sheetName });
    res.status(400).json({ error: message });
  } finally {
    client.release();
  }
});

app.get('/api/sync/google-sheets/status', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, source_id AS "sourceId", sheet_name AS "sheetName", delivery_id AS "deliveryId",
              received_at AS "receivedAt", completed_at AS "completedAt", status,
              total_rows AS "totalRows", applied_rows AS "appliedRows", skipped_rows AS "skippedRows", error_message AS "errorMessage"
       FROM google_sheet_sync_runs
       ORDER BY received_at DESC
       LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đọc trạng thái Google Sheets sync.';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// 7. DATA ONBOARDING & ADMIN IMPORT (PHASE 1.5)
// ============================================================================
app.post('/api/onboarding/validate', async (req: Request, res: Response) => {
  try {
    const { entityType, csvText, rows } = req.body;
    if (!entityType) {
      res.status(400).json({ error: 'entityType là bắt buộc.' });
      return;
    }

    let parsedRows: Record<string, any>[] = [];
    let lineNumbers: number[] = [];

    if (csvText) {
      const parsed = parseCsv(csvText);
      parsedRows = parsed.rows;
      lineNumbers = parsed.rawLineNumbers;
    } else if (Array.isArray(rows)) {
      parsedRows = rows;
      lineNumbers = rows.map((_, idx) => idx + 2);
    } else {
      res.status(400).json({ error: 'Cần cung cấp csvText hoặc rows mảng.' });
      return;
    }

    const client = await pool.connect();
    try {
      const result = await validateEntityData(entityType as EntityType, parsedRows, lineNumbers, client);
      res.json({ success: true, result });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error validating data';
    res.status(500).json({ error: message });
  }
});

app.post('/api/onboarding/commit', async (req: Request, res: Response) => {
  try {
    const { entityType, fileName, rows, importedBy, validationErrors } = req.body;
    if (!entityType || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'entityType và rows không được để trống.' });
      return;
    }

    const actor = importedBy || 'Vũ Thùy Linh (Head Auditor)';
    const file = fileName || `import-${entityType.toLowerCase()}-${Date.now()}.csv`;

    const client = await pool.connect();
    try {
      const result = await commitImportBatch(
        entityType as EntityType,
        file,
        rows,
        actor,
        validationErrors || [],
        client
      );
      res.json({ success: true, ...result });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error committing import';
    res.status(500).json({ error: message });
  }
});

app.get('/api/onboarding/batches', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, entity_type AS "entityType", file_name AS "fileName", total_rows AS "totalRows",
              success_rows AS "successRows", failed_rows AS "failedRows", imported_by AS "importedBy",
              status, validation_report AS "validationReport", created_at AS "createdAt"
       FROM data_import_batches
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving import batches';
    res.status(500).json({ error: message });
  }
});

app.get('/api/onboarding/templates/:entity', (req: Request, res: Response) => {
  try {
    const entity = req.params.entity.toUpperCase();
    const templateMap = {
      TEAMS: '01_teams_template.csv',
      USERS: '02_users_leads_template.csv',
      AUDITORS: '03_auditors_template.csv',
      SALES: '04_sales_template.csv',
      ASSIGNMENTS: '05_auditor_assignments_template.csv',
      ISSUES: '06_issue_catalog_template.csv',
      SLA: '07_sla_rules_template.csv',
      CUSTOMERS: '08_operational_customers_sample.csv',
      QUOTATIONS: '09_operational_quotations_sample.csv',
      ORDERS: '10_operational_sales_orders_sample.csv',
      SALE_TEAM_HISTORY: '11_sale_team_history_template.csv',
    };

    const fileName = templateMap[entity];
    if (!fileName) {
      res.status(404).json({ error: `Không tìm thấy template cho thực thể: ${entity}` });
      return;
    }

    const tplPath = path.resolve(process.cwd(), 'data/templates', fileName);
    if (!fs.existsSync(tplPath)) {
      res.status(404).json({ error: 'File template không tồn tại trên đĩa.' });
      return;
    }

    const content = fs.readFileSync(tplPath, 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error reading template';
    res.status(500).json({ error: message });
  }
});

// Keep serverless invocations predictable instead of letting Express render an
// unhandled error page that could poison a warm function instance.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error('Unhandled API error', { message });
  res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.' });
});

// Start Server if executed directly
if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 AuditPulse API Server running at http://localhost:${PORT}`);
    console.log(`🔌 Connected to Neon PostgreSQL Database.`);
  });
}

export default app;
