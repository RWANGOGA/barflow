/*
  Fix bar_sale_item schema mismatch

  Migration 002 created bar_sale_item with only (id, sale_id, product_id, quantity, unit_price).
  Migration 007 used CREATE TABLE IF NOT EXISTS with the full schema, which was a no-op
  since the table already existed. This migration adds the missing columns.
*/

-- Add missing columns
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS line_total integer;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows from product data where possible
UPDATE bar_sale_item si
SET
  user_id = s.user_id,
  product_name = COALESCE(p.name, 'Unknown'),
  category = COALESCE(p.category, 'Unknown'),
  line_total = si.unit_price * si.quantity
FROM bar_sale s
LEFT JOIN bar_product p ON p.id = si.product_id
WHERE si.sale_id = s.id
  AND (si.user_id IS NULL OR si.product_name IS NULL OR si.category IS NULL OR si.line_total IS NULL);

-- Now make the columns NOT NULL (after backfill)
ALTER TABLE bar_sale_item ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN category SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN line_total SET NOT NULL;

-- Add CHECK constraints to match the intended schema
ALTER TABLE bar_sale_item DROP CONSTRAINT IF EXISTS bar_sale_item_unit_price_check;
ALTER TABLE bar_sale_item ADD CONSTRAINT bar_sale_item_unit_price_check CHECK (unit_price >= 0);
ALTER TABLE bar_sale_item ADD CONSTRAINT bar_sale_item_line_total_check CHECK (line_total >= 0);

-- Add missing indexes
CREATE INDEX IF NOT EXISTS bar_sale_item_user_created_idx ON bar_sale_item(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bar_sale_item_category_idx ON bar_sale_item(user_id, category, created_at DESC);
