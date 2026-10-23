// AuditPulse - Auditor assignment service (server side, source of truth).
//
// Why this module exists
// ----------------------
// The UI identifies people by *codes* (auditor_profiles.auditor_code = "AUD-01",
// sales_profiles.sale_code = "S20") while auditor_assignments references
// app_users.id ("AUDITOR-AUD-MAI-HOANG", "SALE-S20"). Writing the raw UI value
// violated the FK and the failure was swallowed by the client. Everything that
// reads or writes assignments now goes through this module, which:
//   * accepts either an id or a code and resolves it to the canonical app_users.id,
//   * runs the whole request (all sales) in ONE transaction,
//   * serialises concurrent writers per sale with an advisory lock,
//   * reads the written rows back before answering,
//   * returns DATE columns as plain YYYY-MM-DD text (no timezone drift).
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  getDayBefore,
  resolveAssignmentChain,
  vietnamToday,
} from '../../src/services/workflowRules.ts';
import type { AuditorAssignment } from '../../src/types/index.ts';

export type Queryable = Pick<pg.PoolClient, 'query'>;

export interface AssignmentActor {
  id: string;
  name: string;
  role: string;
}

export interface CreateAssignmentsInput {
  /** app_users.id or sales_profiles.sale_code, one per sale. */
  saleRefs: string[];
  /** app_users.id or auditor_profiles.auditor_code. */
  auditorRef: string;
  /** YYYY-MM-DD, interpreted as a Vietnam business date. */
  effectiveFrom: string;
  reason: string;
}

export class AssignmentError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AssignmentError';
    this.status = status;
    this.code = code;
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Validates and normalises the raw request body. Throws AssignmentError(400). */
export function parseCreateInput(body: unknown): CreateAssignmentsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawSales = Array.isArray(b.saleIds) ? b.saleIds : [b.saleId];
  const saleRefs = [...new Set(rawSales.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))];
  const auditorRef = typeof b.auditorId === 'string' ? b.auditorId.trim() : '';
  const effectiveFrom = typeof b.effectiveFrom === 'string' ? b.effectiveFrom.trim() : '';
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';

  if (saleRefs.length === 0) throw new AssignmentError(400, 'SALE_REQUIRED', 'Vui lòng chọn ít nhất một Sale để phân công.');
  if (saleRefs.length > 500) throw new AssignmentError(400, 'TOO_MANY_SALES', 'Chỉ được phân công tối đa 500 Sale mỗi lần.');
  if (!auditorRef) throw new AssignmentError(400, 'AUDITOR_REQUIRED', 'Vui lòng chọn Auditor nhận phân công.');
  if (!isValidDateOnly(effectiveFrom)) {
    throw new AssignmentError(400, 'INVALID_DATE', 'Ngày hiệu lực phải có định dạng YYYY-MM-DD hợp lệ.');
  }
  if (!reason) throw new AssignmentError(400, 'REASON_REQUIRED', 'Bắt buộc ghi lý do phân công để lưu audit trail.');
  if (reason.length > 2000) throw new AssignmentError(400, 'REASON_TOO_LONG', 'Lý do phân công quá dài (tối đa 2000 ký tự).');
  return { saleRefs, auditorRef, effectiveFrom, reason };
}

interface PartyRow {
  id: string;
  name: string;
  code: string | null;
  teamName: string | null;
}

async function resolveSale(db: Queryable, ref: string): Promise<PartyRow> {
  const res = await db.query<PartyRow>(
    `SELECT u.id, u.name, sp.sale_code AS code, t.name AS "teamName"
       FROM app_users u
       LEFT JOIN sales_profiles sp ON sp.id = u.id
       LEFT JOIN teams t ON t.id = sp.team_id
      WHERE u.role = 'SALE' AND u.is_active = TRUE AND (u.id = $1 OR sp.sale_code = $1)
      LIMIT 2`,
    [ref]
  );
  if (res.rows.length === 0) {
    throw new AssignmentError(404, 'SALE_NOT_FOUND', `Không tìm thấy Sale "${ref}" đang hoạt động trong hệ thống.`);
  }
  return res.rows[0];
}

async function resolveAuditor(db: Queryable, ref: string): Promise<PartyRow> {
  const res = await db.query<PartyRow>(
    `SELECT u.id, u.name, ap.auditor_code AS code, NULL::text AS "teamName"
       FROM app_users u
       LEFT JOIN auditor_profiles ap ON ap.id = u.id
      WHERE u.role = 'AUDITOR' AND u.is_active = TRUE AND (u.id = $1 OR ap.auditor_code = $1)
      LIMIT 2`,
    [ref]
  );
  if (res.rows.length === 0) {
    throw new AssignmentError(404, 'AUDITOR_NOT_FOUND', `Không tìm thấy Auditor "${ref}" đang hoạt động trong hệ thống.`);
  }
  return res.rows[0];
}

