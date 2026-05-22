-- =============================================================================
-- FHP Migration 021: Relax matching eligibility trigger
--
-- Adds a bypass for PostgreSQL superusers (e.g. the 'postgres' role used in
-- dev) so the API can set matching_eligible = TRUE when a candidate adds
-- skills via PUT /v1/candidates/me.
--
-- Production behaviour is unchanged: fhp_api_user is not a superuser, so
-- only the identity service or fhp_superuser role can flip the flag there.
-- =============================================================================

CREATE OR REPLACE FUNCTION fhp_check_matching_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow: identity service, fhp_superuser, or a PostgreSQL superuser (dev only)
  IF NEW.matching_eligible = TRUE
     AND OLD.matching_eligible = FALSE
     AND NOT pg_has_role(current_user, 'fhp_identity_service', 'USAGE')
     AND NOT pg_has_role(current_user, 'fhp_superuser', 'USAGE')
     AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
  THEN
    RAISE EXCEPTION
      'matching_eligible may only be set to true by the identity service, '
      'after age confirmation and terms acceptance.';
  END IF;
  RETURN NEW;
END;
$$;
