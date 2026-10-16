-- Backend migration 012: daily close and reconciliation (Phase 5)
-- DR-01 to DR-10 + cash/stock/pour-cost formulas

-- Day close enhancements (DR-02, DR-03, DR-06, DR-07, DR-09)
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS expected_cash integer CHECK (expected_cash >= 0);
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS cash_variance integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS stock_variance_units integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS stock_variance_value integer;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS variance_accepted boolean NOT NULL DEFAULT false;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS variance_reason text;
ALTER TABLE bar_day ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- Physical stock counts for the day (DR-04)
CREATE TABLE IF NOT EXISTS bar_stock_count (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    day_id text NOT NULL REFERENCES bar_day(id),
    product_id text NOT NULL REFERENCES bar_product(id),
    counted_quantity integer NOT NULL CHECK (counted_quantity >= 0),
    expected_quantity integer NOT NULL,
    variance_units integer NOT NULL,
    variance_value integer NOT NULL,
    counted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_count_day_idx ON bar_stock_count(user_id, day_id);

-- Per-item variance tolerance (DR-05)
CREATE TABLE IF NOT EXISTS bar_variance_tolerance (
    user_id text NOT NULL,
    product_id text NOT NULL REFERENCES bar_product(id),
    tolerance_units integer NOT NULL CHECK (tolerance_units >= 0),
    PRIMARY KEY (user_id, product_id)
);

-- Cross-day variance history (DR-10)
CREATE TABLE IF NOT EXISTS bar_variance_history (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    day_id text NOT NULL REFERENCES bar_day(id),
    product_id text NOT NULL REFERENCES bar_product(id),
    variance_units integer NOT NULL,
    variance_value integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_variance_history_user_idx ON bar_variance_history(user_id, created_at DESC);
