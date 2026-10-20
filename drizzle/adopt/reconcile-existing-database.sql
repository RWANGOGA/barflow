-- Idempotent reconciliation for a barflow database that was provisioned before the
-- migration pipeline existed. Generated from lib/db/schema.ts — do not edit by hand;
-- regenerate with `pnpm db:reconcile` after changing the schema.
-- Safe to run on a database that already has some or all of these objects.

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp with time zone,
  "refreshTokenExpiresAt" timestamp with time zone,
  "scope" text,
  "password" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "accountId" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "providerId" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "userId" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "accessToken" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "refreshToken" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "idToken" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "accessTokenExpiresAt" timestamp with time zone;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" timestamp with time zone;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "scope" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "password" text;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_admin_bootstrap_token" (
  "token_hash" text NOT NULL,
  "target_email" text NOT NULL,
  "consumed_by" text NOT NULL,
  "consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_admin_bootstrap_token" ADD COLUMN IF NOT EXISTS "target_email" text;

ALTER TABLE "bar_admin_bootstrap_token" ADD COLUMN IF NOT EXISTS "consumed_by" text;

ALTER TABLE "bar_admin_bootstrap_token" ADD COLUMN IF NOT EXISTS "consumed_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_audit_log" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "actor_role" text,
  "action" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "record_label" text DEFAULT '' NOT NULL,
  "approval" text DEFAULT 'Recorded' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "actor_role" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "action" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "entity_type" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "entity_id" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "record_label" text DEFAULT '' NOT NULL;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "approval" text DEFAULT 'Recorded' NOT NULL;

ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_discount" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "sale_id" text,
  "amount" integer NOT NULL,
  "reason" text NOT NULL,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "sale_id" text;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "amount" integer;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "approved_by" text;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

ALTER TABLE "bar_discount" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_idempotency_key" (
  "user_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "response_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "idempotency_key")
);

ALTER TABLE "bar_idempotency_key" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_idempotency_key" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "bar_idempotency_key" ADD COLUMN IF NOT EXISTS "request_hash" text;

ALTER TABLE "bar_idempotency_key" ADD COLUMN IF NOT EXISTS "response_json" jsonb;

ALTER TABLE "bar_idempotency_key" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_inventory_count" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "system_quantity" integer NOT NULL,
  "counted_quantity" integer NOT NULL,
  "variance" integer NOT NULL,
  "counted_by" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "system_quantity" integer;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "counted_quantity" integer;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "variance" integer;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "counted_by" text;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "bar_inventory_count" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_login_attempts" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "success" boolean DEFAULT false NOT NULL,
  "ip_address" text
);

ALTER TABLE "bar_login_attempts" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_login_attempts" ADD COLUMN IF NOT EXISTS "attempted_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "bar_login_attempts" ADD COLUMN IF NOT EXISTS "success" boolean DEFAULT false NOT NULL;

ALTER TABLE "bar_login_attempts" ADD COLUMN IF NOT EXISTS "ip_address" text;

CREATE TABLE IF NOT EXISTS "bar_menu_stock_link" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "menu_item_id" text NOT NULL,
  "stock_item_id" text NOT NULL,
  "quantity_per_unit" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_menu_stock_link" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_menu_stock_link" ADD COLUMN IF NOT EXISTS "menu_item_id" text;

ALTER TABLE "bar_menu_stock_link" ADD COLUMN IF NOT EXISTS "stock_item_id" text;

ALTER TABLE "bar_menu_stock_link" ADD COLUMN IF NOT EXISTS "quantity_per_unit" integer;

ALTER TABLE "bar_menu_stock_link" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_product" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "price" integer NOT NULL,
  "stock" integer DEFAULT 0 NOT NULL,
  "reorder" integer DEFAULT 0 NOT NULL,
  "cost" integer DEFAULT 0 NOT NULL,
  "unit" text NOT NULL,
  "tone" text DEFAULT 'slate' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "category" text;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "price" integer;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "stock" integer DEFAULT 0 NOT NULL;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "reorder" integer DEFAULT 0 NOT NULL;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "cost" integer DEFAULT 0 NOT NULL;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "unit" text;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "tone" text DEFAULT 'slate' NOT NULL;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "bar_product" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_receipt_counter" (
  "user_id" text NOT NULL,
  "next_number" integer DEFAULT 1 NOT NULL
);

