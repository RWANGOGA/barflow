/*
# Bar Management System — Full Initial Schema (uuid→text cast fix)

Re-applies the complete schema with auth.uid()::text in all RLS policies
because the bar_* tables use text user_id columns while auth.uid() returns uuid.

Idempotent: safe to re-run after prior partial commits.
*/

-- Better Auth identity tables
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" text NOT NULL DEFAULT 'Manager',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- 001 base tables
CREATE TABLE IF NOT EXISTS bar_product (
  id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, category text NOT NULL,
  price integer NOT NULL CHECK (price > 0), stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder integer NOT NULL DEFAULT 0 CHECK (reorder >= 0), cost integer NOT NULL DEFAULT 0 CHECK (cost >= 0),
  unit text NOT NULL, tone text NOT NULL DEFAULT 'slate',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_product_user_idx ON bar_product(user_id);

CREATE TABLE IF NOT EXISTS bar_sale (
  id text PRIMARY KEY, user_id text NOT NULL, payment_method text NOT NULL,
  total integer NOT NULL CHECK (total > 0), table_label text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_sale_user_created_idx ON bar_sale(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bar_stock_movement (
  id text PRIMARY KEY, user_id text NOT NULL, product_id text NOT NULL REFERENCES bar_product(id),
  quantity integer NOT NULL CHECK (quantity <> 0), movement_type text NOT NULL, reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_movement_user_created_idx ON bar_stock_movement(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bar_day (
  id text PRIMARY KEY, user_id text NOT NULL, business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_float integer NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  counted_cash integer CHECK (counted_cash >= 0), closed_at timestamptz, opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bar_day_one_open_idx ON bar_day(user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS bar_tab (
  id text PRIMARY KEY, user_id text NOT NULL, table_label text NOT NULL, owner_name text NOT NULL,
  total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','voided')),
  opened_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS bar_tab_user_status_idx ON bar_tab(user_id, status);

CREATE TABLE IF NOT EXISTS bar_team_member (
  id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL,
  role text NOT NULL CHECK (role IN ('Admin','Manager','Cashier','Storekeeper')),
  pin text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_team_member_user_idx ON bar_team_member(user_id);

CREATE TABLE IF NOT EXISTS bar_audit_log (
  id text PRIMARY KEY, user_id text NOT NULL, action text NOT NULL,
  record_label text NOT NULL, approval text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_audit_log_user_created_idx ON bar_audit_log(user_id, created_at DESC);

-- 002 + 007 sale items
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS bar_sale_idempotency_idx ON bar_sale(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS bar_sale_item (
  id text PRIMARY KEY, user_id text NOT NULL, sale_id text NOT NULL, product_id text NOT NULL,
  product_name text NOT NULL, category text NOT NULL,
  unit_price integer NOT NULL CHECK (unit_price >= 0), quantity integer NOT NULL CHECK (quantity > 0),
  line_total integer NOT NULL CHECK (line_total >= 0), note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_sale_item_user_created_idx ON bar_sale_item(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bar_sale_item_sale_idx ON bar_sale_item(sale_id);
CREATE INDEX IF NOT EXISTS bar_sale_item_category_idx ON bar_sale_item(user_id, category, created_at DESC);

-- 003 tab items
CREATE TABLE IF NOT EXISTS bar_tab_item (
  id text PRIMARY KEY, tab_id text NOT NULL REFERENCES bar_tab(id), user_id text NOT NULL,
  product_id text NOT NULL REFERENCES bar_product(id), quantity integer NOT NULL CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price >= 0), line_total integer NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_tab_item_user_tab_idx ON bar_tab_item(user_id, tab_id);

-- 004 tab settlement
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS settled_by text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS sale_id text;
CREATE INDEX IF NOT EXISTS bar_tab_sale_idx ON bar_tab(sale_id);

-- 005 tab void/reopen
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS voided_by text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS reopened_by text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS reopen_reason text;
ALTER TABLE bar_tab ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- 006 audit extended
ALTER TABLE bar_audit_log ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE bar_audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE bar_audit_log ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE bar_audit_log ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE bar_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS bar_audit_log_entity_idx ON bar_audit_log(entity_type, entity_id, created_at DESC);

-- 008 sale void + receipts
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided_by text;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE TABLE IF NOT EXISTS bar_receipt_counter (
  user_id text NOT NULL, next_number integer NOT NULL DEFAULT 1, PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS bar_receipts (
  id text PRIMARY KEY, user_id text NOT NULL, sale_id text NOT NULL REFERENCES bar_sale(id),
  receipt_number integer NOT NULL, is_copy boolean NOT NULL DEFAULT false,
  printed_at timestamptz NOT NULL DEFAULT now(), printed_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bar_receipts_user_number_idx ON bar_receipts(user_id, receipt_number);
CREATE INDEX IF NOT EXISTS bar_receipts_sale_idx ON bar_receipts(sale_id);

-- 009 payments + settings
CREATE TABLE IF NOT EXISTS bar_sale_payment (
  id text PRIMARY KEY, user_id text NOT NULL, sale_id text NOT NULL REFERENCES bar_sale(id),
  method text NOT NULL CHECK (method IN ('cash','mobile_money','card')),
  amount integer NOT NULL CHECK (amount > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_sale_payment_sale_idx ON bar_sale_payment(sale_id);
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS tendered_amount integer CHECK (tendered_amount >= 0);
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS change_due integer CHECK (change_due >= 0);
CREATE TABLE IF NOT EXISTS bar_settings (
  user_id text NOT NULL, key text NOT NULL, value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
ALTER TABLE bar_receipts ADD COLUMN IF NOT EXISTS copy_of text REFERENCES bar_receipts(id);

-- 010 PIN + discounts
CREATE TABLE IF NOT EXISTS bar_user_pin (
  user_id text PRIMARY KEY, pin_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bar_discount (
  id text PRIMARY KEY, user_id text NOT NULL, sale_id text REFERENCES bar_sale(id),
  amount integer NOT NULL CHECK (amount > 0), reason text NOT NULL,
  approved_by text, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_discount_user_created_idx ON bar_discount(user_id, created_at DESC);

-- 011 menu/stock linking
CREATE TABLE IF NOT EXISTS bar_menu_stock_link (
  id text PRIMARY KEY, user_id text NOT NULL,
  menu_item_id text NOT NULL REFERENCES bar_product(id), stock_item_id text NOT NULL REFERENCES bar_product(id),
  quantity_per_unit integer NOT NULL CHECK (quantity_per_unit > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_menu_stock_link_menu_idx ON bar_menu_stock_link(user_id, menu_item_id);
CREATE TABLE IF NOT EXISTS bar_stock_delivery (
  id text PRIMARY KEY, user_id text NOT NULL, supplier text NOT NULL,
  product_id text NOT NULL REFERENCES bar_product(id), quantity integer NOT NULL CHECK (quantity > 0),
  cost_price integer NOT NULL CHECK (cost_price >= 0), delivery_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_delivery_user_date_idx ON bar_stock_delivery(user_id, delivery_date DESC);
CREATE TABLE IF NOT EXISTS bar_stock_transfer (
  id text PRIMARY KEY, user_id text NOT NULL, product_id text NOT NULL REFERENCES bar_product(id),
  quantity integer NOT NULL CHECK (quantity > 0), from_location text NOT NULL, to_location text NOT NULL,
  reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_transfer_user_created_idx ON bar_stock_transfer(user_id, created_at DESC);

-- 012 daily close
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS expected_cash integer CHECK (expected_cash >= 0);
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS cash_variance integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS stock_variance_units integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS stock_variance_value integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS variance_accepted boolean NOT NULL DEFAULT false;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS variance_reason text;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS bar_stock_count (
  id text PRIMARY KEY, user_id text NOT NULL, day_id text NOT NULL REFERENCES bar_day(id),
  product_id text NOT NULL REFERENCES bar_product(id), counted_quantity integer NOT NULL CHECK (counted_quantity >= 0),
  expected_quantity integer NOT NULL, variance_units integer NOT NULL, variance_value integer NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_count_day_idx ON bar_stock_count(user_id, day_id);
CREATE TABLE IF NOT EXISTS bar_variance_tolerance (
  user_id text NOT NULL, product_id text NOT NULL REFERENCES bar_product(id),
  tolerance_units integer NOT NULL CHECK (tolerance_units >= 0), PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS bar_variance_history (
  id text PRIMARY KEY, user_id text NOT NULL, day_id text NOT NULL REFERENCES bar_day(id),
  product_id text NOT NULL REFERENCES bar_product(id), variance_units integer NOT NULL,
  variance_value integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_variance_history_user_idx ON bar_variance_history(user_id, created_at DESC);

-- 013 login attempts
CREATE TABLE IF NOT EXISTS bar_login_attempts (
  id text PRIMARY KEY, user_id text NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false, ip_address text
);
CREATE INDEX IF NOT EXISTS bar_login_attempts_user_idx ON bar_login_attempts(user_id, attempted_at DESC);

-- ===========================================================================
-- RLS — auth.uid()::text because bar_* user_id columns are text
-- ===========================================================================
ALTER TABLE bar_product ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_products" ON bar_product;
CREATE POLICY "select_own_products" ON bar_product FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_products" ON bar_product;
CREATE POLICY "insert_own_products" ON bar_product FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_products" ON bar_product;
CREATE POLICY "update_own_products" ON bar_product FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_products" ON bar_product;
CREATE POLICY "delete_own_products" ON bar_product FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_sale ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_sales" ON bar_sale;
CREATE POLICY "select_own_sales" ON bar_sale FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_sales" ON bar_sale;
CREATE POLICY "insert_own_sales" ON bar_sale FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_sales" ON bar_sale;
CREATE POLICY "update_own_sales" ON bar_sale FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_sales" ON bar_sale;
CREATE POLICY "delete_own_sales" ON bar_sale FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_sale_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_sale_items" ON bar_sale_item;
CREATE POLICY "select_own_sale_items" ON bar_sale_item FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_sale_items" ON bar_sale_item;
CREATE POLICY "insert_own_sale_items" ON bar_sale_item FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_sale_items" ON bar_sale_item;
CREATE POLICY "update_own_sale_items" ON bar_sale_item FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_sale_items" ON bar_sale_item;
CREATE POLICY "delete_own_sale_items" ON bar_sale_item FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_sale_payment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_sale_payments" ON bar_sale_payment;
CREATE POLICY "select_own_sale_payments" ON bar_sale_payment FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_sale_payments" ON bar_sale_payment;
CREATE POLICY "insert_own_sale_payments" ON bar_sale_payment FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_sale_payments" ON bar_sale_payment;
CREATE POLICY "update_own_sale_payments" ON bar_sale_payment FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_sale_payments" ON bar_sale_payment;
CREATE POLICY "delete_own_sale_payments" ON bar_sale_payment FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_receipts" ON bar_receipts;
CREATE POLICY "select_own_receipts" ON bar_receipts FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_receipts" ON bar_receipts;
CREATE POLICY "insert_own_receipts" ON bar_receipts FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_receipts" ON bar_receipts;
CREATE POLICY "update_own_receipts" ON bar_receipts FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_receipts" ON bar_receipts;
CREATE POLICY "delete_own_receipts" ON bar_receipts FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_receipt_counter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_receipt_counter" ON bar_receipt_counter;
CREATE POLICY "select_own_receipt_counter" ON bar_receipt_counter FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_receipt_counter" ON bar_receipt_counter;
CREATE POLICY "insert_own_receipt_counter" ON bar_receipt_counter FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_receipt_counter" ON bar_receipt_counter;
CREATE POLICY "update_own_receipt_counter" ON bar_receipt_counter FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_receipt_counter" ON bar_receipt_counter;
CREATE POLICY "delete_own_receipt_counter" ON bar_receipt_counter FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_settings" ON bar_settings;
CREATE POLICY "select_own_settings" ON bar_settings FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_settings" ON bar_settings;
CREATE POLICY "insert_own_settings" ON bar_settings FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_settings" ON bar_settings;
CREATE POLICY "update_own_settings" ON bar_settings FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_settings" ON bar_settings;
CREATE POLICY "delete_own_settings" ON bar_settings FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_stock_movement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_stock_movements" ON bar_stock_movement;
CREATE POLICY "select_own_stock_movements" ON bar_stock_movement FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_stock_movements" ON bar_stock_movement;
CREATE POLICY "insert_own_stock_movements" ON bar_stock_movement FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_stock_movements" ON bar_stock_movement;
CREATE POLICY "update_own_stock_movements" ON bar_stock_movement FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_stock_movements" ON bar_stock_movement;
CREATE POLICY "delete_own_stock_movements" ON bar_stock_movement FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_day ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_days" ON bar_day;
CREATE POLICY "select_own_days" ON bar_day FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_days" ON bar_day;
CREATE POLICY "insert_own_days" ON bar_day FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_days" ON bar_day;
CREATE POLICY "update_own_days" ON bar_day FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_days" ON bar_day;
CREATE POLICY "delete_own_days" ON bar_day FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_tab ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_tabs" ON bar_tab;
CREATE POLICY "select_own_tabs" ON bar_tab FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_tabs" ON bar_tab;
CREATE POLICY "insert_own_tabs" ON bar_tab FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_tabs" ON bar_tab;
CREATE POLICY "update_own_tabs" ON bar_tab FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_tabs" ON bar_tab;
CREATE POLICY "delete_own_tabs" ON bar_tab FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_tab_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_tab_items" ON bar_tab_item;
CREATE POLICY "select_own_tab_items" ON bar_tab_item FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_tab_items" ON bar_tab_item;
CREATE POLICY "insert_own_tab_items" ON bar_tab_item FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_tab_items" ON bar_tab_item;
CREATE POLICY "update_own_tab_items" ON bar_tab_item FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_tab_items" ON bar_tab_item;
CREATE POLICY "delete_own_tab_items" ON bar_tab_item FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_team_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_team" ON bar_team_member;
CREATE POLICY "select_own_team" ON bar_team_member FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_team" ON bar_team_member;
CREATE POLICY "insert_own_team" ON bar_team_member FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_team" ON bar_team_member;
CREATE POLICY "update_own_team" ON bar_team_member FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_team" ON bar_team_member;
CREATE POLICY "delete_own_team" ON bar_team_member FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_audit" ON bar_audit_log;
CREATE POLICY "select_own_audit" ON bar_audit_log FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_audit" ON bar_audit_log;
CREATE POLICY "insert_own_audit" ON bar_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_audit" ON bar_audit_log;
CREATE POLICY "delete_own_audit" ON bar_audit_log FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_user_pin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_pin" ON bar_user_pin;
CREATE POLICY "select_own_pin" ON bar_user_pin FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_pin" ON bar_user_pin;
CREATE POLICY "insert_own_pin" ON bar_user_pin FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_pin" ON bar_user_pin;
CREATE POLICY "update_own_pin" ON bar_user_pin FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_pin" ON bar_user_pin;
CREATE POLICY "delete_own_pin" ON bar_user_pin FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_discount ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_discounts" ON bar_discount;
CREATE POLICY "select_own_discounts" ON bar_discount FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_discounts" ON bar_discount;
CREATE POLICY "insert_own_discounts" ON bar_discount FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_discounts" ON bar_discount;
CREATE POLICY "update_own_discounts" ON bar_discount FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_discounts" ON bar_discount;
CREATE POLICY "delete_own_discounts" ON bar_discount FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_menu_stock_link ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_menu_links" ON bar_menu_stock_link;
CREATE POLICY "select_own_menu_links" ON bar_menu_stock_link FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_menu_links" ON bar_menu_stock_link;
CREATE POLICY "insert_own_menu_links" ON bar_menu_stock_link FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_menu_links" ON bar_menu_stock_link;
CREATE POLICY "update_own_menu_links" ON bar_menu_stock_link FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_menu_links" ON bar_menu_stock_link;
CREATE POLICY "delete_own_menu_links" ON bar_menu_stock_link FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_stock_delivery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_deliveries" ON bar_stock_delivery;
CREATE POLICY "select_own_deliveries" ON bar_stock_delivery FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_deliveries" ON bar_stock_delivery;
CREATE POLICY "insert_own_deliveries" ON bar_stock_delivery FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_deliveries" ON bar_stock_delivery;
CREATE POLICY "update_own_deliveries" ON bar_stock_delivery FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_deliveries" ON bar_stock_delivery;
CREATE POLICY "delete_own_deliveries" ON bar_stock_delivery FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_stock_transfer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_transfers" ON bar_stock_transfer;
CREATE POLICY "select_own_transfers" ON bar_stock_transfer FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_transfers" ON bar_stock_transfer;
CREATE POLICY "insert_own_transfers" ON bar_stock_transfer FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_transfers" ON bar_stock_transfer;
CREATE POLICY "update_own_transfers" ON bar_stock_transfer FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_transfers" ON bar_stock_transfer;
CREATE POLICY "delete_own_transfers" ON bar_stock_transfer FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_stock_count ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_counts" ON bar_stock_count;
CREATE POLICY "select_own_counts" ON bar_stock_count FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_counts" ON bar_stock_count;
CREATE POLICY "insert_own_counts" ON bar_stock_count FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_counts" ON bar_stock_count;
CREATE POLICY "update_own_counts" ON bar_stock_count FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_counts" ON bar_stock_count;
CREATE POLICY "delete_own_counts" ON bar_stock_count FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_variance_tolerance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_tolerances" ON bar_variance_tolerance;
CREATE POLICY "select_own_tolerances" ON bar_variance_tolerance FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_tolerances" ON bar_variance_tolerance;
CREATE POLICY "insert_own_tolerances" ON bar_variance_tolerance FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_tolerances" ON bar_variance_tolerance;
CREATE POLICY "update_own_tolerances" ON bar_variance_tolerance FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_tolerances" ON bar_variance_tolerance;
CREATE POLICY "delete_own_tolerances" ON bar_variance_tolerance FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_variance_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_variance_history" ON bar_variance_history;
CREATE POLICY "select_own_variance_history" ON bar_variance_history FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_variance_history" ON bar_variance_history;
CREATE POLICY "insert_own_variance_history" ON bar_variance_history FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "update_own_variance_history" ON bar_variance_history;
CREATE POLICY "update_own_variance_history" ON bar_variance_history FOR UPDATE TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_variance_history" ON bar_variance_history;
CREATE POLICY "delete_own_variance_history" ON bar_variance_history FOR DELETE TO authenticated USING (auth.uid()::text = user_id);

ALTER TABLE bar_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_login_attempts" ON bar_login_attempts;
CREATE POLICY "select_own_login_attempts" ON bar_login_attempts FOR SELECT TO authenticated USING (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "insert_own_login_attempts" ON bar_login_attempts;
CREATE POLICY "insert_own_login_attempts" ON bar_login_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id);
DROP POLICY IF EXISTS "delete_own_login_attempts" ON bar_login_attempts;
CREATE POLICY "delete_own_login_attempts" ON bar_login_attempts FOR DELETE TO authenticated USING (auth.uid()::text = user_id);
