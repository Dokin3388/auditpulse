// AuditPulse Data Onboarding & Validation Engine
// Phase 1.5 Compliant with Operating Specification v1.1
import type pg from 'pg';

export type EntityType =
  | 'TEAMS'
  | 'USERS'
  | 'AUDITORS'
  | 'SALES'
  | 'ASSIGNMENTS'
  | 'ISSUES'
  | 'SLA'
  | 'CUSTOMERS'
  | 'QUOTATIONS'
  | 'ORDERS'
  | 'SALE_TEAM_HISTORY';

export interface RowValidationError {
  rowNumber: number;
  field: string;
  error: string;
  rawValue?: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  entityType: EntityType;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  hasErrors: boolean;
  errors: RowValidationError[];
  rows: Record<string, any>[];
}

export interface CommitResult {
  batchId: string;
  entityType: EntityType;
  totalRows: number;
  successRows: number;
  failedRows: number;
  auditEventId: string;
}

/**
 * RFC 4180 Compliant CSV Parser
 * Handles commas inside quotes, escaped quotes, multiline fields, and BOM.
 */
export function parseCsv(csvText: string): { headers: string[]; rows: Record<string, string>[]; rawLineNumbers: number[] } {
  // Strip UTF-8 BOM
  const cleanText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n');

  let headerRow: string[] | null = null;
  const parsedRows: Record<string, string>[] = [];
  const rawLineNumbers: number[] = [];

  let currentRecord: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let recordStartLine = 1;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNumber = lineIdx + 1;

    // Skip standalone comment lines or empty lines when not inside quotes
    if (!insideQuotes && (line.trim().startsWith('#') || line.trim() === '')) {
      continue;
    }

    if (currentRecord.length === 0 && currentField === '') {
      recordStartLine = lineNumber;
    }

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRecord.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (!insideQuotes) {
      currentRecord.push(currentField.trim());
      currentField = '';

      if (!headerRow) {
        headerRow = currentRecord.map((h) => h.trim());
      } else {
        const rowObj: Record<string, string> = {};
        for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
          const colName = headerRow[colIdx];
          rowObj[colName] = currentRecord[colIdx] ?? '';
        }
        parsedRows.push(rowObj);
        rawLineNumbers.push(recordStartLine);
      }
      currentRecord = [];
    } else {
      currentField += '\n';
    }
  }

  return {
    headers: headerRow ?? [],
    rows: parsedRows,
    rawLineNumbers,
  };
}

/**
 * Main Data Validator Engine
 */
export async function validateEntityData(
  entityType: EntityType,
  rows: Record<string, any>[],
  lineNumbers: number[],
  client?: pg.PoolClient | null
): Promise<ValidationResult> {
  const errors: RowValidationError[] = [];

  switch (entityType) {
    case 'TEAMS':
      await validateTeams(rows, lineNumbers, errors, client);
      break;
    case 'USERS':
      await validateUsers(rows, lineNumbers, errors, client);
      break;
    case 'AUDITORS':
      await validateAuditors(rows, lineNumbers, errors, client);
      break;
    case 'SALES':
      await validateSales(rows, lineNumbers, errors, client);
      break;
    case 'ASSIGNMENTS':
      await validateAssignments(rows, lineNumbers, errors, client);
      break;
    case 'ISSUES':
      await validateIssues(rows, lineNumbers, errors, client);
      break;
    case 'SLA':
      await validateSla(rows, lineNumbers, errors, client);
      break;
    case 'CUSTOMERS':
      await validateCustomers(rows, lineNumbers, errors, client);
      break;
    case 'QUOTATIONS':
      await validateQuotations(rows, lineNumbers, errors, client);
      break;
    case 'ORDERS':
      await validateOrders(rows, lineNumbers, errors, client);
      break;
    case 'SALE_TEAM_HISTORY':
      await validateSaleTeamHistory(rows, lineNumbers, errors, client);
      break;
    default:
      errors.push({
        rowNumber: 1,
        field: 'entity_type',
        error: `Không hỗ trợ entity_type: ${entityType}`,
        severity: 'ERROR',
      });
  }

  const errorRows = new Set(errors.filter((e) => e.severity === 'ERROR').map((e) => e.rowNumber));
  const invalidRowsCount = errorRows.size;
  const validRowsCount = rows.length - invalidRowsCount;

  return {
    entityType,
    totalRows: rows.length,
    validRowsCount: Math.max(0, validRowsCount),
    invalidRowsCount,
    hasErrors: errors.some((e) => e.severity === 'ERROR'),
    errors,
    rows,
  };
}

