CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "bar_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "bar_discount" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sale_id" text,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_discount_amount_check" CHECK ("bar_discount"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "bar_idempotency_key" (
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_idempotency_key_user_id_idempotency_key_pk" PRIMARY KEY("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "bar_inventory_count" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"system_quantity" integer NOT NULL,
	"counted_quantity" integer NOT NULL,
	"variance" integer NOT NULL,
	"counted_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "bar_menu_stock_link" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"stock_item_id" text NOT NULL,
	"quantity_per_unit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_menu_stock_link_quantity_check" CHECK ("bar_menu_stock_link"."quantity_per_unit" > 0)
);
--> statement-breakpoint
CREATE TABLE "bar_product" (
	"id" text PRIMARY KEY NOT NULL,
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_product_price_check" CHECK ("bar_product"."price" > 0),
	CONSTRAINT "bar_product_stock_check" CHECK ("bar_product"."stock" >= 0),
	CONSTRAINT "bar_product_reorder_check" CHECK ("bar_product"."reorder" >= 0),
	CONSTRAINT "bar_product_cost_check" CHECK ("bar_product"."cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bar_receipt_counter" (
	"user_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"receipt_number" integer NOT NULL,
	"is_copy" boolean DEFAULT false NOT NULL,
	"copy_of" text,
	"printed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"printed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_sale_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"category" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_sale_item_unit_price_check" CHECK ("bar_sale_item"."unit_price" >= 0),
	CONSTRAINT "bar_sale_item_quantity_check" CHECK ("bar_sale_item"."quantity" > 0),
	CONSTRAINT "bar_sale_item_line_total_check" CHECK ("bar_sale_item"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bar_sale_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_sale_payment_method_check" CHECK ("bar_sale_payment"."method" IN ('cash', 'mobile_money', 'card')),
	CONSTRAINT "bar_sale_payment_amount_check" CHECK ("bar_sale_payment"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "bar_sale" (
	"id" text PRIMARY KEY NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_sale_total_check" CHECK ("bar_sale"."total" > 0),
	CONSTRAINT "bar_sale_status_check" CHECK ("bar_sale"."status" IN ('completed', 'voided')),
	CONSTRAINT "bar_sale_tendered_amount_check" CHECK ("bar_sale"."tendered_amount" IS NULL OR "bar_sale"."tendered_amount" >= 0),
	CONSTRAINT "bar_sale_change_due_check" CHECK ("bar_sale"."change_due" IS NULL OR "bar_sale"."change_due" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bar_settings" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "bar_stock_adjustment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"adjustment_type" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_stock_adjustment_type_check" CHECK ("bar_stock_adjustment"."adjustment_type" IN ('wastage', 'adjustment')),
	CONSTRAINT "bar_stock_adjustment_quantity_check" CHECK ("bar_stock_adjustment"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "bar_stock_count" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day_id" text NOT NULL,
	"product_id" text NOT NULL,
	"counted_quantity" integer NOT NULL,
	"expected_quantity" integer NOT NULL,
	"variance_units" integer NOT NULL,
	"variance_value" integer NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_stock_count_counted_quantity_check" CHECK ("bar_stock_count"."counted_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bar_stock_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"supplier" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"cost_price" integer NOT NULL,
	"delivery_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_stock_delivery_quantity_check" CHECK ("bar_stock_delivery"."quantity" > 0),
	CONSTRAINT "bar_stock_delivery_cost_check" CHECK ("bar_stock_delivery"."cost_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bar_stock_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"movement_type" text NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_stock_movement_quantity_check" CHECK ("bar_stock_movement"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "bar_stock_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"from_location" text NOT NULL,
	"to_location" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_stock_transfer_quantity_check" CHECK ("bar_stock_transfer"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bar_tab_item" (
	"id" text PRIMARY KEY NOT NULL,
	"tab_id" text NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_tab_item_quantity_check" CHECK ("bar_tab_item"."quantity" > 0),
	CONSTRAINT "bar_tab_item_unit_price_check" CHECK ("bar_tab_item"."unit_price" >= 0),
	CONSTRAINT "bar_tab_item_line_total_check" CHECK ("bar_tab_item"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bar_tab" (
	"id" text PRIMARY KEY NOT NULL,
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
	"reopen_reason" text,
	CONSTRAINT "bar_tab_total_check" CHECK ("bar_tab"."total" >= 0),
	CONSTRAINT "bar_tab_status_check" CHECK ("bar_tab"."status" IN ('open', 'settled', 'voided'))
);
--> statement-breakpoint
CREATE TABLE "bar_team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"pin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_team_member_role_check" CHECK ("bar_team_member"."role" IN ('Admin', 'Manager', 'Cashier', 'Storekeeper'))
);
--> statement-breakpoint
CREATE TABLE "bar_day" (
	"id" text PRIMARY KEY NOT NULL,
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
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_day_status_check" CHECK ("bar_day"."status" IN ('open', 'closed')),
	CONSTRAINT "bar_day_opening_float_check" CHECK ("bar_day"."opening_float" >= 0),
	CONSTRAINT "bar_day_counted_cash_check" CHECK ("bar_day"."counted_cash" IS NULL OR "bar_day"."counted_cash" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'Cashier' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" IN ('Admin', 'Manager', 'Cashier', 'Storekeeper'))
);
--> statement-breakpoint
CREATE TABLE "bar_user_pin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_variance_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variance_units" integer NOT NULL,
	"variance_value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_variance_tolerance" (
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"tolerance_units" integer NOT NULL,
	CONSTRAINT "bar_variance_tolerance_user_id_product_id_pk" PRIMARY KEY("user_id","product_id"),
	CONSTRAINT "bar_variance_tolerance_units_check" CHECK ("bar_variance_tolerance"."tolerance_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bar_audit_log_user_created_idx" ON "bar_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_audit_log_entity_idx" ON "bar_audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_discount_user_created_idx" ON "bar_discount" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_inventory_count_user_created_idx" ON "bar_inventory_count" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_menu_stock_link_menu_idx" ON "bar_menu_stock_link" USING btree ("user_id","menu_item_id");--> statement-breakpoint
CREATE INDEX "bar_product_user_idx" ON "bar_product" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bar_receipts_user_number_idx" ON "bar_receipts" USING btree ("user_id","receipt_number");--> statement-breakpoint
CREATE INDEX "bar_receipts_sale_idx" ON "bar_receipts" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "bar_sale_item_user_created_idx" ON "bar_sale_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_sale_item_sale_idx" ON "bar_sale_item" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "bar_sale_item_category_idx" ON "bar_sale_item" USING btree ("user_id","category","created_at");--> statement-breakpoint
CREATE INDEX "bar_sale_payment_sale_idx" ON "bar_sale_payment" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "bar_sale_user_created_idx" ON "bar_sale" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bar_sale_idempotency_idx" ON "bar_sale" USING btree ("user_id","idempotency_key") WHERE "bar_sale"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bar_stock_adjustment_user_created_idx" ON "bar_stock_adjustment" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_stock_count_day_idx" ON "bar_stock_count" USING btree ("user_id","day_id");--> statement-breakpoint
CREATE INDEX "bar_stock_delivery_user_date_idx" ON "bar_stock_delivery" USING btree ("user_id","delivery_date");--> statement-breakpoint
CREATE INDEX "bar_stock_movement_user_created_idx" ON "bar_stock_movement" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_stock_transfer_user_created_idx" ON "bar_stock_transfer" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bar_tab_item_user_tab_idx" ON "bar_tab_item" USING btree ("user_id","tab_id");--> statement-breakpoint
CREATE INDEX "bar_tab_user_status_idx" ON "bar_tab" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bar_tab_sale_idx" ON "bar_tab" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "bar_team_member_user_idx" ON "bar_team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bar_day_one_open_idx" ON "bar_day" USING btree ("user_id") WHERE "bar_day"."status" = 'open';--> statement-breakpoint
CREATE INDEX "bar_variance_history_user_idx" ON "bar_variance_history" USING btree ("user_id","created_at");