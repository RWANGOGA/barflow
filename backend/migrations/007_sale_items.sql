CREATE TABLE IF NOT EXISTS public.bar_sale_item (id text PRIMARY KEY, user_id text NOT NULL, sale_id text NOT NULL, product_id text NOT NULL, product_name text NOT NULL, category text NOT NULL, unit_price integer NOT NULL CHECK (unit_price >= 0), quantity integer NOT NULL CHECK (quantity > 0), line_total integer NOT NULL CHECK (line_total >= 0), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS bar_sale_item_user_created_idx ON public.bar_sale_item(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bar_sale_item_sale_idx ON public.bar_sale_item(sale_id);
CREATE INDEX IF NOT EXISTS bar_sale_item_category_idx ON public.bar_sale_item(user_id, category, created_at DESC);
