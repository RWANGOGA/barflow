-- Backend migration 010: PIN auth and audit hardening (Phase 3)
-- FR-15: manager PIN approval for voids/discounts/refunds
-- FR-16: audit every void, discount, reprint, price change

-- Hashed PIN per user for manager approvals and PIN sign-in (FR-15, FR-17)
CREATE TABLE IF NOT EXISTS bar_user_pin (
    user_id text PRIMARY KEY,
    pin_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Discount records (FR-15, FR-16)
CREATE TABLE IF NOT EXISTS bar_discount (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    sale_id text REFERENCES bar_sale(id),
    amount integer NOT NULL CHECK (amount > 0),
    reason text NOT NULL,
    approved_by text,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_discount_user_created_idx ON bar_discount(user_id, created_at DESC);
