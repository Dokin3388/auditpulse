-- Queue performance indexes. Risk tags are materialized in audit_queue_items;
-- the read API must not recompute them per row.
CREATE INDEX IF NOT EXISTS idx_quotations_customer_quote_date
  ON quotations (customer_id, quote_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_status_order_date
  ON sales_orders (customer_id, status, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_sale_effective_dates
  ON auditor_assignments (sale_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_queue_date_status_auditor
  ON audit_queue_items (audit_date, status, assigned_auditor_id);

CREATE INDEX IF NOT EXISTS idx_customers_first_seen_date
  ON customers (first_seen_date);
