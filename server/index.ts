// AuditPulse API Server - Node.js/TypeScript Backend for Neon PostgreSQL
// Frontend accesses Neon strictly through this API layer.
import express, { type Request, type Response, type NextFunction } from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { query, withTransaction, pool } from './db.ts';
import {
  parseCsv,
  validateEntityData,
  commitImportBatch,
  type EntityType,
} from './services/dataOnboarding.ts';
import { syncGoogleSheetWebhook, type GoogleSheetWebhookPayload } from './services/googleSheetsWebhook.ts';
import { customerIdentityReport } from './services/customerIdentity.ts';
import { applyCustomerMerge, planCustomerMerge } from './services/customerMerge.ts';
import {
  canSaleMarkActionDone,
  canAuditorStartRecheck,
  canAuditorSubmitRecheck,
} from '../src/services/workflowRules.ts';
import {
  createAssignmentsInTransaction,
  listAssignments,
  parseCreateInput,
  toAssignmentError,
} from './services/assignments.ts';
import {
  AUDIT_DATE_PATTERN,
  materializeQueueForDate,
  recentAuditDates,
  vietnamBusinessDate,
} from './services/queueMaterializer.ts';
import type { RecheckResult, CorrectiveActionStatus } from '../src/types/index.ts';
import { auth } from './auth.ts';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { getLoginGateFailure, isLoginAllowedRole } from '../src/services/authPolicy.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const authHandler = toNodeHandler(auth);

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

app.use(express.json());

const getAppUserByEmail = async (email: string) => {
  const result = await query(
    `SELECT id, email, name, role, avatar_url AS "avatarUrl",
            login_enabled AS "loginEnabled",
            is_active AS "isActive"
     FROM app_users
     WHERE lower(email) = lower($1)`,
    [email]
  );

  return result.rows[0] ?? null;
};

app.post('/api/auth/sign-in/email', async (req: Request, res: Response, next: NextFunction) => {
  const payload = (req.body ?? {}) as { email?: string; password?: string; rememberMe?: boolean };
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!email || !password) {
    res.status(400).json({ message: 'Email và mật khẩu không được để trống.' });
    return;
  }

  const appUser = await getAppUserByEmail(email);
  const blockReason = getLoginGateFailure({
    role: appUser?.role ?? null,
    loginEnabled: appUser?.loginEnabled ?? null,
    isActive: appUser?.isActive ?? null,
  });

  if (!appUser || blockReason) {
    res.status(403).json({
      message: blockReason || 'Tài khoản chưa được cấp quyền AuditPulse.',
    });
    return;
  }

  return authHandler(req, res, next);
});

app.post('/api/auth/sign-up/email', async (req: Request, res: Response, next: NextFunction) => {
  const payload = (req.body ?? {}) as { name?: string; email?: string; password?: string };
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!name || !email || !password) {
    res.status(400).json({ message: 'Tên, email và mật khẩu là bắt buộc.' });
    return;
  }

  const appUser = await getAppUserByEmail(email);
  const blockReason = getLoginGateFailure({
    role: appUser?.role ?? null,
    loginEnabled: appUser?.loginEnabled ?? null,
    isActive: appUser?.isActive ?? null,
  });

  if (!appUser || blockReason) {
    res.status(403).json({
      message: blockReason || 'Tài khoản chưa được cấp quyền AuditPulse.',
    });
    return;
  }

  return authHandler(req, res, next);
});

// Better Auth handles the remaining auth endpoints (session lookup, sign-out, etc.).
app.all('/api/auth/*splat', authHandler);

type AppActor = { id: string; email: string; name: string; role: string; avatarUrl: string | null };

const getAppActor = async (req: Request): Promise<AppActor | null> => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user?.email) return null;

  const row = await getAppUserByEmail(session.user.email);
  if (!row) return null;

  const blockReason = getLoginGateFailure({
    role: row.role,
    loginEnabled: row.loginEnabled,
    isActive: row.isActive,
  });

  if (blockReason) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl,
  } as AppActor;
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

