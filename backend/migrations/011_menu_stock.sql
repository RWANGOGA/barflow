-- Backend migration 011: menu-stock linking and stock movements (Phase 4)
-- FR-20: menu item linked to stock via recipe
-- ST-02: measure conversion
-- ST-04: voided sale returns stock with reason
-- ST-05: deliveries with supplier, date, quantity, cost
-- ST-11: transfers between storeroom and bar counter
-- ST-12: stock value at cost and selling price

-- Recipe link: one menu item consumes N units of one stock item (FR-20, ST-02)
CREATE TABLE IF NOT EXISTS bar_menu_stock_link (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    menu_item_id text NOT NULL REFERENCES bar_product(id),
    stock_item_id text NOT NULL REFERENCES bar_product(id),
    quantity_per_unit integer NOT NULL CHECK (quantity_per_unit > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_menu_stock_link_menu_idx ON bar_menu_stock_link(user_id, menu_item_id);

-- Deliveries (ST-05)
CREATE TABLE IF NOT EXISTS bar_stock_delivery (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    supplier text NOT NULL,
    product_id text NOT NULL REFERENCES bar_product(id),
    quantity integer NOT NULL CHECK (quantity > 0),
    cost_price integer NOT NULL CHECK (cost_price >= 0),
    delivery_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_delivery_user_date_idx ON bar_stock_delivery(user_id, delivery_date DESC);

-- Transfers between storeroom and bar counter (ST-11)
CREATE TABLE IF NOT EXISTS bar_stock_transfer (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    product_id text NOT NULL REFERENCES bar_product(id),
    quantity integer NOT NULL CHECK (quantity > 0),
    from_location text NOT NULL,
    to_location text NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bar_stock_transfer_user_created_idx ON bar_stock_transfer(user_id, created_at DESC);

-- Manager override setting for below-zero sales (ST-09)
-- Stored in bar_settings with key 'allow_negative_stock' (true/false) per user
