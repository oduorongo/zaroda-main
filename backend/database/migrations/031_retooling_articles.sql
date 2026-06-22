-- 031_retooling_articles.sql
-- Platform-wide teacher-retooling / professional-development articles posted by the
-- platform owner (super_admin) and readable by all schools' users. Global content, so
-- no tenant scoping.

CREATE TABLE IF NOT EXISTS retooling_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(300) NOT NULL,
  summary       VARCHAR(500),
  body          TEXT NOT NULL,
  category      VARCHAR(80),
  cover_image   TEXT,                 -- optional data URL / link
  video_url     TEXT,                 -- optional YouTube link
  is_published  BOOLEAN NOT NULL DEFAULT true,
  author_name   VARCHAR(200),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retooling_published ON retooling_articles(is_published, created_at DESC);
