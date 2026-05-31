-- =============================================================================
-- FHP Cert Label Encoding Fix
-- Migration: 026_fix_cert_label_encoding.sql
--
-- When migration 025 was applied on Windows the psql client re-encoded
-- multi-byte UTF-8 sequences through the terminal code page, storing literal
-- '?' characters instead of the intended Unicode characters.
--
-- This migration rewrites the affected labels and issuing_body values using
-- PostgreSQL's chr() function, which is encoding-safe regardless of the
-- client_encoding setting:
--   chr(8211) = U+2013 EN DASH        ( – )
--   chr(8212) = U+2014 EM DASH        ( — )
--   chr(178)  = U+00B2 SUPERSCRIPT 2  ( ² )
-- =============================================================================

-- AWS certs: "Certified X – Y"  (en-dash, chr(8211))
UPDATE config.certifications
  SET label = 'AWS Certified Solutions Architect ' || chr(8211) || ' Associate'
  WHERE cert_id = 'fhp:cert:aws-solutions-architect-associate';

UPDATE config.certifications
  SET label = 'AWS Certified Solutions Architect ' || chr(8211) || ' Professional'
  WHERE cert_id = 'fhp:cert:aws-solutions-architect-professional';

UPDATE config.certifications
  SET label = 'AWS Certified Developer ' || chr(8211) || ' Associate'
  WHERE cert_id = 'fhp:cert:aws-developer-associate';

UPDATE config.certifications
  SET label = 'AWS Certified DevOps Engineer ' || chr(8211) || ' Professional'
  WHERE cert_id = 'fhp:cert:aws-devops-professional';

UPDATE config.certifications
  SET label = 'AWS Certified Machine Learning ' || chr(8211) || ' Specialty'
  WHERE cert_id = 'fhp:cert:aws-ml-specialty';

-- ATPL: em-dash (chr(8212))
UPDATE config.certifications
  SET label = 'ATPL ' || chr(8212) || ' Airline Transport Pilot Licence'
  WHERE cert_id = 'fhp:cert:atpl';

-- CISSP: issuing body (ISC)²  — superscript 2 (chr(178))
UPDATE config.certifications
  SET issuing_body = '(ISC)' || chr(178)
  WHERE cert_id = 'fhp:cert:cissp';
