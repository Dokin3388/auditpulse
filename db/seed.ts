// AuditPulse - Database Seeder for Neon PostgreSQL
// Populates Neon with comprehensive production-grade mock dataset
import dotenv from 'dotenv';
import pg from 'pg';
import {
  mockCustomers,
  mockQuotations,
  mockSalesOrders,
  mockIssueDefinitions,
  mockAuditQueueItems,
  mockAuditCases,
  mockCorrectiveActions,
  mockAuditorAssignments,
  mockSourceSyncLogs,
  mockAuditTrailEvents,
  mockRescuedOrders,
} from '../src/services/mockData.ts';

dotenv.config();

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Lỗi: DATABASE_URL chưa được thiết lập.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runSeed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Đang nạp dữ liệu mẫu (Seeding) vào Neon PostgreSQL...');
    await client.query('BEGIN');

    // 1. Teams
    const teams = [
      { id: 'TEAM-NORTH', code: 'TEAM_NORTH', name: 'Team B2B Miền Bắc' },
      { id: 'TEAM-ENT', code: 'TEAM_ENT', name: 'Team Enterprise' },
      { id: 'TEAM-KEY', code: 'TEAM_KEY', name: 'Team Key Account' },
      { id: 'TEAM-SOUTH', code: 'TEAM_SOUTH', name: 'Team B2B Miền Nam' },
    ];

    for (const t of teams) {
      await client.query(
        `INSERT INTO teams (id, code, name) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [t.id, t.code, t.name]
      );
    }
    console.log(`✅ Đã nạp ${teams.length} Teams.`);

    // 2. Comprehensive Users (Canonical IDs matching sales/auditor codes)
    const allSeedUsers = [
      { id: 'USR-HEAD', email: 'thang.pd@auditpulse.vn', name: 'Phạm Đức Thắng', role: 'HEAD_AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
      { id: 'AUD-01', email: 'linh.nt@auditpulse.vn', name: 'Nguyễn Thùy Linh', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80' },
      { id: 'AUD-02', email: 'huy.tq@auditpulse.vn', name: 'Trần Quang Huy', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
      { id: 'AUD-03', email: 'trang.dt@auditpulse.vn', name: 'Đỗ Thu Trang', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-01', email: 'nam.vh@auditpulse.vn', name: 'Vũ Hải Nam', role: 'SALE', teamId: 'TEAM-NORTH', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-02', email: 'huong.lt@auditpulse.vn', name: 'Lê Thu Hương', role: 'SALE', teamId: 'TEAM-NORTH', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-03', email: 'tuan.hm@auditpulse.vn', name: 'Hoàng Minh Tuấn', role: 'SALE', teamId: 'TEAM-ENT', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-04', email: 'mai.dt@auditpulse.vn', name: 'Đào Thị Mai', role: 'SALE', teamId: 'TEAM-KEY', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-05', email: 'binh.tq@auditpulse.vn', name: 'Trịnh Quốc Bình', role: 'SALE', teamId: 'TEAM-SOUTH', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80' },
      { id: 'SALE-06', email: 'phuong.tm@auditpulse.vn', name: 'Trần Mai Phương', role: 'SALE', teamId: 'TEAM-SOUTH', avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80' },
      { id: 'USR-LEAD', email: 'phong.lv@auditpulse.vn', name: 'Lê Văn Phong', role: 'TEAM_LEAD', teamId: 'TEAM-NORTH', avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80' },
      // Aliases matching USR- prefix from demo UI
      { id: 'USR-AUD-01', email: 'linh.nt.alias@auditpulse.vn', name: 'Nguyễn Thùy Linh (Demo)', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80' },
      { id: 'USR-AUD-02', email: 'huy.tq.alias@auditpulse.vn', name: 'Trần Quang Huy (Demo)', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
      { id: 'USR-AUD-03', email: 'trang.dt.alias@auditpulse.vn', name: 'Đỗ Thu Trang (Demo)', role: 'AUDITOR', avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80' },
      { id: 'USR-SALE-01', email: 'nam.vh.alias@auditpulse.vn', name: 'Vũ Hải Nam (Demo)', role: 'SALE', teamId: 'TEAM-NORTH', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
      { id: 'USR-SALE-02', email: 'huong.lt.alias@auditpulse.vn', name: 'Lê Thu Hương (Demo)', role: 'SALE', teamId: 'TEAM-NORTH', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80' },
    ];

    for (const u of allSeedUsers) {
      await client.query(
        `INSERT INTO app_users (id, email, name, role, avatar_url, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role`,
        [u.id, u.email, u.name, u.role, u.avatarUrl]
      );

      // Link sales profile
      if (u.role === 'SALE') {
        await client.query(
          `INSERT INTO sales_profiles (id, sale_code, team_id, phone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET team_id = EXCLUDED.team_id`,
          [u.id, u.id, u.teamId || 'TEAM-NORTH', '0912 345 678']
        );
      }

      // Link auditor profile
      if (u.role === 'AUDITOR') {
        await client.query(
          `INSERT INTO auditor_profiles (id, auditor_code, max_daily_capacity, qa_agreement_rate)
           VALUES ($1, $2, 80, 95.5)
           ON CONFLICT (id) DO UPDATE SET auditor_code = EXCLUDED.auditor_code`,
          [u.id, u.id]
        );
      }
    }
    console.log(`✅ Đã nạp ${allSeedUsers.length} App Users & Profiles.`);

    // 3. Customers
    for (const c of mockCustomers) {
      await client.query(
        `INSERT INTO customers (id, code, name, phone, company, first_seen_date, channel, current_sale_id, current_team_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, current_team_id = EXCLUDED.current_team_id`,
        [
          c.id,
          c.code,
          c.name,
          c.phone,
          c.company,
          c.firstSeenDate,
          c.channel,
          c.currentSaleId,
          c.currentTeamId,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockCustomers.length} Customers.`);

    // 4. Quotations
    for (const q of mockQuotations) {
      await client.query(
        `INSERT INTO quotations (id, code, customer_id, sale_id, quote_date, total_amount, status, items_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET total_amount = EXCLUDED.total_amount, status = EXCLUDED.status`,
        [q.id, q.code, q.customerId, q.saleId, q.quoteDate, q.totalAmount, q.status, q.itemsSummary]
      );
    }
    console.log(`✅ Đã nạp ${mockQuotations.length} Quotations.`);

    // 5. Sales Orders
    for (const o of mockSalesOrders) {
      await client.query(
        `INSERT INTO sales_orders (id, code, customer_id, sale_id, quotation_id, order_date, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET total_amount = EXCLUDED.total_amount, status = EXCLUDED.status`,
        [
          o.id,
          o.code,
          o.customerId,
          o.saleId,
          o.quotationId || null,
          o.orderDate,
          o.totalAmount,
          o.status,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockSalesOrders.length} Sales Orders.`);

    // 6. Issue Definitions (Catalog)
    for (const d of mockIssueDefinitions) {
      await client.query(
        `INSERT INTO issue_definitions (
           id, issue_code, issue_name, issue_group_code, issue_group_name, 
           severity, hard_fail, is_definition_complete, is_current, version, recheck_guidance_template
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET is_definition_complete = EXCLUDED.is_definition_complete`,
        [
          d.id,
          d.issueCode,
          d.issueName,
          d.issueGroupCode,
          d.issueGroupName,
          d.severity,
          d.hardFail,
          d.isDefinitionComplete,
          d.isCurrent,
          d.version,
          d.recheckGuidanceTemplate,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockIssueDefinitions.length} Issue Definitions.`);

    // 7. Audit Queue Runs & Items
    await client.query(
      `INSERT INTO audit_queue_runs (id, run_date, rule_version, total_items, status)
       VALUES ($1, $2, $3, $4, 'COMPLETED')
       ON CONFLICT (id) DO UPDATE SET total_items = EXCLUDED.total_items`,
      ['RUN-2026-1020', '2026-10-20', 'v1.1-prod', mockAuditQueueItems.length]
    );

    for (const item of mockAuditQueueItems) {
      await client.query(
        `INSERT INTO audit_queue_items (
           id, queue_run_id, audit_date, customer_id, sale_id, team_id,
           assigned_auditor_id, status, risk_tags, active_action_id,
           rule_version, sync_timestamp, assigned_at, shared_work,
           snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, active_action_id = EXCLUDED.active_action_id`,
        [
          item.id,
          item.queueRunId,
          item.auditDate,
          item.customerId,
          item.saleId,
          item.teamId,
          item.assignedAuditorId || null,
          item.status,
          JSON.stringify(item.riskTags),
          item.activeActionId || null,
          item.ruleVersion,
          item.syncTimestamp,
          item.assignedAt || null,
          item.sharedWork || false,
          item.customerName,
          item.saleName,
          item.teamName,
          item.assignedAuditorName || null,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockAuditQueueItems.length} Audit Queue Items.`);

    // 8. Audit Cases & Issues
    for (const c of mockAuditCases) {
      await client.query(
        `INSERT INTO audit_cases (
           id, queue_item_id, auditor_id, status, started_at, completed_at,
           general_notes, snapshot_customer_id, snapshot_customer_name,
           snapshot_sale_id, snapshot_sale_name, snapshot_team_id, snapshot_team_name,
           snapshot_auditor_id, snapshot_auditor_name, rule_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [
          c.id,
          c.queueItemId,
          c.auditorId,
          c.status,
          c.startedAt,
          c.completedAt || null,
          c.generalNotes || null,
          c.snapshotCustomerId,
          c.snapshotCustomerName,
          c.snapshotSaleId,
          c.snapshotSaleName,
          c.snapshotTeamId,
          c.snapshotTeamName,
          c.snapshotAuditorId,
          c.snapshotAuditorName,
          c.ruleVersion || 'v1.1-prod',
        ]
      );

      for (const iss of c.issues) {
        await client.query(
          `INSERT INTO audit_issues (id, case_id, issue_code, issue_name, group_name, severity, hard_fail, notes, corrective_action_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            iss.id,
            c.id,
            iss.issueCode,
            iss.issueName,
            iss.groupName,
            iss.severity,
            iss.hardFail,
            iss.notes || null,
            iss.correctiveActionId || null,
          ]
        );
      }
    }
    console.log(`✅ Đã nạp ${mockAuditCases.length} Audit Cases.`);

    // 9. Corrective Actions & Rechecks
    const validQueueItemIds = new Set(mockAuditQueueItems.map((q) => q.id));
    const validCaseIds = new Set(mockAuditCases.map((c) => c.id));

    for (const act of mockCorrectiveActions) {
      const targetQueueItemId = validQueueItemIds.has(act.queueItemId || '') ? act.queueItemId : null;
      const targetCaseId = validCaseIds.has(act.caseId || '') ? act.caseId : null;

      await client.query(
        `INSERT INTO corrective_actions (
           id, code, case_id, issue_id, queue_item_id, customer_id, sale_id, auditor_id,
           issue_code, issue_name, severity, status, due_date, sla_rule_version,
           completion_criteria, guidance_notes, sale_marked_done, sale_marked_done_at,
           sale_notes, waive_reason, waive_approved_by,
           snapshot_customer_name, snapshot_sale_name, snapshot_team_name, snapshot_auditor_name,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
         ON CONFLICT (id) DO UPDATE SET 
           status = EXCLUDED.status, 
           created_at = EXCLUDED.created_at`,
        [
          act.id,
          act.code,
          targetCaseId,
          act.issueId || null,
          targetQueueItemId,
          act.customerId,
          act.saleId,
          act.auditorId,
          act.issueCode,
          act.issueName,
          act.severity,
          act.status,
          act.dueDate,
          act.slaRuleVersion,
          act.completionCriteria,
          act.guidanceNotes || null,
          act.saleMarkedDone,
          act.saleMarkedDoneAt || null,
          act.saleNotes || null,
          act.waiveReason || null,
          act.waiveApprovedBy || null,
          act.customerName,
          act.saleName,
          act.teamName,
          act.auditorName,
          act.createdAt,
        ]
      );

      // Recheck records
      for (const rc of act.rechecks) {
        await client.query(
          `INSERT INTO rechecks (
             id, action_id, recheck_number, auditor_id, auditor_name,
             recheck_date, result, notes, next_due_date, next_recheck_schedule
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            rc.id,
            act.id,
            rc.recheckNumber,
            rc.auditorId,
            rc.auditorName,
            rc.recheckDate,
            rc.result,
            rc.notes,
            rc.nextDueDate || null,
            rc.nextRecheckSchedule || null,
          ]
        );
      }

      // Evidences
      for (const evi of act.saleEvidenceList) {
        await client.query(
          `INSERT INTO evidences (
             id, target_type, target_id, type, file_name, file_size,
             file_url, caption, uploaded_by_role, uploaded_by_name, uploaded_at
           ) VALUES ($1, 'SALE_ACTION', $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            evi.id,
            act.id,
            evi.type,
            evi.fileName,
            evi.fileSize || '250 KB',
            evi.fileUrl,
            evi.caption || null,
            evi.uploadedByRole,
            evi.uploadedByName,
            evi.uploadedAt,
          ]
        );
      }
    }
    console.log(`✅ Đã nạp ${mockCorrectiveActions.length} Corrective Actions.`);

    // 10. Auditor Assignments (Includes A -> B -> C scenario without overlap)
    for (const asg of mockAuditorAssignments) {
      await client.query(
        `INSERT INTO auditor_assignments (
           id, sale_id, auditor_id, effective_from, effective_to,
           assignment_reason, created_by, is_active,
           snapshot_sale_name, snapshot_auditor_name, snapshot_team_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET 
           effective_to = EXCLUDED.effective_to, 
           is_active = EXCLUDED.is_active`,
        [
          asg.id,
          asg.saleId,
          asg.auditorId,
          asg.effectiveFrom,
          asg.effectiveTo || null,
          asg.assignmentReason,
          asg.createdBy,
          asg.isActive,
          asg.saleName,
          asg.auditorName,
          asg.teamName,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockAuditorAssignments.length} Auditor Assignments.`);

    // 11. Rescued Orders
    for (const r of mockRescuedOrders) {
      await client.query(
        `INSERT INTO rescued_orders (
           id, customer_id, action_id, order_id, order_code, order_date,
           order_value, attribution_status, auditor_id, sale_id, window_days
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          r.customerId,
          r.actionId,
          r.orderId,
          r.orderCode,
          r.orderDate,
          r.orderValue,
          r.attributionStatus,
          r.auditorId,
          r.saleId,
          r.windowDays,
        ]
      );
    }
    console.log(`✅ Đã nạp ${mockRescuedOrders.length} Rescued Orders.`);

    // 12. Audit Trail Events & Source Sync Logs
    for (const trl of mockAuditTrailEvents) {
      await client.query(
        `INSERT INTO audit_trail_events (id, timestamp, actor_name, actor_role, action_type, description, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [trl.id, trl.timestamp, trl.actorName, trl.actorRole, trl.actionType, trl.description, trl.details || null]
      );
    }

    for (const sync of mockSourceSyncLogs) {
      await client.query(
        `INSERT INTO source_sync_logs (id, source_name, last_sync_time, record_count, status, latency_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET last_sync_time = EXCLUDED.last_sync_time`,
        [sync.id, sync.sourceName, sync.lastSyncTime, sync.recordCount, sync.status, sync.latencySeconds, sync.notes || null]
      );
    }
    console.log(`✅ Đã nạp Audit Trail và Source Sync Logs.`);

    await client.query('COMMIT');
    console.log('🎉 Hoàn tất Seed dữ liệu vào Neon PostgreSQL thành công 100%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi trong quá trình Seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error(err);
  process.exit(1);
});
