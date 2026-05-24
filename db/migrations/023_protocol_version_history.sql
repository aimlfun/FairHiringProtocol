-- ---------------------------------------------------------------------------
-- 023: Protocol version history
-- ---------------------------------------------------------------------------
-- Stores the published FHP version history so the governance dashboard
-- can display it dynamically instead of relying on a hardcoded array.
-- ---------------------------------------------------------------------------

CREATE TABLE config.protocol_versions (
  version_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  fhp_version   TEXT         NOT NULL UNIQUE,
  released_at   DATE         NOT NULL,
  label         TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'superseded'
                CHECK (status IN ('current', 'superseded', 'deprecated')),
  changelog_url TEXT         NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO config.protocol_versions (fhp_version, released_at, label, status)
VALUES ('1.0.0', '2025-01-01', 'Inaugural release', 'current');
