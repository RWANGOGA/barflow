-- Backend migration 008: receipts and sale notes (Phase 1)
-- FR-03: item notes on sale lines
-- FR-09: sequential, never-reused receipt numbers per user
-- FR-14: confirmed sales can only be voided (not edited/deleted)
-- FR-19: sale items snapshot unit_price/line_total so old receipts keep charged price

-- Item-level note on sale lines (FR-03)
ALTER TABLE bar_sale_item ADD COLUMN IF NOT EXISTS note text;

-- Void tracking on confirmed sales (FR-14)
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided_by text;
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Per-user sequential receipt counter (FR-09)
CREATE TABLE IF NOT EXISTS bar_receipt_counter (
    user_id text NOT NULL,
    next_number integer NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id)
);

-- Receipt records (FR-09, FR-10 copy support prepared here)
CREATE TABLE IF NOT EXISTS bar_receipts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    sale_id text NOT NULL REFERENCES bar_sale(id),
    receipt_number integer NOT NULL,
    is_copy boolean NOT NULL DEFAULT false,
    printed_at timestamptz NOT NULL DEFAULT now(),
    printed_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bar_receipts_user_number_idx ON bar_receipts(user_id, receipt_number);
CREATE INDEX IF NOT EXISTS bar_receipts_sale_idx ON bar_receipts(sale_id);
