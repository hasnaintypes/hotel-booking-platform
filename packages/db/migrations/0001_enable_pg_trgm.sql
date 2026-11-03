-- Trigram indexes on hotel city and country need pg_trgm. It ships with PostgreSQL contrib and
-- is available on the supported local, CI and Render images.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