// ----------------------------------------------------------------------------
// Entity-Specific Validation Implementations
// ----------------------------------------------------------------------------

async function validateTeams(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();

  let dbExistingCodes = new Set<string>();
  if (client) {
    const res = await client.query('SELECT code FROM teams');
    dbExistingCodes = new Set(res.rows.map((r) => r.code));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.team_code || r.code || '').trim();
    const name = (r.team_name || r.name || '').trim();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'team_code', error: 'Mã team không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'team_code', error: `Mã team '${code}' bị trùng trong tệp import.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);

      if (dbExistingCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'team_code', error: `Mã team '${code}' đã tồn tại trên database.`, rawValue: code, severity: 'ERROR' });
      }
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'team_name', error: 'Tên team không được để trống.', severity: 'ERROR' });
    }
  }
}

async function validateUsers(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  const seenEmails = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const allowedRoles = ['HEAD_AUDITOR', 'TEAM_LEAD', 'ADMIN', 'AUDITOR', 'SALE'];

  let dbEmails = new Set<string>();
  if (client) {
    const res = await client.query('SELECT email FROM app_users');
    dbEmails = new Set(res.rows.map((r) => r.email));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const email = (r.email || '').trim().toLowerCase();
    const name = (r.name || '').trim();
    const role = (r.role || '').trim().toUpperCase();

    if (!email) {
      errors.push({ rowNumber: rowNum, field: 'email', error: 'Email không được để trống.', severity: 'ERROR' });
    } else if (!emailRegex.test(email)) {
      errors.push({ rowNumber: rowNum, field: 'email', error: `Định dạng email '${email}' không hợp lệ.`, rawValue: email, severity: 'ERROR' });
    } else {
      if (seenEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' bị trùng trong tệp import.`, rawValue: email, severity: 'ERROR' });
      }
      seenEmails.add(email);

      if (dbEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' đã tồn tại trên hệ thống.`, rawValue: email, severity: 'ERROR' });
      }
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'name', error: 'Họ tên không được để trống.', severity: 'ERROR' });
    }

    if (!role || !allowedRoles.includes(role)) {
      errors.push({ rowNumber: rowNum, field: 'role', error: `Vai trò '${role}' không hợp lệ. Cần thuộc: ${allowedRoles.join(', ')}`, rawValue: role, severity: 'ERROR' });
    }
  }
}

async function validateAuditors(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let dbCodes = new Set<string>();
  let dbEmails = new Set<string>();
  if (client) {
    const cRes = await client.query('SELECT auditor_code FROM auditor_profiles');
    dbCodes = new Set(cRes.rows.map((r) => r.auditor_code));
    const eRes = await client.query('SELECT email FROM app_users');
    dbEmails = new Set(eRes.rows.map((r) => r.email));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.auditor_code || '').trim();
    const name = (r.name || '').trim();
    const email = (r.email || '').trim().toLowerCase();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'auditor_code', error: 'Mã auditor không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'auditor_code', error: `Mã auditor '${code}' bị trùng trong file.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
      if (dbCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'auditor_code', error: `Mã auditor '${code}' đã tồn tại trên database.`, rawValue: code, severity: 'ERROR' });
      }
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'name', error: 'Họ tên auditor không được để trống.', severity: 'ERROR' });
    }

    if (!email) {
      errors.push({ rowNumber: rowNum, field: 'email', error: 'Email không được để trống.', severity: 'ERROR' });
    } else if (!emailRegex.test(email)) {
      errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' không đúng định dạng.`, rawValue: email, severity: 'ERROR' });
    } else {
      if (seenEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' bị trùng trong file.`, rawValue: email, severity: 'ERROR' });
      }
      seenEmails.add(email);
      if (dbEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' đã tồn tại trên hệ thống.`, rawValue: email, severity: 'ERROR' });
      }
    }
  }
}

