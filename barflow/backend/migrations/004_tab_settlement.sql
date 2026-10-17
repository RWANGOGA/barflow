ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS settled_by text;
ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS sale_id text;
CREATE INDEX IF NOT EXISTS bar_tab_sale_idx ON public.bar_tab (sale_id);