const requireAuditOperator = (req: Request, res: Response, next: NextFunction) => {
  const actor = res.locals.actor as AppActor | undefined;
  if (!actor || !isLoginAllowedRole(actor.role)) {
    res.status(403).json({ error: 'Tài khoản này không có quyền thao tác AuditPulse.' });
    return;
  }
  next();
};

app.get('/api/me', requireAppSession, async (req: Request, res: Response) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  res.json({
    session: { id: session?.session.id, expiresAt: session?.session.expiresAt },
    user: session?.user,
    appUser: res.locals.actor,
  });
});

// All operational data routes require a real AuditPulse session and auditor-level permissions.
app.use(
  ['/api/queue', '/api/actions', '/api/assignments', '/api/reports', '/api/onboarding', '/api/users', '/api/admin', '/api/issue-definitions'],
  requireAppSession,
  requireAuditOperator
);
app.use('/api/sync/google-sheets/issue-logs', requireAppSession, requireAuditOperator);

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

app.get('/api/issue-definitions', async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT id, issue_code AS "issueCode", issue_name AS "issueName",
             issue_group_code AS "issueGroupCode", issue_group_name AS "issueGroupName",
             severity, hard_fail AS "hardFail",
             is_definition_complete AS "isDefinitionComplete", is_current AS "isCurrent",
             version, COALESCE(recheck_guidance_template, '') AS "recheckGuidanceTemplate"
      FROM issue_definitions
      WHERE is_current = true
      ORDER BY issue_group_name, issue_code`);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tải danh mục lỗi.';
    res.status(500).json({ error: message });
  }
});

// Customer identity data quality (phone-first mapping of customers/quotations/orders).
// GET  report: coverage, duplicates, unmatched transactions, last sync metrics.
// POST merge : { apply: false } previews duplicate groups; { apply: true } merges a
//              time-boxed batch (call again while `remaining` > 0). Head Auditor/Admin only.
app.get('/api/admin/customer-identity/report', async (_req: Request, res: Response) => {
  const actor = res.locals.actor as AppActor;
  if (actor.role !== 'HEAD_AUDITOR' && actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Chỉ Head Auditor/Admin được xem báo cáo chất lượng map dữ liệu.' });
    return;
  }
  const client = await pool.connect();
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await customerIdentityReport(client) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Không thể tạo báo cáo chất lượng map dữ liệu.' });
  } finally {
    client.release();
  }
});

app.post('/api/admin/customer-identity/merge', async (req: Request, res: Response) => {
  const actor = res.locals.actor as AppActor;
  if (actor.role !== 'HEAD_AUDITOR' && actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Chỉ Head Auditor/Admin được gộp khách trùng.' });
    return;
  }
  const apply = req.body?.apply === true;
  const client = await pool.connect();
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!apply) {
      const plan = await planCustomerMerge(client);
      res.json({ success: true, apply: false, data: { ...plan, clusters: plan.clusters.slice(0, 50) } });
      return;
    }
    const result = await applyCustomerMerge(client, { actor: `${actor.name} (${actor.role})` });
    res.json({ success: true, apply: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Không thể gộp khách trùng.' });
  } finally {
    client.release();
  }
});

app.post('/api/admin/bootstrap-auditors', async (req: Request, res: Response) => {
  const actor = res.locals.actor as AppActor;
  if (actor.role !== 'HEAD_AUDITOR' && actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Chỉ Head Auditor/Admin được tạo tài khoản Auditor.' });
    return;
  }

  const accounts = [
    { id: 'AUDITOR-AUD-MAI-HOANG', code: 'AUD-01', name: 'Mai Hoàng', email: 'auditor01@auditpulse.local' },
    { id: 'AUDITOR-AUD-NGOC-NHI', code: 'AUD-02', name: 'Ngọc Nhi', email: 'auditor02@auditpulse.local' },
    { id: 'AUDITOR-AUD-PHUONG-TINH', code: 'AUD-03', name: 'Phương Tình', email: 'auditor03@auditpulse.local' },
  ];

  try {
    const created: Array<{ id: string; name: string; email: string; password: string }> = [];
    for (const account of accounts) {
      await query(
        `INSERT INTO app_users (id, email, name, role, is_active, login_enabled)
         VALUES ($1, $2, $3, 'AUDITOR', TRUE, TRUE)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           role = 'AUDITOR',
           is_active = TRUE,
           login_enabled = TRUE`,
        [account.id, account.email, account.name]
      );
      await query(
        `INSERT INTO auditor_profiles (id, auditor_code, max_daily_capacity)
         VALUES ($1, $2, 80)
         ON CONFLICT (id) DO UPDATE SET auditor_code = EXCLUDED.auditor_code`,
        [account.id, account.code]
      );
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
      conditions.push(`(COALESCE(q.assigned_auditor_id, effective_assignment.auditor_id) = $${values.length} OR queue_auditor.auditor_code = $${values.length})`);
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
        COALESCE(queue_auditor.auditor_code, COALESCE(q.assigned_auditor_id, effective_assignment.auditor_id)) AS "assignedAuditorId",
        COALESCE(q.snapshot_auditor_name, effective_assignment.auditor_name) AS "assignedAuditorName",
        q.assigned_at AS "assignedAt",
        CASE
          WHEN q.status = 'UNASSIGNED' AND effective_assignment.auditor_id IS NOT NULL THEN 'ASSIGNED'
          ELSE q.status
        END AS status,
        (
          CASE WHEN (c.first_seen_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = q.audit_date - 1
            THEN jsonb_build_array(jsonb_build_object(
              'code', 'YESTERDAY_CUSTOMERS', 'label', 'Khách tạo hôm qua',
              'description', 'Khách được tạo trong ngày D-1 (hôm qua).', 'detectedAt', q.audit_date::text
            )) ELSE '[]'::jsonb END
          || CASE WHEN (c.first_seen_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= q.audit_date - 7
            AND NOT EXISTS (
            SELECT 1 FROM quotations qt
            WHERE qt.customer_id = q.customer_id
              AND (qt.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= q.audit_date - 1
          ) THEN jsonb_build_array(jsonb_build_object(
            'code', 'NO_QUOTATION', 'label', 'Chưa báo giá',
            'description', 'Khách mới trong 7 ngày, chưa có báo giá nào tính đến D-1.', 'detectedAt', q.audit_date::text
          )) ELSE '[]'::jsonb END
          || CASE WHEN EXISTS (
            SELECT 1 FROM quotations qt
            WHERE qt.customer_id = q.customer_id
              AND (qt.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= q.audit_date - 1
              AND (qt.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= q.audit_date - 30
              AND NOT EXISTS (
                SELECT 1 FROM sales_orders so
                WHERE so.customer_id = q.customer_id AND so.status = 'VALID'
                  AND (so.order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= (qt.quote_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                  AND (so.order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= q.audit_date
              )
          ) THEN jsonb_build_array(jsonb_build_object(
            'code', 'QUOTED_NOT_ORDERED', 'label', 'Báo giá chưa chốt',
            'description', 'Có báo giá trong 30 ngày nhưng chưa có đơn hợp lệ.', 'detectedAt', q.audit_date::text
          )) ELSE '[]'::jsonb END
          || COALESCE(q.risk_tags, '[]'::jsonb)
        ) AS "riskTags",
        q.active_action_id AS "activeActionId",
        q.rule_version AS "ruleVersion",
        q.sync_timestamp AS "syncTimestamp",
        q.shared_work AS "sharedWork"
      FROM audit_queue_items q
      JOIN customers c ON c.id = q.customer_id
      LEFT JOIN LATERAL (
        SELECT a.auditor_id, a.snapshot_auditor_name AS auditor_name
        FROM auditor_assignments a
        WHERE a.sale_id = q.sale_id
          AND a.effective_from <= q.audit_date
          AND (a.effective_to IS NULL OR a.effective_to >= q.audit_date)
        ORDER BY a.effective_from DESC
        LIMIT 1
      ) effective_assignment ON true
      LEFT JOIN auditor_profiles queue_auditor
        ON queue_auditor.id = COALESCE(q.assigned_auditor_id, effective_assignment.auditor_id)
      ${whereClause}
      -- Newest audit days are the operational worklist; history remains
      -- available through the explicit date filter.
      ORDER BY q.audit_date DESC, q.created_at ASC;
    `;

    const result = await query(sql, values);
    res.json({ data: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving queue items';
    res.status(500).json({ error: message });
  }
});