async function validateSales(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let dbCodes = new Set<string>();
  let dbEmails = new Set<string>();
  let dbTeams = new Set<string>();

  if (client) {
    const cRes = await client.query('SELECT sale_code FROM sales_profiles');
    dbCodes = new Set(cRes.rows.map((r) => r.sale_code));
    const eRes = await client.query('SELECT email FROM app_users');
    dbEmails = new Set(eRes.rows.map((r) => r.email));
    const tRes = await client.query('SELECT code FROM teams');
    dbTeams = new Set(tRes.rows.map((r) => r.code));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.sale_code || '').trim();
    const name = (r.name || '').trim();
    const email = (r.email || '').trim().toLowerCase();
    const teamCode = (r.team_code || '').trim();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: 'Mã sale không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'sale_code', error: `Mã sale '${code}' bị trùng trong tệp import.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
      if (dbCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'sale_code', error: `Mã sale '${code}' đã tồn tại trên database.`, rawValue: code, severity: 'ERROR' });
      }
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'name', error: 'Họ tên sale không được để trống.', severity: 'ERROR' });
    }

    if (!email) {
      errors.push({ rowNumber: rowNum, field: 'email', error: 'Email không được để trống.', severity: 'ERROR' });
    } else if (!emailRegex.test(email)) {
      errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' không đúng định dạng.`, rawValue: email, severity: 'ERROR' });
    } else {
      if (seenEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' bị trùng trong file.`, rawValue: email, severity: 'ERROR' });
      }
      seenEmails.add(email);
      if (dbEmails.has(email)) {
        errors.push({ rowNumber: rowNum, field: 'email', error: `Email '${email}' đã tồn tại trên database.`, rawValue: email, severity: 'ERROR' });
      }
    }

    // MANDATORY RULE: Sale bắt buộc có team
    if (!teamCode) {
      errors.push({
        rowNumber: rowNum,
        field: 'team_code',
        error: 'Sale bắt buộc có team: Cột team_code không được để trống.',
        severity: 'ERROR',
      });
    } else if (client && !dbTeams.has(teamCode)) {
      errors.push({
        rowNumber: rowNum,
        field: 'team_code',
        error: `Mã team '${teamCode}' không tồn tại trong danh mục Teams.`,
        rawValue: teamCode,
        severity: 'ERROR',
      });
    }
  }
}

async function validateAssignments(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  let dbSales = new Set<string>();
  let dbAuditors = new Set<string>();
  let dbAssignments: { sale_id: string; effective_from: string; effective_to: string | null }[] = [];

  if (client) {
    const sRes = await client.query('SELECT u.id, s.sale_code FROM sales_profiles s JOIN app_users u ON u.id = s.id');
    dbSales = new Set(sRes.rows.flatMap((r) => [r.id, r.sale_code]));

    const aRes = await client.query('SELECT u.id, a.auditor_code FROM auditor_profiles a JOIN app_users u ON u.id = a.id');
    dbAuditors = new Set(aRes.rows.flatMap((r) => [r.id, r.auditor_code]));

    const asgRes = await client.query('SELECT sale_id, effective_from::text, effective_to::text FROM auditor_assignments WHERE is_active = true');
    dbAssignments = asgRes.rows;
  }

  // Track intervals per sale within batch
  const batchIntervalsBySale = new Map<string, { from: string; to: string; rowNum: number }[]>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const saleCode = (r.sale_code || r.sale_id || '').trim();
    const auditorCode = (r.auditor_code || r.auditor_id || '').trim();
    const effectiveFrom = (r.effective_from || '').trim();
    const effectiveTo = (r.effective_to || '').trim() || null;
    const reason = (r.assignment_reason || '').trim();

    if (!saleCode) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: 'Mã sale không được để trống.', severity: 'ERROR' });
    } else if (client && !dbSales.has(saleCode)) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: `Mã sale '${saleCode}' không tồn tại trong hệ thống.`, rawValue: saleCode, severity: 'ERROR' });
    }

    if (!auditorCode) {
      errors.push({ rowNumber: rowNum, field: 'auditor_code', error: 'Mã auditor không được để trống.', severity: 'ERROR' });
    } else if (client && !dbAuditors.has(auditorCode)) {
      errors.push({ rowNumber: rowNum, field: 'auditor_code', error: `Mã auditor '${auditorCode}' không tồn tại trong hệ thống.`, rawValue: auditorCode, severity: 'ERROR' });
    }

    if (!effectiveFrom || isNaN(Date.parse(effectiveFrom))) {
      errors.push({ rowNumber: rowNum, field: 'effective_from', error: 'effective_from phải có định dạng ngày hợp lệ (YYYY-MM-DD).', rawValue: effectiveFrom, severity: 'ERROR' });
    }

    if (effectiveTo && isNaN(Date.parse(effectiveTo))) {
      errors.push({ rowNumber: rowNum, field: 'effective_to', error: 'effective_to phải có định dạng ngày hợp lệ (YYYY-MM-DD).', rawValue: effectiveTo, severity: 'ERROR' });
    }

    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      errors.push({ rowNumber: rowNum, field: 'effective_to', error: `effective_to (${effectiveTo}) không được nhỏ hơn effective_from (${effectiveFrom}).`, severity: 'ERROR' });
    }

    if (!reason) {
      errors.push({ rowNumber: rowNum, field: 'assignment_reason', error: 'Lý do phân công không được để trống (bắt buộc cho Audit Trail).', severity: 'ERROR' });
    }

    // MANDATORY RULE: Chống overlap trong cùng batch
    if (saleCode && effectiveFrom) {
      const existingInBatch = batchIntervalsBySale.get(saleCode) || [];
      const newTo = effectiveTo || '9999-12-31';

      for (const item of existingInBatch) {
        const overlap = !(effectiveFrom > item.to || newTo < item.from);
        if (overlap) {
          errors.push({
            rowNumber: rowNum,
            field: 'effective_from',
            error: `Trùng lặp phân công trong batch: Sale '${saleCode}' bị chồng ngày [${effectiveFrom} đến ${effectiveTo || 'mở'}] với dòng ${item.rowNum} [${item.from} đến ${item.to === '9999-12-31' ? 'mở' : item.to}].`,
            severity: 'ERROR',
          });
        }
      }
      existingInBatch.push({ from: effectiveFrom, to: newTo, rowNum });
      batchIntervalsBySale.set(saleCode, existingInBatch);

      // Check overlap against Neon DB assignments
      if (client) {
        const dbSaleAsgs = dbAssignments.filter((a) => a.sale_id === saleCode);
        for (const da of dbSaleAsgs) {
          const dbTo = da.effective_to || '9999-12-31';
          const overlap = !(effectiveFrom > dbTo || newTo < da.effective_from);
          if (overlap) {
            errors.push({
              rowNumber: rowNum,
              field: 'effective_from',
              error: `Xung đột ngày với DB: Sale '${saleCode}' đang có phân công hiệu lực từ ${da.effective_from} đến ${da.effective_to || 'mở'}.`,
              severity: 'ERROR',
            });
          }
        }
      }
    }
  }
}

