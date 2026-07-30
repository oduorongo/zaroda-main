DELETE FROM assessment_results WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
DELETE FROM exams WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';