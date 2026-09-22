-- Add 'dos' (Director of Studies) as a valid user role.
-- DOS has the same access as school_admin/hoi across the app except Finance.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'super_admin','tenant_owner','school_admin',
  'hoi','dhois','class_teacher','subject_teacher',
  'overall_class_teacher','games_dept','bursar',
  'parent','learner','dos'
));