async function validateIssues(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();
  const allowedSeverities = ['LOW', 'MEDIUM', 'HIGH'];

  let dbCodes = new Set<string>();
  if (client) {
    const res = await client.query('SELECT issue_code FROM issue_definitions');
    dbCodes = new Set(res.rows.map((r) => r.issue_code));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.issue_code || '').trim();
    const name = (r.issue_name || '').trim();
    const groupCode = (r.issue_group_code || '').trim();
    const severity = (r.severity || '').trim().toUpperCase();
    const approvedStr = String(r.is_definition_complete ?? r.approved ?? '').trim().toLowerCase();
    const isApproved = approvedStr === 'true' || approvedStr === '1';

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'issue_code', error: 'Mã issue không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'issue_code', error: `Mã issue '${code}' bị trùng trong file.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
      if (dbCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'issue_code', error: `Mã issue '${code}' đã tồn tại trên database.`, rawValue: code, severity: 'ERROR' });
      }
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'issue_name', error: 'Tên lỗi không được để trống.', severity: 'ERROR' });
    }

    if (!groupCode) {
      errors.push({ rowNumber: rowNum, field: 'issue_group_code', error: 'Mã nhóm lỗi không được để trống.', severity: 'ERROR' });
    }

    if (!severity || !allowedSeverities.includes(severity)) {
      errors.push({ rowNumber: rowNum, field: 'severity', error: `Mức độ nghiêm trọng '${severity}' không hợp lệ. Cần thuộc: LOW, MEDIUM, HIGH.`, rawValue: severity, severity: 'ERROR' });
    }

    // MANDATORY RULE: Chỉ issue catalog đã duyệt mới dùng cho chế tài tự động
    if (!isApproved) {
      errors.push({
        rowNumber: rowNum,
        field: 'is_definition_complete',
        error: `Lỗi '${code}' chưa được phê duyệt (is_definition_complete = false). Chỉ issue đã duyệt mới được kích hoạt chế tài tự động.`,
        rawValue: approvedStr,
        severity: 'WARNING',
      });
    }
  }
}

