-- ============================================================================
-- AuditPulse Migration 0004: Google Sheets webhook sync ledger
-- Keeps raw source rows for traceability before they become operational data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_sheet_sync_runs (
  id VARCHAR(80) PRIMARY KEY,
  source_id VARCHAR(100) NOT NULL,
  sheet_name VARCHAR(150) NOT NULL,
  delivery_id VARCHAR(120) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL CHECK (status IN ('RECEIVED', 'COMPLETED', 'FAILED', 'DUPLICATE')),
  total_rows INT NOT NULL DEFAULT 0,
  applied_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT unique_google_sheet_delivery UNIQUE (source_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_google_sheet_sync_runs_source_received
  ON google_sheet_sync_runs (source_id, received_at DESC);

CREATE TABLE IF NOT EXISTS google_sheet_row_state (
  source_id VARCHAR(100) NOT NULL,
  sheet_name VARCHAR(150) NOT NULL,
  source_row_key VARCHAR(500) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  first_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_id, sheet_name, source_row_key)
);

CREATE TABLE IF NOT EXISTS google_sheet_sync_errors (
  id VARCHAR(80) PRIMARY KEY,
  sync_run_id VARCHAR(80) NOT NULL REFERENCES google_sheet_sync_runs(id) ON DELETE CASCADE,
  row_number INT,
  source_row_key VARCHAR(500),
  error_message TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_sheet_sync_errors_run
  ON google_sheet_sync_errors (sync_run_id, created_at DESC);
