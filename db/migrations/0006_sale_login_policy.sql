-- Safe RBAC login guard for AuditPulse.
-- SALE records remain in app_users and sales_profiles for relationship integrity,
-- but they are explicitly blocked from email/password login, session creation,
-- and operational API access.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN;

UPDATE app_users
SET login_enabled = CASE
  WHEN role IN ('HEAD_AUDITOR', 'AUDITOR', 'ADMIN') THEN TRUE
  WHEN role = 'SALE' THEN FALSE
  ELSE TRUE
END
WHERE login_enabled IS NULL;

ALTER TABLE app_users
  ALTER COLUMN login_enabled SET DEFAULT TRUE,
  ALTER COLUMN login_enabled SET NOT NULL;

-- Keep the app_user login state aligned with the audited business roles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE role = 'SALE' AND login_enabled = TRUE
  ) THEN
    UPDATE app_users
    SET login_enabled = FALSE
    WHERE role = 'SALE';
  END IF;
END $$;