async function validateSla(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  _client?: pg.PoolClient | null
) {
  const allowedTypes = ['ISSUE', 'GROUP'];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const type = (r.target_type || '').trim().toUpperCase();
    const code = (r.target_code || '').trim();
    const actionHours = Number(r.action_due_hours);
    const recheckHours = Number(r.recheck_due_hours);
    const maxRechecks = Number(r.max_rechecks);

    if (!type || !allowedTypes.includes(type)) {
      errors.push({ rowNumber: rowNum, field: 'target_type', error: "target_type phải là 'ISSUE' hoặc 'GROUP'.", rawValue: type, severity: 'ERROR' });
    }

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'target_code', error: 'target_code không được để trống.', severity: 'ERROR' });
    }

    if (isNaN(actionHours) || actionHours <= 0) {
      errors.push({ rowNumber: rowNum, field: 'action_due_hours', error: 'Hạn action (giờ) phải là số nguyên dương > 0.', rawValue: String(r.action_due_hours), severity: 'ERROR' });
    }

    if (isNaN(recheckHours) || recheckHours <= 0) {
      errors.push({ rowNumber: rowNum, field: 'recheck_due_hours', error: 'Hạn recheck (giờ) phải là số nguyên dương > 0.', rawValue: String(r.recheck_due_hours), severity: 'ERROR' });
    }

    if (isNaN(maxRechecks) || maxRechecks < 1) {
      errors.push({ rowNumber: rowNum, field: 'max_rechecks', error: 'Số lần recheck tối đa phải >= 1.', rawValue: String(r.max_rechecks), severity: 'ERROR' });
    }
  }
}

async function validateCustomers(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  _client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.customer_code || r.code || '').trim();
    const name = (r.customer_name || r.name || '').trim();
    const saleCode = (r.current_sale_code || r.current_sale_id || '').trim();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'customer_code', error: 'Mã khách hàng không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'customer_code', error: `Mã khách '${code}' bị trùng trong file.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
    }

    if (!name) {
      errors.push({ rowNumber: rowNum, field: 'customer_name', error: 'Tên khách hàng không được để trống.', severity: 'ERROR' });
    }

    if (!saleCode) {
      errors.push({ rowNumber: rowNum, field: 'current_sale_code', error: 'Sale phụ trách hiện tại không được để trống.', severity: 'ERROR' });
    }
  }
}

async function validateQuotations(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  _client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();
  const allowedStatuses = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REJECTED'];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.quote_code || r.code || '').trim();
    const custCode = (r.customer_code || r.customer_id || '').trim();
    const saleCode = (r.sale_code || r.sale_id || '').trim();
    const amount = Number(r.total_amount);
    const status = (r.status || '').trim().toUpperCase();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'quote_code', error: 'Mã báo giá không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'quote_code', error: `Mã báo giá '${code}' bị trùng trong file.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
    }

    if (!custCode) {
      errors.push({ rowNumber: rowNum, field: 'customer_code', error: 'Mã khách hàng không được để trống.', severity: 'ERROR' });
    }

    if (!saleCode) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: 'Mã sale không được để trống.', severity: 'ERROR' });
    }

    if (isNaN(amount) || amount < 0) {
      errors.push({ rowNumber: rowNum, field: 'total_amount', error: 'Giá trị báo giá phải >= 0.', rawValue: String(r.total_amount), severity: 'ERROR' });
    }

    if (!status || !allowedStatuses.includes(status)) {
      errors.push({ rowNumber: rowNum, field: 'status', error: `Trạng thái báo giá '${status}' không hợp lệ (cần: ${allowedStatuses.join(', ')}).`, rawValue: status, severity: 'ERROR' });
    }
  }
}