const ASSIGNMENT_SELECT = `
  SELECT a.id,
         a.sale_id AS "saleId",
         sp.sale_code AS "saleCode",
         COALESCE(a.snapshot_sale_name, su.name) AS "saleName",
         COALESCE(a.snapshot_team_name, 'Chưa có team') AS "teamName",
         COALESCE(ap.auditor_code, a.auditor_id) AS "auditorId",
         a.auditor_id AS "auditorUserId",
         COALESCE(a.snapshot_auditor_name, au.name) AS "auditorName",
         to_char(a.effective_from, 'YYYY-MM-DD') AS "effectiveFrom",
         to_char(a.effective_to, 'YYYY-MM-DD') AS "effectiveTo",
         a.assignment_reason AS "assignmentReason",
         a.created_by AS "createdBy",
         a.created_at AS "createdAt",
         (a.effective_from <= $1::date AND (a.effective_to IS NULL OR a.effective_to >= $1::date)) AS "isActive"
    FROM auditor_assignments a
    JOIN app_users su ON su.id = a.sale_id
    JOIN app_users au ON au.id = a.auditor_id
    LEFT JOIN sales_profiles sp ON sp.id = a.sale_id
    LEFT JOIN auditor_profiles ap ON ap.id = a.auditor_id`;

/** Lists assignments. `isActive` is computed against today's Vietnam date, not stored state. */
export async function listAssignments(
  db: Queryable,
  options: { saleRef?: string; today?: string } = {}
): Promise<AuditorAssignment[]> {
  const today = options.today ?? vietnamToday();
  const values: unknown[] = [today];
  let where = '';
  if (options.saleRef) {
    values.push(options.saleRef);
    where = 'WHERE (a.sale_id = $2 OR sp.sale_code = $2)';
  }
  const res = await db.query<AuditorAssignment>(
    `${ASSIGNMENT_SELECT} ${where} ORDER BY a.effective_from DESC, a.created_at DESC`,
    values
  );
  return res.rows;
}

