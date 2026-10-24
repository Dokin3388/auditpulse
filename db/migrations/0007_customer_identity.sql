-- ============================================================================
-- AuditPulse Migration 0007: customer identity (phone-first) + unmatched ledger
-- One normalized identifier can belong to exactly one customer. Quotations and
-- orders are resolved through this table instead of raw string comparisons, and
-- rows that cannot be resolved are parked in unmatched_transactions instead of
-- creating placeholder ("historical") customers.
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_identifiers (
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('PHONE', 'CODE')),
  value VARCHAR(100) NOT NULL,
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL DEFAULT 'SYNC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kind, value)
);

CREATE INDEX IF NOT EXISTS idx_customer_identifiers_customer ON customer_identifiers (customer_id);

CREATE TABLE IF NOT EXISTS unmatched_transactions (
  id VARCHAR(80) PRIMARY KEY,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('QUOTATION', 'ORDER')),
  source_code VARCHAR(100) NOT NULL,
  sheet_name VARCHAR(150) NOT NULL,
  reason VARCHAR(30) NOT NULL CHECK (reason IN ('NO_IDENTIFIER', 'NO_MATCH')),
  phones TEXT[] NOT NULL DEFAULT '{}',
  customer_code VARCHAR(100),
  payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_customer_id VARCHAR(50),
  CONSTRAINT unique_unmatched_transaction UNIQUE (kind, source_code)
);

CREATE INDEX IF NOT EXISTS idx_unmatched_transactions_open
  ON unmatched_transactions (kind, last_seen_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS customer_merge_log (
  id VARCHAR(80) PRIMARY KEY,
  winner_id VARCHAR(50) NOT NULL,
  loser_id VARCHAR(50) NOT NULL,
  loser_snapshot JSONB NOT NULL,
  moved JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_by VARCHAR(100),
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_merge_log_winner ON customer_merge_log (winner_id);
