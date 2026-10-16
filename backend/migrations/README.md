# Backend migrations

Run migrations in filename order against the Neon PostgreSQL database. `001_initial_schema.sql` is idempotent and establishes the current transactional tables, indexes, checks, and the one-open-day constraint.

The application stores monetary values as integer minor units (for example, UGX whole units) and scopes every domain record by `user_id` until workspace/bar membership is introduced.