ALTER TABLE "bar_receipt_counter" ADD COLUMN IF NOT EXISTS "next_number" integer DEFAULT 1 NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_receipts" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "sale_id" text NOT NULL,
  "receipt_number" integer NOT NULL,
  "is_copy" boolean DEFAULT false NOT NULL,
  "copy_of" text,
  "printed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "printed_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "sale_id" text;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "receipt_number" integer;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "is_copy" boolean DEFAULT false NOT NULL;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "copy_of" text;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "printed_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "printed_by" text;

ALTER TABLE "bar_receipts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_sale_item" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "sale_id" text NOT NULL,
  "product_id" text NOT NULL,
  "product_name" text NOT NULL,
  "category" text NOT NULL,
  "unit_price" integer NOT NULL,
  "quantity" integer NOT NULL,
  "line_total" integer NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "sale_id" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "product_name" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "category" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "unit_price" integer;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "line_total" integer;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "note" text;

ALTER TABLE "bar_sale_item" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_sale_payment" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "sale_id" text NOT NULL,
  "method" text NOT NULL,
  "amount" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_sale_payment" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_sale_payment" ADD COLUMN IF NOT EXISTS "sale_id" text;

ALTER TABLE "bar_sale_payment" ADD COLUMN IF NOT EXISTS "method" text;

ALTER TABLE "bar_sale_payment" ADD COLUMN IF NOT EXISTS "amount" integer;

ALTER TABLE "bar_sale_payment" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_sale" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "payment_method" text NOT NULL,
  "total" integer NOT NULL,
  "table_label" text,
  "status" text DEFAULT 'completed' NOT NULL,
  "idempotency_key" text,
  "voided" boolean DEFAULT false NOT NULL,
  "void_reason" text,
  "voided_by" text,
  "voided_at" timestamp with time zone,
  "tendered_amount" integer,
  "change_due" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "payment_method" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "total" integer;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "table_label" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'completed' NOT NULL;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "voided" boolean DEFAULT false NOT NULL;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "void_reason" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "voided_by" text;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "tendered_amount" integer;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "change_due" integer;

ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL
);

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "expiresAt" timestamp with time zone;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "token" text;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "ipAddress" text;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "userAgent" text;

ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "userId" text;

CREATE TABLE IF NOT EXISTS "bar_settings" (
  "user_id" text NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "key")
);

ALTER TABLE "bar_settings" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_settings" ADD COLUMN IF NOT EXISTS "key" text;

ALTER TABLE "bar_settings" ADD COLUMN IF NOT EXISTS "value" text;

ALTER TABLE "bar_settings" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "bar_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_stock_adjustment" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "adjustment_type" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "adjustment_type" text;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "created_by" text;

ALTER TABLE "bar_stock_adjustment" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_stock_count" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "day_id" text NOT NULL,
  "product_id" text NOT NULL,
  "counted_quantity" integer NOT NULL,
  "expected_quantity" integer NOT NULL,
  "variance_units" integer NOT NULL,
  "variance_value" integer NOT NULL,
  "counted_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "day_id" text;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "counted_quantity" integer;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "expected_quantity" integer;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "variance_units" integer;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "variance_value" integer;

ALTER TABLE "bar_stock_count" ADD COLUMN IF NOT EXISTS "counted_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_stock_delivery" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "supplier" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "cost_price" integer NOT NULL,
  "delivery_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "supplier" text;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "cost_price" integer;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "delivery_date" date;

ALTER TABLE "bar_stock_delivery" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_stock_movement" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "movement_type" text NOT NULL,
  "reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "movement_type" text;

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "reference" text;

