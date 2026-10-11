-- Backfill legacy rows without rebuilding the table or touching existing columns.
ALTER TABLE `sky_provider_connections` ADD `revision` integer DEFAULT 1 NOT NULL
CONSTRAINT `sky_provider_revision_positive` CHECK(typeof("sky_provider_connections"."revision") = 'integer' AND "sky_provider_connections"."revision" >= 1);
