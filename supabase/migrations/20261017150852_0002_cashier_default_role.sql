-- Align the database default with Better Auth self-signup provisioning.
-- Existing user roles are intentionally unchanged.
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'Cashier';