ALTER TABLE "bar_stock_movement" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_stock_transfer" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "from_location" text NOT NULL,
  "to_location" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "from_location" text;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "to_location" text;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "bar_stock_transfer" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_tab_item" (
  "id" text NOT NULL,
  "tab_id" text NOT NULL,
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" integer NOT NULL,
  "line_total" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "tab_id" text;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "quantity" integer;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "unit_price" integer;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "line_total" integer;

ALTER TABLE "bar_tab_item" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_tab" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "table_label" text NOT NULL,
  "owner_name" text NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "payment_method" text,
  "settled_by" text,
  "sale_id" text,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone,
  "void_reason" text,
  "voided_by" text,
  "voided_at" timestamp with time zone,
  "reopened_by" text,
  "reopen_reason" text
);

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "table_label" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "owner_name" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "total" integer DEFAULT 0 NOT NULL;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "payment_method" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "settled_by" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "sale_id" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "settled_at" timestamp with time zone;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "void_reason" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "voided_by" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "reopened_by" text;

ALTER TABLE "bar_tab" ADD COLUMN IF NOT EXISTS "reopen_reason" text;

CREATE TABLE IF NOT EXISTS "bar_team_member" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "pin" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_team_member" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_team_member" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "bar_team_member" ADD COLUMN IF NOT EXISTS "role" text;

ALTER TABLE "bar_team_member" ADD COLUMN IF NOT EXISTS "pin" text;

ALTER TABLE "bar_team_member" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_day" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "business_date" date NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "opening_float" integer DEFAULT 0 NOT NULL,
  "counted_cash" integer,
  "expected_cash" integer,
  "cash_variance" integer,
  "stock_variance_units" integer,
  "stock_variance_value" integer,
  "variance_accepted" boolean DEFAULT false NOT NULL,
  "variance_reason" text,
  "locked" boolean DEFAULT false NOT NULL,
  "closed_at" timestamp with time zone,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "business_date" date;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "opening_float" integer DEFAULT 0 NOT NULL;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "counted_cash" integer;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "expected_cash" integer;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "cash_variance" integer;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "stock_variance_units" integer;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "stock_variance_value" integer;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "variance_accepted" boolean DEFAULT false NOT NULL;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "variance_reason" text;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "locked" boolean DEFAULT false NOT NULL;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;

ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "bar_day_one_open_idx" ON "bar_day" USING btree ("user_id") WHERE "bar_day"."status" = 'open';

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean DEFAULT false NOT NULL,
  "image" text,
  "role" text DEFAULT 'Cashier' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "name" text;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "email" text;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerified" boolean DEFAULT false NOT NULL;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" text;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'Cashier' NOT NULL;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_user_pin" (
  "user_id" text NOT NULL,
  "pin_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_user_pin" ADD COLUMN IF NOT EXISTS "pin_hash" text;

ALTER TABLE "bar_user_pin" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_variance_history" (
  "id" text NOT NULL,
  "user_id" text NOT NULL,
  "day_id" text NOT NULL,
  "product_id" text NOT NULL,
  "variance_units" integer NOT NULL,
  "variance_value" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "day_id" text;

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "variance_units" integer;

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "variance_value" integer;

ALTER TABLE "bar_variance_history" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "bar_variance_tolerance" (
  "user_id" text NOT NULL,
  "product_id" text NOT NULL,
  "tolerance_units" integer NOT NULL,
  PRIMARY KEY ("user_id", "product_id")
);

ALTER TABLE "bar_variance_tolerance" ADD COLUMN IF NOT EXISTS "user_id" text;

ALTER TABLE "bar_variance_tolerance" ADD COLUMN IF NOT EXISTS "product_id" text;

ALTER TABLE "bar_variance_tolerance" ADD COLUMN IF NOT EXISTS "tolerance_units" integer;

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "identifier" text;

ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "value" text;

ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "expiresAt" timestamp with time zone;

ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;
