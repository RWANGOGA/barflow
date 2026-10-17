# Backend migrations

Run migrations in filename order against the PostgreSQL database. `001_initial_schema.sql` is idempotent and establishes the current transactional tables, indexes, checks, and the one-open-day constraint. Apply `014_backend_compatibility.sql` to repair the legacy sale-item table shape and create the additional tables used by the FastAPI API.

The application stores monetary values as integer minor units (for example, UGX whole units) and scopes every domain record by `user_id` until workspace/bar membership is introduced.
