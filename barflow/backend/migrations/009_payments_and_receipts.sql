-- Backend migration 009: payments and receipts (Phase 2)
-- FR-07: mixed payment methods + change due
-- FR-08/FR-10: reprint marked COPY and logged
-- FR-13: tax/currency/receipt settings per user

-- Mixed payment breakdown per sale (FR-07)
CREATE TABLE IF NOT EXISTS bar_sale_payment (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    sale_id text NOT NULL REFERENCES bar_sale(id),
    method text NOT NULL CHECK (method IN ('cash','mobile_money','card')),
    amount integer NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_sale_payment_sale_idx ON bar_sale_payment(sale_id);

-- Cash tendered and change due on the sale (FR-07)
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS tendered_amount integer CHECK (tendered_amount >= 0);
ALTER TABLE bar_sale ADD COLUMN IF NOT EXISTS change_due integer CHECK (change_due >= 0);

-- Per-user tax / currency / receipt settings (FR-13)
CREATE TABLE IF NOT EXISTS bar_settings (
    user_id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

-- Reprint support on receipts (FR-10 copy flag already in bar_receipts from 008)
ALTER TABLE bar_receipts ADD COLUMN IF NOT EXISTS copy_of text REFERENCES bar_receipts(id);
