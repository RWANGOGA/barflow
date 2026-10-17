ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS voided_by text;
ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS reopened_by text;
ALTER TABLE public.bar_tab ADD COLUMN IF NOT EXISTS reopen_reason text;
