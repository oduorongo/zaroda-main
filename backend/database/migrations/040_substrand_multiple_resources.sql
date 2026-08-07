-- A sub-strand can need more than one learning-resource link (e.g. two videos covering
-- different parts of the same sub-strand). Move from a single youtube_url column to an
-- array, backfilling any existing single link so nothing is lost.
ALTER TABLE assessment_substrands ADD COLUMN IF NOT EXISTS youtube_urls TEXT[] NOT NULL DEFAULT '{}';

UPDATE assessment_substrands
   SET youtube_urls = ARRAY[youtube_url]
 WHERE youtube_url IS NOT NULL AND youtube_url <> '' AND youtube_urls = '{}';
