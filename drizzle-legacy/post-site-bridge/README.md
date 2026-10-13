# Archived development migrations

These files document the development-time schema evolution after the original `0013` that was consolidated into the generated `drizzle/0013_sky_provider_connections.sql` for Sites deployment.

They are not an executable migration lineage. Keeping them outside repository-root `drizzle/` prevents Sites from replaying non-idempotent `CREATE TABLE` and `ALTER TABLE` statements against objects already present in the production database.
