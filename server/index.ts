// AuditPulse API Server - Node.js/TypeScript Backend for Neon PostgreSQL
// Frontend accesses Neon strictly through this API layer.
import express, { type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
import { auth } from './auth.ts';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Better Auth must receive the raw request before express.json parses it.
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json());

type AppActor = { id: string; email: string; name: string; role: string; avatarUrl: string | null };

const getAppActor = async (req: Request): Promise<AppActor | null> => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user?.email) return null;
  const result = await query(
    `SELECT id, email, name, role, avatar_url AS "avatarUrl"
     FROM app_users WHERE lower(email) = lower($1) AND is_active = true`,
    [session.user.email]
  );
  return (result.rows[0] as AppActor | undefined) ?? null;
};

const requireAppSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = await getAppActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Bạn cần đăng nhập bằng tài khoản AuditPulse được cấp quyền.' });
      return;
    }
    res.locals.actor = actor;
    next();
  } catch (err) {
    next(err);
  }
};

app.get('/api/me', requireAppSession, async (req: Request, res: Response) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  res.json({
    session: { id: session?.session.id, expiresAt: session?.session.expiresAt },
    user: session?.user,
    appUser: res.locals.actor,
  });
});

// All operational data routes require a real AuditPulse session.
app.use(['/api/queue', '/api/actions', '/api/assignments', '/api/reports', '/api/onboarding', '/api/users', '/api/admin'], requireAppSession);
app.use('/api/sync/google-sheets/issue-logs', requireAppSession);

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : null;
    const values: unknown[] = [];
    const roleClause = role ? `AND u.role = $${values.push(role)}` : '';
    const result = await query(`
      SELECT u.id, u.email, u.name, u.role, u.avatar_url AS "avatarUrl", u.is_active AS "isActive",
             ap.auditor_code AS "auditorId", sp.sale_code AS "saleId",
             t.id AS "teamId", t.name AS "teamName"
      FROM app_users u
      LEFT JOIN auditor_profiles ap ON ap.id = u.id
      LEFT JOIN sales_profiles sp ON sp.id = u.id
      LEFT JOIN teams t ON t.id = COALESCE(sp.team_id, NULL)
      WHERE u.is_active = true ${roleClause}
      ORDER BY u.role, u.name`, values);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving users';
    res.status(500).json({ error: message });
  }
});

