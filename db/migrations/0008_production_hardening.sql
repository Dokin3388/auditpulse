-- Production hardening: database invariants and data-derived attribution.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_audit_case_per_queue_item
  ON audit_cases (queue_item_id)
  WHERE status <> 'VOIDED';

CREATE OR REPLACE FUNCTION set_corrective_action_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_corrective_actions_updated_at ON corrective_actions;
CREATE TRIGGER trg_corrective_actions_updated_at
BEFORE UPDATE ON corrective_actions
FOR EACH ROW EXECUTE FUNCTION set_corrective_action_updated_at();

-- Until the source system provides a verified self-resolved signal, classify
-- a valid action-following order conservatively as audit-assisted.
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
  'AUDIT_ASSISTED'::text AS attribution_status
FROM sales_orders o
JOIN corrective_actions ca ON ca.customer_id = o.customer_id
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'VALID'
  AND o.order_date > ca.created_at
  AND o.order_date <= (ca.created_at + INTERVAL '30 days');
