ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS bar_sale_idempotency_idx ON bar_sale(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS bar_sale_item (id text PRIMARY KEY, sale_id text NOT NULL REFERENCES bar_sale(id), product_id text NOT NULL REFERENCES bar_product(id), quantity integer NOT NULL CHECK (quantity > 0), unit_price integer NOT NULL CHECK (unit_price > 0));
CREATE INDEX IF NOT EXISTS bar_sale_item_sale_idx ON bar_sale_item(sale_id);
