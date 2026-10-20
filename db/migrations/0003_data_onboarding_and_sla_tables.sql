-- ============================================================================
-- AuditPulse Migration 0003: Data Onboarding & SLA Configuration Tables
-- Phase 1.5 Data Onboarding for Neon Development
-- ============================================================================

-- 1. SLA CONFIGURATIONS
CREATE TABLE IF NOT EXISTS sla_configurations (
  id VARCHAR(50) PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('ISSUE', 'GROUP')),
  target_code VARCHAR(50) NOT NULL,
  target_name VARCHAR(255),
  action_due_hours INT NOT NULL DEFAULT 48,
  recheck_due_hours INT NOT NULL DEFAULT 24,
  max_rechecks INT NOT NULL DEFAULT 3,
  rule_version VARCHAR(50) NOT NULL DEFAULT 'v1.4',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_sla_target_version UNIQUE (target_code, rule_version)
);

CREATE INDEX IF NOT EXISTS idx_sla_target_code ON sla_configurations(target_code);
CREATE INDEX IF NOT EXISTS idx_sla_rule_version ON sla_configurations(rule_version);

-- 2. SALE / TEAM HISTORY
CREATE TABLE IF NOT EXISTS sale_team_history (
  id VARCHAR(50) PRIMARY KEY,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  old_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  new_team_id VARCHAR(50) NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  changed_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_team_history_sale_id ON sale_team_history(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_team_history_date ON sale_team_history(changed_date DESC);

-- 3. DATA IMPORT BATCHES & AUDIT LOGS
CREATE TABLE IF NOT EXISTS data_import_batches (
  id VARCHAR(50) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('VALIDATED', 'COMMITTED', 'FAILED')),
  validation_report JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_entity ON data_import_batches(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON data_import_batches(created_at DESC);
