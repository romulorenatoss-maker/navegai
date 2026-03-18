
-- The unique index was already dropped in the previous migration.
-- Application-level validation (3 layers: form, DB query, and frontend duplicate modal)
-- already handles phone uniqueness correctly, excluding inactive leads.
-- We won't recreate the strict DB index since it can't reference other tables.
-- Instead, no index constraint is needed - the app logic is sufficient.