interface ExistingRow {
  id: string;
  saleId: string;
  auditorId: string;
  auditorName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

/**
 * Creates one assignment per sale in a SINGLE transaction (caller supplies the
 * transaction-bound client). Either every sale is assigned or none is.
 * Returns the rows exactly as read back from the database.
 */
export async function createAssignmentsInTransaction(
  client: Queryable,
  input: CreateAssignmentsInput,
  actor: AssignmentActor,
  now: Date = new Date()
): Promise<{ assignments: AuditorAssignment[]; message: string }> {
  const today = vietnamToday(now);
  const auditor = await resolveAuditor(client, input.auditorRef);

  const sales: PartyRow[] = [];
  for (const ref of input.saleRefs) sales.push(await resolveSale(client, ref));
  const uniqueSales = [...new Map(sales.map((s) => [s.id, s])).values()];

  // Deterministic lock order prevents deadlocks between concurrent requests.
  const lockOrder = [...uniqueSales].sort((a, b) => a.id.localeCompare(b.id));
  for (const sale of lockOrder) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auditor_assignments:${sale.id}`]);
  }

  const createdIds: string[] = [];
  const notes: string[] = [];

  for (const sale of uniqueSales) {
    const existingRes = await client.query<ExistingRow>(
      `SELECT id, sale_id AS "saleId", auditor_id AS "auditorId",
              COALESCE(snapshot_auditor_name, '') AS "auditorName",
              to_char(effective_from, 'YYYY-MM-DD') AS "effectiveFrom",
              to_char(effective_to, 'YYYY-MM-DD') AS "effectiveTo",
              is_active AS "isActive"
         FROM auditor_assignments
        WHERE sale_id = $1
        ORDER BY effective_from ASC`,
      [sale.id]
    );
    const existing = existingRes.rows;

    // Duplicate guard: the sale already belongs to this auditor from an earlier
    // date with no end date -> a second row would only create a redundant chain link.
    const openEnded = existing.find((a) => !a.effectiveTo);
    if (openEnded && openEnded.auditorId === auditor.id && openEnded.effectiveFrom <= input.effectiveFrom) {
      throw new AssignmentError(
        409,
        'DUPLICATE_ASSIGNMENT',
        `${sale.name} đã được phân công cho ${auditor.name} (từ ${openEnded.effectiveFrom}, chưa kết thúc). Không tạo phân công trùng lặp.`
      );
    }

    const resolution = resolveAssignmentChain(
      existing.map((a) => ({
        ...a,
        saleName: sale.name,
        teamName: sale.teamName ?? 'Chưa có team',
        assignmentReason: '',
        createdBy: '',
        createdAt: '',
      })),
      {
        saleId: sale.id,
        auditorId: auditor.id,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        createdBy: actor.name,
        saleName: sale.name,
        teamName: sale.teamName ?? 'Chưa có team',
        auditorName: auditor.name,
        todayStr: today,
      }
    );
    if (!resolution.success) {
      throw new AssignmentError(409, 'ASSIGNMENT_CONFLICT', `${sale.name}: ${resolution.message}`);
    }

    // Close ONLY the specific open-ended row (never every NULL-ended row of the sale).
    if (openEnded) {
      const dayBefore = getDayBefore(input.effectiveFrom);
      await client.query(
        `UPDATE auditor_assignments
            SET effective_to = $1::date,
                is_active = (effective_from <= $2::date AND $1::date >= $2::date)
          WHERE id = $3`,
        [dayBefore, today, openEnded.id]
      );
      notes.push(`${sale.name}: phân công trước đó chốt đến hết ${dayBefore}`);
    }

    const id = `ASG-${randomUUID()}`;
    await client.query(
      `INSERT INTO auditor_assignments (
         id, sale_id, auditor_id, effective_from, effective_to,
         assignment_reason, created_by, is_active,
         snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
       ) VALUES ($1, $2, $3, $4::date, NULL, $5, $6, ($4::date <= $7::date), $8, $9, $10)`,
      [
        id,
        sale.id,
        auditor.id,
        input.effectiveFrom,
        input.reason,
        actor.name,
        today,
        sale.name,
        auditor.name,
        sale.teamName ?? 'Chưa có team',
      ]
    );
    createdIds.push(id);

    await client.query(
      `INSERT INTO audit_trail_events (id, actor_name, actor_role, actor_user_id, action_type, description, details, metadata)
       VALUES ($1, $2, $3, $4, 'AUDITOR_ASSIGNMENT_UPDATED', $5, $6, $7::jsonb)`,
      [
        `TRL-${randomUUID()}`,
        actor.name,
        actor.role,
        actor.id,
        `${actor.role === 'ADMIN' ? 'Admin' : 'Head Auditor'} phân công ${sale.name} cho ${auditor.name} từ ${input.effectiveFrom}.`,
        `Lý do: ${input.reason}`,
        JSON.stringify({ assignmentId: id, saleId: sale.id, auditorId: auditor.id, effectiveFrom: input.effectiveFrom }),
      ]
    );
  }

  // Read-back inside the same transaction: proves the rows are visible before COMMIT.
  const readBack = await client.query<AuditorAssignment>(
    `${ASSIGNMENT_SELECT} WHERE a.id = ANY($2::text[]) ORDER BY a.created_at ASC`,
    [today, createdIds]
  );
  if (readBack.rows.length !== createdIds.length) {
    throw new AssignmentError(500, 'READ_BACK_MISMATCH', 'Không đọc lại được đầy đủ bản ghi phân công vừa tạo; giao dịch đã được hủy.');
  }

  const message =
    `Đã lưu phân công ${readBack.rows.length} Sale cho ${auditor.name}, hiệu lực từ ${input.effectiveFrom}.` +
    (notes.length ? ` ${notes.join('; ')}.` : '');
  return { assignments: readBack.rows, message };
}

/** Maps low-level PostgreSQL errors to HTTP-friendly AssignmentErrors. Unknown errors pass through. */
export function toAssignmentError(err: unknown): AssignmentError | null {
  if (err instanceof AssignmentError) return err;
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case '23P01':
      return new AssignmentError(409, 'ASSIGNMENT_OVERLAP', 'Xung đột ngày hiệu lực: Sale này đã có phân công trùng khoảng ngày. Không có thay đổi nào được lưu.');
    case '23503':
      return new AssignmentError(400, 'INVALID_REFERENCE', 'Sale hoặc Auditor không hợp lệ (không tồn tại trong hệ thống). Không có thay đổi nào được lưu.');
    case '23505':
      return new AssignmentError(409, 'DUPLICATE_ASSIGNMENT', 'Phân công bị trùng lặp. Không có thay đổi nào được lưu.');
    case '23514':
    case '22007':
    case '22008':
      return new AssignmentError(400, 'INVALID_DATE', 'Ngày hiệu lực không hợp lệ. Không có thay đổi nào được lưu.');
    default:
      return null;
  }
}
