-- =============================================================================
-- FHP Required Extensions
-- Migration: 001_extensions.sql
-- =============================================================================

-- UUID generation (gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Additional UUID functions (uuid_generate_v4() fallback)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigram text search — skill label search, role description search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gist — needed for exclusion constraints on ranges (salary overlap checks)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- pg_stat_statements — query performance monitoring (recommended for production)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

COMMENT ON EXTENSION pgcrypto       IS 'Cryptographic functions: gen_random_uuid(), digest() for trace checksums';
COMMENT ON EXTENSION "uuid-ossp"    IS 'UUID generation fallback';
COMMENT ON EXTENSION pg_trgm        IS 'Trigram indexes for skill and role text search';
COMMENT ON EXTENSION btree_gist     IS 'GiST indexes for range types — salary overlap validation';
COMMENT ON EXTENSION pg_stat_statements IS 'Query performance statistics';
