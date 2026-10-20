-- Schemas adopted from the Supabase/FastAPI era can predate the trading-day columns that
-- lib/day.ts now reads. Every statement below is idempotent, so this is a no-op on a database
-- that already matches the Drizzle baseline.
CREATE TABLE IF NOT EXISTS "bar_day" (
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
);--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "opening_float" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "counted_cash" integer;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "expected_cash" integer;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "cash_variance" integer;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "stock_variance_units" integer;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "stock_variance_value" integer;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "variance_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "variance_reason" text;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bar_day" ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bar_day_one_open_idx" ON "bar_day" USING btree ("user_id") WHERE "bar_day"."status" = 'open';