// Promote customers matching the daily rules (and optional issue-log rows) into one review
// queue item per customer/day. Idempotent; see server/services/queueMaterializer.ts.
app.post('/api/queue/materialize-from-issue-logs', async (req: Request, res: Response) => {
  try {
    const requested = typeof req.body?.auditDate === 'string' ? req.body.auditDate : '';
    const auditDate = AUDIT_DATE_PATTERN.test(requested) ? requested : null;
    const result = await withTransaction((client) => materializeQueueForDate(client, auditDate));
    res.status(201).json({ success: true, ...result });
  } catch (err: unknown) {
    console.error('[queue] materialize failed:', err);
    const message = err instanceof Error ? err.message : 'Không thể tạo audit queue từ nhật ký lỗi.';
    res.status(500).json({ error: message });
  }
});

// Daily job (Vercel Cron, see vercel.json). Builds today's queue and re-checks the previous
// days so a missed run or a late data sync self-heals. Fails closed without CRON_SECRET.
app.get('/api/cron/materialize-queue', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET chưa được cấu hình trên máy chủ.' });
    return;
  }
  const provided = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const days = Math.min(Math.max(Number(req.query.days) || 3, 1), 14);
  const results: Array<Record<string, unknown>> = [];
  for (const auditDate of recentAuditDates(vietnamBusinessDate(), days)) {
    try {
      const result = await withTransaction((client) => materializeQueueForDate(client, auditDate));
      results.push({ ...result, ok: true });
    } catch (err: unknown) {
      console.error('[cron] materialize failed for', auditDate, err);
      results.push({ auditDate, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  res.status(failed ? 500 : 200).json({ success: failed === 0, results });
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
    const saleRef = typeof req.query.saleId === 'string' && req.query.saleId ? req.query.saleId : undefined;
    const data = await listAssignments({ query }, { saleRef });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data });
  } catch (err: unknown) {
    console.error('[assignments] GET failed:', err);
    const message = err instanceof Error ? err.message : 'Error retrieving assignments';
    res.status(500).json({ error: message });
  }
});

// Create assignment(s). Body: { saleId | saleIds[], auditorId, effectiveFrom, reason }.
// saleId/auditorId may be app_users.id or the human-facing code. All sales are written in
// ONE transaction; the response carries the rows read back from the database.
app.post('/api/assignments', async (req: Request, res: Response) => {
  const actor = res.locals.actor as AppActor;

  if (actor.role !== 'HEAD_AUDITOR' && actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Từ chối quyền: Chỉ Head Auditor mới có quyền tạo phân công.' });
    return;
  }

  try {
    const input = parseCreateInput(req.body);
    const result = await withTransaction((client) => createAssignmentsInTransaction(client, input, actor));
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ success: true, message: result.message, data: result.assignments });
  } catch (err: unknown) {
    const known = toAssignmentError(err);
    if (known) {
      res.status(known.status).json({ error: known.message, code: known.code });
      return;
    }
    console.error('[assignments] POST failed:', err);
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

