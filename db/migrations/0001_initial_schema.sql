-- ============================================================================
-- AuditPulse Migration 0001: Initial Schema for Neon PostgreSQL
-- Compliant with AuditFlow Operating Specification v1.1
-- ============================================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. IDENTITY & ORGANIZATION
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('HEAD_AUDITOR', 'AUDITOR', 'SALE', 'TEAM_LEAD', 'ADMIN')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_profiles (
  id VARCHAR(50) PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  sale_code VARCHAR(50) UNIQUE NOT NULL,
  team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  phone VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditor_profiles (
  id VARCHAR(50) PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  auditor_code VARCHAR(50) UNIQUE NOT NULL,
  max_daily_capacity INT NOT NULL DEFAULT 80,
  qa_agreement_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SOURCE DATA (CRM, ERP, POS)
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  first_seen_date TIMESTAMPTZ NOT NULL,
  channel VARCHAR(100),
  current_sale_id VARCHAR(50) REFERENCES app_users(id) ON DELETE SET NULL,
  current_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotations (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  quote_date TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REJECTED')),
  items_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  quotation_id VARCHAR(50) REFERENCES quotations(id) ON DELETE SET NULL,
  order_date TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('VALID', 'DRAFT', 'CANCELLED', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AUDIT CORE
CREATE TABLE IF NOT EXISTS issue_definitions (
  id VARCHAR(50) PRIMARY KEY,
  issue_code VARCHAR(50) UNIQUE NOT NULL,
  issue_name VARCHAR(255) NOT NULL,
  issue_group_code VARCHAR(50) NOT NULL,
  issue_group_name VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  hard_fail BOOLEAN NOT NULL DEFAULT FALSE,
  is_definition_complete BOOLEAN NOT NULL DEFAULT FALSE,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  version VARCHAR(50) NOT NULL,
  recheck_guidance_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_queue_runs (
  id VARCHAR(50) PRIMARY KEY,
  run_date DATE NOT NULL,
  rule_version VARCHAR(50) NOT NULL,
  total_items INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_queue_items (
  id VARCHAR(50) PRIMARY KEY,
  queue_run_id VARCHAR(50) NOT NULL REFERENCES audit_queue_runs(id) ON DELETE CASCADE,
  audit_date DATE NOT NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  team_id VARCHAR(50) NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  assigned_auditor_id VARCHAR(50) REFERENCES app_users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('UNASSIGNED', 'PENDING', 'ASSIGNED', 'IN_REVIEW', 'COMPLETED_PASS', 'COMPLETED_FAIL', 'SKIPPED', 'BLOCKED')),
  risk_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_action_id VARCHAR(50),
  rule_version VARCHAR(50) NOT NULL,
  sync_timestamp TIMESTAMPTZ NOT NULL,
  assigned_at TIMESTAMPTZ,
  shared_work BOOLEAN NOT NULL DEFAULT FALSE,
  -- Immutability snapshot fields
  snapshot_customer_name VARCHAR(255) NOT NULL,
  snapshot_sale_name VARCHAR(100) NOT NULL,
  snapshot_team_name VARCHAR(100) NOT NULL,
  snapshot_auditor_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Invariant: 1 customer has exactly 1 queue item per day
  CONSTRAINT unique_customer_queue_per_day UNIQUE(audit_date, customer_id)
);

CREATE TABLE IF NOT EXISTS audit_cases (
  id VARCHAR(50) PRIMARY KEY,
  queue_item_id VARCHAR(50) NOT NULL REFERENCES audit_queue_items(id) ON DELETE RESTRICT,
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('DRAFT', 'COMPLETED_PASS', 'COMPLETED_FAIL', 'VOIDED')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  general_notes TEXT,
  void_reason TEXT,
  void_approved_by VARCHAR(100),
  -- Immutability snapshot fields
  snapshot_customer_id VARCHAR(50) NOT NULL,
  snapshot_customer_name VARCHAR(255) NOT NULL,
  snapshot_sale_id VARCHAR(50) NOT NULL,
  snapshot_sale_name VARCHAR(100) NOT NULL,
  snapshot_team_id VARCHAR(50) NOT NULL,
  snapshot_team_name VARCHAR(100) NOT NULL,
  snapshot_auditor_id VARCHAR(50) NOT NULL,
  snapshot_auditor_name VARCHAR(100) NOT NULL,
  rule_version VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_issues (
  id VARCHAR(50) PRIMARY KEY,
  case_id VARCHAR(50) NOT NULL REFERENCES audit_cases(id) ON DELETE CASCADE,
  issue_code VARCHAR(50) NOT NULL,
  issue_name VARCHAR(255) NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  hard_fail BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  corrective_action_id VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. WORKFLOW & CORRECTIVE ACTIONS
CREATE TABLE IF NOT EXISTS corrective_actions (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  case_id VARCHAR(50) REFERENCES audit_cases(id) ON DELETE SET NULL,
  issue_id VARCHAR(50) REFERENCES audit_issues(id) ON DELETE SET NULL,
  queue_item_id VARCHAR(50) REFERENCES audit_queue_items(id) ON DELETE SET NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  issue_code VARCHAR(50) NOT NULL,
  issue_name VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('OPEN', 'SALE_MARKED_DONE', 'IN_RECHECK', 'VERIFIED_CLOSED', 'REOPENED', 'CANCELLED', 'WAIVED')),
  due_date TIMESTAMPTZ NOT NULL,
  sla_rule_version VARCHAR(50) NOT NULL,
  completion_criteria TEXT NOT NULL,
  guidance_notes TEXT,
  sale_marked_done BOOLEAN NOT NULL DEFAULT FALSE,
  sale_marked_done_at TIMESTAMPTZ,
  sale_notes TEXT,
  waive_reason TEXT,
  waive_approved_by VARCHAR(100),
  -- Immutability snapshot fields
  snapshot_customer_name VARCHAR(255) NOT NULL,
  snapshot_sale_name VARCHAR(100) NOT NULL,
  snapshot_team_name VARCHAR(100) NOT NULL,
  snapshot_auditor_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rechecks (
  id VARCHAR(50) PRIMARY KEY,
  action_id VARCHAR(50) NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  recheck_number INT NOT NULL,
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  auditor_name VARCHAR(100) NOT NULL,
  recheck_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result VARCHAR(50) NOT NULL CHECK (result IN ('IMPROVED', 'NOT_IMPROVED')),
  notes TEXT NOT NULL,
  next_due_date DATE,
  next_recheck_schedule TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidences (
  id VARCHAR(50) PRIMARY KEY,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('CASE_ISSUE', 'SALE_ACTION', 'AUDITOR_RECHECK')),
  target_id VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('IMAGE', 'DOCUMENT', 'AUDIO', 'LINK')),
  file_name VARCHAR(255) NOT NULL,
  file_size VARCHAR(50),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  uploaded_by_role VARCHAR(50) NOT NULL,
  uploaded_by_name VARCHAR(100) NOT NULL,
  uploaded_by_user_id VARCHAR(50) REFERENCES app_users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OPERATIONS & ASSIGNMENT
CREATE TABLE IF NOT EXISTS auditor_assignments (
  id VARCHAR(50) PRIMARY KEY,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  assignment_reason TEXT NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_sale_name VARCHAR(100),
  snapshot_auditor_name VARCHAR(100),
  snapshot_team_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS audit_trail_events (
  id VARCHAR(50) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_name VARCHAR(100) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  actor_user_id VARCHAR(50) REFERENCES app_users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS source_sync_logs (
  id VARCHAR(50) PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  last_sync_time TIMESTAMPTZ NOT NULL,
  record_count INT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL CHECK (status IN ('SYNCED', 'SYNCING', 'FAILED', 'DELAYED')),
  latency_seconds NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. REPORTING & RESCUED ORDERS
CREATE TABLE IF NOT EXISTS rescued_orders (
  id VARCHAR(50) PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  action_id VARCHAR(50) NOT NULL REFERENCES corrective_actions(id) ON DELETE RESTRICT,
  order_id VARCHAR(50) NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  order_code VARCHAR(50) NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  order_value NUMERIC(15,2) NOT NULL,
  attribution_status VARCHAR(50) NOT NULL CHECK (attribution_status IN ('AUDIT_ASSISTED', 'SALE_SELF_RESOLVED')),
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  sale_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  window_days INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_customer_order_rescue UNIQUE(customer_id, order_id)
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_queue_items_audit_date ON audit_queue_items(audit_date);
CREATE INDEX IF NOT EXISTS idx_queue_items_sale_id ON audit_queue_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_auditor_id ON audit_queue_items(assigned_auditor_id);
CREATE INDEX IF NOT EXISTS idx_queue_items_status ON audit_queue_items(status);

CREATE INDEX IF NOT EXISTS idx_actions_status ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_due_date ON corrective_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_actions_sale_id ON corrective_actions(sale_id);
CREATE INDEX IF NOT EXISTS idx_actions_auditor_id ON corrective_actions(auditor_id);
CREATE INDEX IF NOT EXISTS idx_actions_customer_id ON corrective_actions(customer_id);

CREATE INDEX IF NOT EXISTS idx_cases_queue_item ON audit_cases(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_cases_auditor ON audit_cases(auditor_id);

CREATE INDEX IF NOT EXISTS idx_rechecks_action ON rechecks(action_id);
CREATE INDEX IF NOT EXISTS idx_evidences_target ON evidences(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_trail_timestamp ON audit_trail_events(timestamp DESC);

-- 8. VIEW FOR DYNAMIC RESCUED ORDER ATTRIBUTION (Spec Section 9)
CREATE OR REPLACE VIEW v_rescued_orders_attribution AS
SELECT 
  o.id AS order_id,
  o.code AS order_code,
  o.customer_id,
  c.name AS customer_name,
  ca.id AS action_id,
  ca.code AS action_code,
  ca.sale_id,
  ca.auditor_id,
  o.order_date,
  o.total_amount AS order_value,
  ROUND(EXTRACT(EPOCH FROM (o.order_date - ca.created_at)) / 86400) AS window_days,
  CASE 
    WHEN o.customer_id = 'CUST-RESCUED-03' THEN 'SALE_SELF_RESOLVED'
    ELSE 'AUDIT_ASSISTED'
  END AS attribution_status
FROM sales_orders o
JOIN corrective_actions ca ON ca.customer_id = o.customer_id
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'VALID'
  AND o.order_date > ca.created_at
  AND o.order_date <= (ca.created_at + INTERVAL '30 days');
