-- =============================================================================
-- FHP Governance Bodies
-- Migration: 019_governance_bodies.sql
-- Stores metadata for the three standing governance bodies.
-- Queue items are derived at query time from escalations/appeals/proposals.
-- =============================================================================

CREATE TABLE config.governance_bodies (
  body_code        TEXT        PRIMARY KEY
                   CHECK (body_code IN ('pc', 'fob', 'twg')),
  full_name        TEXT        NOT NULL,
  acronym          TEXT        NOT NULL,
  member_count     SMALLINT    NULL,      -- NULL = open/variable membership
  membership_type  TEXT        NOT NULL DEFAULT 'fixed'
                   CHECK (membership_type IN ('fixed', 'open')),
  current_status   TEXT        NOT NULL DEFAULT 'active'
                   CHECK (current_status IN ('active', 'inactive', 'quorum_present', 'review_session_active')),
  description      TEXT        NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO config.governance_bodies
  (body_code, full_name, acronym, member_count, membership_type, current_status, description)
VALUES
  ('pc',  'Protocol Council',         'PC',  6,    'fixed', 'active',
   'Final decision-making body for appeals and protocol amendments. Requires 4/6 majority.'),
  ('fob', 'Fairness Oversight Board', 'FOB', 7,    'fixed', 'active',
   'Reviews systemic fairness concerns and exercises veto over Protocol Council votes.'),
  ('twg', 'Technical Working Group',  'TWG', NULL, 'open',  'active',
   'Open membership body that reviews technical protocol proposals and escalations requiring specialist input.');
