-- KPI governance: configuration is versioned per period so a closed payroll
-- period can always be reproduced without relying on current UI settings.

CREATE TABLE IF NOT EXISTS kpi_periods (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'LOCKED')),
  created_by VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  locked_by VARCHAR(50) REFERENCES app_users(id) ON DELETE RESTRICT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kpi_period_dates_valid CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS kpi_metric_definitions (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('TEAM_OUTCOME', 'INTERVENTION', 'EXECUTION')),
  description TEXT NOT NULL,
  unit VARCHAR(20) NOT NULL CHECK (unit IN ('PERCENT', 'COUNT', 'CURRENCY', 'SCORE')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('HIGHER', 'LOWER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_period_metrics (
  id VARCHAR(50) PRIMARY KEY,
  period_id VARCHAR(50) NOT NULL REFERENCES kpi_periods(id) ON DELETE RESTRICT,
  metric_id VARCHAR(50) NOT NULL REFERENCES kpi_metric_definitions(id) ON DELETE RESTRICT,
  weight NUMERIC(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  default_target NUMERIC(15,2),
  metric_name_snapshot VARCHAR(160) NOT NULL,
  definition_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_metric_per_period UNIQUE(period_id, metric_id)
);

CREATE TABLE IF NOT EXISTS auditor_kpi_targets (
  id VARCHAR(50) PRIMARY KEY,
  period_metric_id VARCHAR(50) NOT NULL REFERENCES kpi_period_metrics(id) ON DELETE RESTRICT,
  auditor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  team_id VARCHAR(50) REFERENCES teams(id) ON DELETE RESTRICT,
  target_value NUMERIC(15,2),
  notes TEXT,
  set_by VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_auditor_metric_team_target UNIQUE NULLS NOT DISTINCT (period_metric_id, auditor_id, team_id)
);

CREATE TABLE IF NOT EXISTS kpi_change_log (
  id VARCHAR(50) PRIMARY KEY,
  period_id VARCHAR(50) NOT NULL REFERENCES kpi_periods(id) ON DELETE RESTRICT,
  actor_id VARCHAR(50) NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_periods_status_dates ON kpi_periods(status, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_kpi_targets_auditor ON auditor_kpi_targets(auditor_id);

INSERT INTO kpi_metric_definitions (id, code, name, category, description, unit, direction)
VALUES
  ('KPI-METRIC-QUOTE-RATE', 'TEAM_QUOTE_RATE', 'Tỷ lệ báo giá của team', 'TEAM_OUTCOME', 'Báo giá / khách đủ điều kiện trong team được giao.', 'PERCENT', 'HIGHER'),
  ('KPI-METRIC-CLOSE-RATE', 'TEAM_CLOSE_RATE', 'Tỷ lệ chốt của team', 'TEAM_OUTCOME', 'Đơn hợp lệ / báo giá của team được giao.', 'PERCENT', 'HIGHER'),
  ('KPI-METRIC-RESCUED', 'RESCUED_ORDERS', 'Đơn cứu được', 'INTERVENTION', 'Case rủi ro có log can thiệp hợp lệ và phát sinh đơn trong cửa sổ được phê duyệt.', 'COUNT', 'HIGHER'),
  ('KPI-METRIC-ONTIME', 'ON_TIME_CASE_RATE', 'Tỷ lệ case xử lý đúng hạn', 'EXECUTION', 'Case được xử lý/recheck đúng hạn / case đến hạn.', 'PERCENT', 'HIGHER'),
  ('KPI-METRIC-SALE-IMPROVE', 'SALE_PERFORMANCE_IMPROVEMENT', 'Cải thiện hiệu suất sale', 'TEAM_OUTCOME', 'Điểm hiệu suất sale tăng so với mốc đầu kỳ.', 'PERCENT', 'HIGHER')
ON CONFLICT (code) DO NOTHING;