async function validateOrders(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  _client?: pg.PoolClient | null
) {
  const seenCodes = new Set<string>();
  const allowedStatuses = ['VALID', 'DRAFT', 'CANCELLED', 'REFUNDED'];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const code = (r.order_code || r.code || '').trim();
    const custCode = (r.customer_code || r.customer_id || '').trim();
    const saleCode = (r.sale_code || r.sale_id || '').trim();
    const amount = Number(r.total_amount);
    const status = (r.status || '').trim().toUpperCase();

    if (!code) {
      errors.push({ rowNumber: rowNum, field: 'order_code', error: 'Mã đơn hàng không được để trống.', severity: 'ERROR' });
    } else {
      if (seenCodes.has(code)) {
        errors.push({ rowNumber: rowNum, field: 'order_code', error: `Mã đơn '${code}' bị trùng trong file.`, rawValue: code, severity: 'ERROR' });
      }
      seenCodes.add(code);
    }

    if (!custCode) {
      errors.push({ rowNumber: rowNum, field: 'customer_code', error: 'Mã khách hàng không được để trống.', severity: 'ERROR' });
    }

    if (!saleCode) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: 'Mã sale không được để trống.', severity: 'ERROR' });
    }

    if (isNaN(amount) || amount < 0) {
      errors.push({ rowNumber: rowNum, field: 'total_amount', error: 'Giá trị đơn hàng phải >= 0.', rawValue: String(r.total_amount), severity: 'ERROR' });
    }

    if (!status || !allowedStatuses.includes(status)) {
      errors.push({ rowNumber: rowNum, field: 'status', error: `Trạng thái đơn '${status}' không hợp lệ (cần: ${allowedStatuses.join(', ')}).`, rawValue: status, severity: 'ERROR' });
    }
  }
}

async function validateSaleTeamHistory(
  rows: Record<string, any>[],
  lineNumbers: number[],
  errors: RowValidationError[],
  _client?: pg.PoolClient | null
) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = lineNumbers[i] ?? i + 2;
    const saleCode = (r.sale_code || '').trim();
    const newTeam = (r.new_team_code || '').trim();
    const changedDate = (r.changed_date || '').trim();

    if (!saleCode) {
      errors.push({ rowNumber: rowNum, field: 'sale_code', error: 'Mã sale không được để trống.', severity: 'ERROR' });
    }

    if (!newTeam) {
      errors.push({ rowNumber: rowNum, field: 'new_team_code', error: 'Mã team mới không được để trống.', severity: 'ERROR' });
    }

    if (!changedDate || isNaN(Date.parse(changedDate))) {
      errors.push({ rowNumber: rowNum, field: 'changed_date', error: 'Ngày chuyển team không hợp lệ.', rawValue: changedDate, severity: 'ERROR' });
    }
  }
}

// ----------------------------------------------------------------------------
// Transactional Database Commit Engine
// ----------------------------------------------------------------------------

