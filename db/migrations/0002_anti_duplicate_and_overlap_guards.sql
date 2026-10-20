-- ============================================================================
-- AuditPulse Migration 0002: Anti-Duplicate Action & Assignment Overlap Guards
-- Enforces PostgreSQL-level mathematical and relational invariants
-- ============================================================================

-- 1. Anti-Duplicate Action Constraint
-- A customer cannot have more than ONE active action for the same issue_code
-- Active statuses: OPEN, SALE_MARKED_DONE, IN_RECHECK, REOPENED
DROP INDEX IF EXISTS idx_prevent_duplicate_active_action;
CREATE UNIQUE INDEX idx_prevent_duplicate_active_action 
ON corrective_actions (customer_id, issue_code) 
WHERE status IN ('OPEN', 'SALE_MARKED_DONE', 'IN_RECHECK', 'REOPENED');

-- 2. Non-Overlapping Auditor Assignment Exclusion Constraint
-- A sale cannot have more than 1 auditor assignment on any given calendar day.
-- Uses PostgreSQL btree_gist extension with daterange overlap checking (&&)
ALTER TABLE auditor_assignments 
DROP CONSTRAINT IF EXISTS exclude_overlapping_auditor_assignments;

ALTER TABLE auditor_assignments 
ADD CONSTRAINT exclude_overlapping_auditor_assignments
EXCLUDE USING gist (
  sale_id WITH =,
  daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
);
