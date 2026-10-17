-- Tables referenced by the FastAPI domain routes but absent from earlier
-- migrations, plus a non-plaintext PIN column for newly-created team members.
-- Migration 007 used CREATE TABLE IF NOT EXISTS, so deployments that already
-- ran 002 need these sale-item columns explicitly added and backfilled.
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS line_total integer;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS note text;

UPDATE bar_sale_item i
SET user_id=s.user_id,
    product_name=p.name,
    category=p.category,
    line_total=i.unit_price*i.quantity,
    created_at=COALESCE(i.created_at,s.created_at)
FROM bar_sale s, bar_product p
WHERE s.id=i.sale_id AND p.id=i.product_id
  AND (i.user_id IS NULL OR i.product_name IS NULL OR i.category IS NULL
       OR i.line_total IS NULL OR i.created_at IS NULL);

ALTER TABLE bar_sale_item ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN category SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN line_total SET NOT NULL;
ALTER TABLE bar_sale_item ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE bar_sale_item ALTER COLUMN created_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS bar_sale_item_user_created_idx
    ON bar_sale_item(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bar_sale_item_category_idx
    ON bar_sale_item(user_id, category, created_at DESC);

CREATE TABLE IF NOT EXISTS bar_idempotency_key (
    user_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS bar_inventory_count (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    product_id text NOT NULL REFERENCES bar_product(id),
    system_quantity integer NOT NULL CHECK (system_quantity >= 0),
    counted_quantity integer NOT NULL CHECK (counted_quantity >= 0),
    variance integer NOT NULL,
    counted_by text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_inventory_count_user_idx
    ON bar_inventory_count(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bar_stock_adjustment (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    product_id text NOT NULL REFERENCES bar_product(id),
    quantity integer NOT NULL CHECK (quantity <> 0),
    adjustment_type text NOT NULL CHECK (adjustment_type IN ('wastage','adjustment')),
    reason text NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_adjustment_user_idx
    ON bar_stock_adjustment(user_id, created_at DESC);

ALTER TABLE bar_team_member ADD COLUMN IF NOT EXISTS pin_hash text;
