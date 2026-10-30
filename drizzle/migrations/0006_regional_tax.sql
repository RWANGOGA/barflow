-- Regional tax and payment support.
-- Every statement is re-runnable so a hand-applied copy in Neon is safe.
ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "currency" text;
--> statement-breakpoint
ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "tax_rate_bps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "tax_total" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bar_sale" ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Widen the accepted payment methods for markets that use transfers and vouchers.
ALTER TABLE "bar_sale_payment" DROP CONSTRAINT IF EXISTS "bar_sale_payment_method_check";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bar_sale_payment" ADD CONSTRAINT "bar_sale_payment_method_check"
    CHECK ("method" IN ('cash', 'mobile_money', 'card', 'bank_transfer', 'voucher', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bar_sale" ADD CONSTRAINT "bar_sale_tax_rate_check"
    CHECK ("tax_rate_bps" >= 0 AND "tax_rate_bps" <= 10000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bar_sale" ADD CONSTRAINT "bar_sale_tax_total_check"
    CHECK ("tax_total" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Historic receipts keep working: stamp them with the currency the bar used at the time.
UPDATE "bar_sale" AS s
SET "currency" = COALESCE(
  (SELECT st.value FROM "bar_settings" st WHERE st.user_id = s.user_id AND st.key = 'currency'),
  'UGX'
)
WHERE s."currency" IS NULL;