app.post('/api/admin/bootstrap-auditors', async (req: Request, res: Response) => {
  const actor = res.locals.actor as AppActor;
  if (actor.role !== 'HEAD_AUDITOR' && actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Chỉ Head Auditor/Admin được tạo tài khoản Auditor.' });
    return;
  }

  const accounts = [
    { id: 'AUDITOR-AUD-MAI-HOANG', email: 'auditor01@auditpulse.local' },
    { id: 'AUDITOR-AUD-NGOC-NHI', email: 'auditor02@auditpulse.local' },
    { id: 'AUDITOR-AUD-PHUONG-TINH', email: 'auditor03@auditpulse.local' },
  ];

  try {
    const created: Array<{ id: string; name: string; email: string; password: string }> = [];
    for (const account of accounts) {
      const userResult = await query<{ id: string; name: string; role: string }>(
        `SELECT id, name, role FROM app_users WHERE id = $1 AND role = 'AUDITOR' AND is_active = true`,
        [account.id]
      );
      const appUser = userResult.rows[0];
      if (!appUser) continue;
      const temporaryPassword = `AuditPulse-${randomBytes(9).toString('base64url')}`;

      try {
        await auth.api.signUpEmail({
          body: { name: appUser.name, email: account.email, password: temporaryPassword },
          headers: fromNodeHeaders(req.headers),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes('already exists') || message.toLowerCase().includes('unique')) continue;
        throw error;
      }

      await query(`UPDATE app_users SET email = $1 WHERE id = $2`, [account.email, account.id]);
      created.push({ id: account.id, name: appUser.name, email: account.email, password: temporaryPassword });
    }
    res.json({ success: true, accounts: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tạo tài khoản Auditor.';
    res.status(500).json({ error: message });
  }
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

// Promote source issue logs into one review queue item per unique customer/day.
// This is deliberately separate from action creation: an auditor still has to
// review the source finding before a corrective action exists.
app.post('/api/queue/materialize-from-issue-logs', async (_req: Request, res: Response) => {
  try {
    const result = await withTransaction(async (client) => {
      const [sourceRows, customers, sales, assignments] = await Promise.all([
        client.query<{ payload: Record<string, string> }>(
          `SELECT payload FROM google_sheet_row_state
           WHERE source_id = 'sale-issues' AND sheet_name = 'fact_issue_log'`
        ),
        client.query<{ id: string; code: string; name: string; phone: string | null }>(
          `SELECT id, code, name, phone FROM customers`
        ),
        client.query<{ id: string; name: string; saleCode: string; teamId: string | null; teamName: string | null }>(
          `SELECT u.id, u.name, sp.sale_code AS "saleCode", sp.team_id AS "teamId", t.name AS "teamName"
           FROM app_users u JOIN sales_profiles sp ON sp.id = u.id
           LEFT JOIN teams t ON t.id = sp.team_id
           WHERE u.role = 'SALE'`
        ),
        client.query<{ saleId: string; auditorId: string; effectiveFrom: string; effectiveTo: string | null; auditorName: string; auditorTeam: string | null }>(
          `SELECT a.sale_id AS "saleId", a.auditor_id AS "auditorId",
                  a.effective_from::text AS "effectiveFrom", a.effective_to::text AS "effectiveTo",
                  u.name AS "auditorName", NULL::text AS "auditorTeam"
           FROM auditor_assignments a JOIN app_users u ON u.id = a.auditor_id
           WHERE a.is_active = true`
        ),
      ]);

      const byCustomer = new Map<string, { id: string; name: string; phone: string | null }>();
      for (const customer of customers.rows) {
        for (const key of [customer.code, customer.phone, customer.name]) {
          if (key?.trim()) byCustomer.set(key.trim().toLowerCase(), customer);
        }
      }
      const bySale = new Map<string, { id: string; name: string; saleCode: string; teamId: string | null; teamName: string | null }>();
      for (const sale of sales.rows) {
        for (const key of [sale.name, sale.saleCode]) {
          if (key?.trim()) bySale.set(key.trim().toLowerCase(), sale);
        }
      }
      type Group = {
        date: string;
        customer: { id: string; name: string; phone: string | null };
        sale: { id: string; name: string };
        team: { id: string; name: string };
        issueCodes: Set<string>;
      };
      const groups = new Map<string, Group>();
      let skipped = 0;
      for (const sourceRow of sourceRows.rows) {
        const row = sourceRow.payload || {};
        const date = String(row.date || '').trim().slice(0, 10);
        const customerKey = String(row.sdt || row.ma_khach_hang || row.khach || '').trim().toLowerCase();
        const saleKey = String(row.sale || row.sale_name || row.ten_sale || '').trim().toLowerCase();
        const customer = byCustomer.get(customerKey);
        const sale = bySale.get(saleKey);
        // Team ownership is canonical in data_sale/sales_profiles. The issue
        // log may contain an old or mistyped team label, so never let it
        // overwrite the current master assignment.
        const team = sale?.teamId && sale.teamName ? { id: sale.teamId, name: sale.teamName } : undefined;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !customer || !sale || !team) {
          skipped += 1;
          continue;
        }
        const key = `${date}|${customer.id}`;
        const group = groups.get(key) || {
          date,
          customer,
          sale,
          team,
          issueCodes: new Set<string>(),
        };
        const issueCode = String(row.issue_code || row.ma_loi || '').trim();
        if (issueCode) group.issueCodes.add(issueCode);
        groups.set(key, group);
      }

      const runIds = new Set<string>();
      let created = 0;
      for (const group of groups.values()) {
        const runId = `RUN-SHEET-${group.date.replaceAll('-', '')}`;
        runIds.add(runId);
        await client.query(
          `INSERT INTO audit_queue_runs (id, run_date, rule_version, total_items, status)
           VALUES ($1, $2, 'sheet-issue-v1', 0, 'COMPLETED')
           ON CONFLICT (id) DO NOTHING`,
          [runId, group.date]
        );
        const assignment = assignments.rows.find((item) => item.saleId === group.sale.id &&
          item.effectiveFrom <= group.date && (!item.effectiveTo || item.effectiveTo >= group.date));
        const queueId = `QUEUE-SHEET-${createHash('sha256').update(`${group.date}|${group.customer.id}`).digest('hex').slice(0, 24)}`;
        const riskTags = JSON.stringify([...group.issueCodes].map((code) => ({ code, source: 'fact_issue_log' })));
        const status = assignment ? 'ASSIGNED' : 'UNASSIGNED';
        await client.query(
          `INSERT INTO audit_queue_items (
             id, queue_run_id, audit_date, customer_id, sale_id, team_id,
             assigned_auditor_id, status, risk_tags, active_action_id, rule_version,
             sync_timestamp, assigned_at, shared_work, snapshot_customer_name,
             snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, 'sheet-issue-v1', NOW(), $10, false, $11, $12, $13, $14)
           ON CONFLICT (audit_date, customer_id) DO UPDATE SET
             risk_tags = EXCLUDED.risk_tags,
             assigned_auditor_id = COALESCE(audit_queue_items.assigned_auditor_id, EXCLUDED.assigned_auditor_id),
             assigned_at = COALESCE(audit_queue_items.assigned_at, EXCLUDED.assigned_at),
             status = CASE WHEN audit_queue_items.status IN ('COMPLETED_PASS', 'COMPLETED_FAIL', 'SKIPPED')
                           THEN audit_queue_items.status ELSE EXCLUDED.status END,
             snapshot_sale_name = EXCLUDED.snapshot_sale_name,
             team_id = EXCLUDED.team_id,
             snapshot_team_name = EXCLUDED.snapshot_team_name,
             snapshot_auditor_name = COALESCE(audit_queue_items.snapshot_auditor_name, EXCLUDED.snapshot_auditor_name),
             sync_timestamp = NOW()`,
          [
            queueId,
            runId,
            group.date,
            group.customer.id,
            group.sale.id,
            group.team.id,
            assignment?.auditorId || null,
            status,
            riskTags,
            assignment ? group.date : null,
            group.customer.name,
            group.sale.name,
            group.team.name,
            assignment?.auditorName || null,
          ]
        );
        created += 1;
      }
      for (const runId of runIds) {
        await client.query(`UPDATE audit_queue_runs SET total_items = (SELECT COUNT(*) FROM audit_queue_items WHERE queue_run_id = $1) WHERE id = $1`, [runId]);
      }
      return { sourceRows: sourceRows.rowCount ?? 0, queueItems: created, skipped, runCount: runIds.size };
    });
    res.status(201).json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tạo audit queue từ nhật ký lỗi.';
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
  const actor = res.locals.actor as AppActor;
  const actorRole = actor.role;
  const actorSaleId = actor.id;

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
  const actor = res.locals.actor as AppActor;
  const actorRole = actor.role;
  const actorAuditorId = actor.id;

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
  const actor = res.locals.actor as AppActor;
  const actorRole = actor.role;
  const actorAuditorId = actor.id;

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
  const actor = res.locals.actor as AppActor;
  const actorRole = actor.role;
  const createdBy = actor.name;

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

// Raw sale-issue rows are review data only. They are not converted into
// corrective actions automatically; an auditor must review them first.
app.get('/api/sync/google-sheets/issue-logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const result = await query(
      `SELECT source_row_key AS "sourceRowKey", payload, last_synced_at AS "lastSyncedAt"
       FROM google_sheet_row_state
       WHERE source_id = 'sale-issues' AND sheet_name = 'fact_issue_log'
       ORDER BY last_synced_at DESC, source_row_key DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await query(
      `SELECT COUNT(*)::int AS total
       FROM google_sheet_row_state
       WHERE source_id = 'sale-issues' AND sheet_name = 'fact_issue_log'`
    );
    res.json({ data: result.rows, total: count.rows[0]?.total ?? 0, limit, offset });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đọc nhật ký lỗi Sale.';
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

