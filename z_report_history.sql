CREATE TABLE z_report_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  variant_price NUMERIC,
  variant_name TEXT,
  line_total NUMERIC NOT NULL,
  cashout_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_type TEXT NOT NULL,
  table_number TEXT,
  takeaway_number TEXT
);
