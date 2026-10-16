-- Backend migration 013: non-functional requirements (Phase 6)
-- NF-07: login lockout tracking
-- NF-09: audit/movement immutability triggers

-- Failed login attempt tracking for lockout (NF-07)
CREATE TABLE IF NOT EXISTS bar_login_attempts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    success boolean NOT NULL DEFAULT false,
    ip_address text
);
CREATE INDEX IF NOT EXISTS bar_login_attempts_user_idx ON bar_login_attempts(user_id, attempted_at DESC);

-- Make audit log immutable: no UPDATE/DELETE after insert (NF-09)
CREATE OR REPLACE FUNCTION bar_guard_immutable_audit()
RETURNS event_trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_audit_update ON bar_audit_log;
DROP TRIGGER IF EXISTS guard_audit_delete ON bar_audit_log;
CREATE CONSTRAINT TRIGGER guard_audit_update
    AFTER UPDATE ON bar_audit_log
    FOR EACH ROW EXECUTE FUNCTION bar_guard_immutable_audit();
CREATE CONSTRAINT TRIGGER guard_audit_delete
    AFTER DELETE ON bar_audit_log
    FOR EACH ROW EXECUTE FUNCTION bar_guard_immutable_audit();

-- Make stock movements immutable (NF-09)
DROP TRIGGER IF EXISTS guard_movement_update ON bar_stock_movement;
DROP TRIGGER IF EXISTS guard_movement_delete ON bar_stock_movement;
CREATE CONSTRAINT TRIGGER guard_movement_update
    AFTER UPDATE ON bar_stock_movement
    FOR EACH ROW EXECUTE FUNCTION bar_guard_immutable_audit();
CREATE CONSTRAINT TRIGGER guard_movement_delete
    AFTER DELETE ON bar_stock_movement
    FOR EACH ROW EXECUTE FUNCTION bar_guard_immutable_audit();