export async function commitImportBatch(
  entityType: EntityType,
  fileName: string,
  rows: Record<string, any>[],
  importedBy: string,
  validationReport: RowValidationError[],
  client: pg.PoolClient
): Promise<CommitResult> {
  const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const auditEventId = `EVT-IMPORT-${Date.now()}`;

  await client.query('BEGIN');
  try {
    let successCount = 0;

    switch (entityType) {
      case 'TEAMS':
        for (const r of rows) {
          const id = r.team_code || r.code;
          const code = (r.team_code || r.code).trim();
          const name = (r.team_name || r.name).trim();
          await client.query(
            `INSERT INTO teams (id, code, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
            [id, code, name]
          );
          successCount++;
        }
        break;

      case 'USERS':
        for (const r of rows) {
          const id = r.email.trim().toLowerCase();
          await client.query(
            `INSERT INTO app_users (id, email, name, role, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
            [id, r.email.trim().toLowerCase(), r.name.trim(), r.role.trim().toUpperCase(), r.is_active !== 'false']
          );
          successCount++;
        }
        break;

      case 'AUDITORS':
        for (const r of rows) {
          const userId = r.email.trim().toLowerCase();
          const code = r.auditor_code.trim();
          const cap = Number(r.max_daily_capacity) || 80;

          await client.query(
            `INSERT INTO app_users (id, email, name, role, is_active)
             VALUES ($1, $2, $3, 'AUDITOR', $4)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = 'AUDITOR', is_active = EXCLUDED.is_active`,
            [userId, r.email.trim().toLowerCase(), r.name.trim(), r.is_active !== 'false']
          );

          await client.query(
            `INSERT INTO auditor_profiles (id, auditor_code, max_daily_capacity)
             VALUES ($1, $2, $3)
             ON CONFLICT (auditor_code) DO UPDATE SET max_daily_capacity = EXCLUDED.max_daily_capacity`,
            [userId, code, cap]
          );
          successCount++;
        }
        break;

      case 'SALES':
        for (const r of rows) {
          const userId = r.email.trim().toLowerCase();
          const code = r.sale_code.trim();
          const teamCode = r.team_code.trim();

          // Resolve team ID
          const teamRes = await client.query('SELECT id FROM teams WHERE code = $1', [teamCode]);
          const teamId = teamRes.rows[0]?.id || teamCode;

          await client.query(
            `INSERT INTO app_users (id, email, name, role, is_active)
             VALUES ($1, $2, $3, 'SALE', $4)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = 'SALE', is_active = EXCLUDED.is_active`,
            [userId, r.email.trim().toLowerCase(), r.name.trim(), r.is_active !== 'false']
          );

          await client.query(
            `INSERT INTO sales_profiles (id, sale_code, team_id, phone)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (sale_code) DO UPDATE SET team_id = EXCLUDED.team_id, phone = EXCLUDED.phone`,
            [userId, code, teamId, r.phone || null]
          );
          successCount++;
        }
        break;

      case 'ASSIGNMENTS':
        for (const r of rows) {
          const id = `ASG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const saleId = r.sale_code || r.sale_id;
          const auditorId = r.auditor_code || r.auditor_id;
          const from = r.effective_from;
          const to = r.effective_to ? r.effective_to : null;
          const reason = r.assignment_reason || 'Batch Import Onboarding';

          // Resolve User IDs if given codes
          const sRes = await client.query('SELECT id FROM sales_profiles WHERE sale_code = $1 OR id = $1', [saleId]);
          const resolvedSaleId = sRes.rows[0]?.id || saleId;

          const aRes = await client.query('SELECT id FROM auditor_profiles WHERE auditor_code = $1 OR id = $1', [auditorId]);
          const resolvedAuditorId = aRes.rows[0]?.id || auditorId;

          await client.query(
            `INSERT INTO auditor_assignments (id, sale_id, auditor_id, effective_from, effective_to, assignment_reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, resolvedSaleId, resolvedAuditorId, from, to, reason, importedBy]
          );
          successCount++;
        }
        break;

      case 'ISSUES':
        for (const r of rows) {
          const id = r.issue_code.trim();
          const approvedStr = String(r.is_definition_complete ?? r.approved ?? '').trim().toLowerCase();
          const isApproved = approvedStr === 'true' || approvedStr === '1';

          await client.query(
            `INSERT INTO issue_definitions (
               id, issue_code, issue_name, issue_group_code, issue_group_name,
               severity, hard_fail, is_definition_complete, is_current, version, recheck_guidance_template
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)
             ON CONFLICT (issue_code) DO UPDATE SET
               issue_name = EXCLUDED.issue_name,
               severity = EXCLUDED.severity,
               hard_fail = EXCLUDED.hard_fail,
               is_definition_complete = EXCLUDED.is_definition_complete,
               recheck_guidance_template = EXCLUDED.recheck_guidance_template`,
            [
              id,
              r.issue_code.trim(),
              r.issue_name.trim(),
              r.issue_group_code.trim(),
              r.issue_group_name?.trim() || r.issue_group_code.trim(),
              r.severity.trim().toUpperCase(),
              String(r.hard_fail).toLowerCase() === 'true',
              isApproved,
              r.version?.trim() || 'v1.4',
              r.recheck_guidance_template?.trim() || null,
            ]
          );
          successCount++;
        }
        break;

      case 'SLA':
        for (const r of rows) {
          const id = `SLA-${r.target_code.trim()}-${r.rule_version?.trim() || 'v1.4'}`;
          await client.query(
            `INSERT INTO sla_configurations (
               id, target_type, target_code, target_name, action_due_hours, recheck_due_hours, max_rechecks, rule_version, is_active
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (target_code, rule_version) DO UPDATE SET
               action_due_hours = EXCLUDED.action_due_hours,
               recheck_due_hours = EXCLUDED.recheck_due_hours,
               max_rechecks = EXCLUDED.max_rechecks,
               is_active = EXCLUDED.is_active,
               updated_at = NOW()`,
            [
              id,
              r.target_type.trim().toUpperCase(),
              r.target_code.trim(),
              r.target_name?.trim() || null,
              Number(r.action_due_hours) || 48,
              Number(r.recheck_due_hours) || 24,
              Number(r.max_rechecks) || 3,
              r.rule_version?.trim() || 'v1.4',
              r.is_active !== 'false',
            ]
          );
          successCount++;
        }
        break;

      case 'CUSTOMERS':
        for (const r of rows) {
          const id = r.customer_code.trim();
          await client.query(
            `INSERT INTO customers (id, code, name, phone, company, channel, first_seen_date, current_sale_id, current_team_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (code) DO UPDATE SET
               name = EXCLUDED.name,
               phone = EXCLUDED.phone,
               company = EXCLUDED.company,
               current_sale_id = EXCLUDED.current_sale_id,
               current_team_id = EXCLUDED.current_team_id`,
            [
              id,
              r.customer_code.trim(),
              r.customer_name.trim(),
              r.phone || null,
              r.company || null,
              r.channel || 'Direct Web',
              r.first_seen_date || new Date().toISOString(),
              r.current_sale_code || null,
              r.current_team_code || null,
            ]
          );
          successCount++;
        }
        break;

      case 'QUOTATIONS':
        for (const r of rows) {
          const id = r.quote_code.trim();
          await client.query(
            `INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status, items_summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (code) DO UPDATE SET total_amount = EXCLUDED.total_amount, status = EXCLUDED.status`,
            [
              id,
              r.quote_code.trim(),
              r.customer_code.trim(),
              r.sale_code.trim(),
              r.quote_date || new Date().toISOString(),
              Number(r.total_amount) || 0,
              r.status.trim().toUpperCase(),
              r.items_summary || null,
            ]
          );
          successCount++;
        }
        break;

      case 'ORDERS':
        for (const r of rows) {
          const id = r.order_code.trim();
          await client.query(
            `INSERT INTO sales_orders (id, code, customer_id, sale_id, quotation_id, order_date, total_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (code) DO UPDATE SET total_amount = EXCLUDED.total_amount, status = EXCLUDED.status`,
            [
              id,
              r.order_code.trim(),
              r.customer_code.trim(),
              r.sale_code.trim(),
              r.quote_code?.trim() || null,
              r.order_date || new Date().toISOString(),
              Number(r.total_amount) || 0,
              r.status.trim().toUpperCase(),
            ]
          );
          successCount++;
        }
        break;

      case 'SALE_TEAM_HISTORY':
        for (const r of rows) {
          const id = `HIST-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await client.query(
            `INSERT INTO sale_team_history (id, sale_id, old_team_id, new_team_id, changed_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              r.sale_code.trim(),
              r.old_team_code?.trim() || null,
              r.new_team_code.trim(),
              r.changed_date || new Date().toISOString(),
              r.notes || null,
            ]
          );
          successCount++;
        }
        break;
    }

    // 1. Log import batch
    await client.query(
      `INSERT INTO data_import_batches (
         id, entity_type, file_name, total_rows, success_rows, failed_rows, imported_by, status, validation_report
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMMITTED', $8)`,
      [
        batchId,
        entityType,
        fileName,
        rows.length,
        successCount,
        rows.length - successCount,
        importedBy,
        JSON.stringify(validationReport),
      ]
    );

    // 2. Log audit trail event
    await client.query(
      `INSERT INTO audit_trail_events (
         id, timestamp, actor_name, actor_role, action_type, description, details, metadata
       ) VALUES ($1, NOW(), $2, 'HEAD_AUDITOR', 'DATA_ONBOARDING_IMPORT', $3, $4, $5)`,
      [
        auditEventId,
        importedBy,
        `Data Onboarding: Import ${successCount}/${rows.length} bản ghi ${entityType}`,
        `Tệp nguồn: ${fileName}. Batch ID: ${batchId}`,
        JSON.stringify({ entityType, batchId, fileName, totalRows: rows.length, successCount }),
      ]
    );

    // 3. Update source sync logs for operational sources
    if (['CUSTOMERS', 'QUOTATIONS', 'ORDERS'].includes(entityType)) {
      const sourceMap: Record<string, string> = {
        CUSTOMERS: 'Khách hàng (CRM)',
        QUOTATIONS: 'Báo giá (ERP)',
        ORDERS: 'Đơn hàng (POS)',
      };
      const logId = `SYNC-LOG-${entityType}`;
      await client.query(
        `INSERT INTO source_sync_logs (id, source_name, last_sync_time, record_count, status, notes)
         VALUES ($1, $2, NOW(), $3, 'SYNCED', $4)
         ON CONFLICT (id) DO UPDATE SET
           last_sync_time = NOW(),
           record_count = EXCLUDED.record_count,
           status = 'SYNCED',
           notes = EXCLUDED.notes`,
        [logId, sourceMap[entityType], successCount, `Đồng bộ qua batch import ${fileName}`]
      );
    }

    await client.query('COMMIT');

    return {
      batchId,
      entityType,
      totalRows: rows.length,
      successRows: successCount,
      failedRows: rows.length - successCount,
      auditEventId,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
