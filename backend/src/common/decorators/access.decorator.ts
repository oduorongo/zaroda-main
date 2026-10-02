import { SetMetadata } from '@nestjs/common';

// Enforced in JwtAuthGuard, i.e. on every route that requires a login. Routes
// without a login (public pages, payment callbacks) are not affected.

/** Parents and learners are refused on every authenticated route unless it names
 *  their role here. Staff roles are unaffected by this decorator. */
export const ALLOW_ROLES_KEY = 'allowRoles';
export const AllowRoles = (...roles: ('parent' | 'learner')[]) => SetMetadata(ALLOW_ROLES_KEY, roles);

/** Routes a user may still call while they must change their password
 *  (users.must_change_password). Everything else answers 403 PASSWORD_CHANGE_REQUIRED. */
export const ALLOW_DURING_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, true);

/** School-management routes an individual (Professional Records only) account has no
 *  use for. Put on a controller; a handler can opt back in with @SchoolOnly(false). */
export const SCHOOL_ONLY_KEY = 'schoolOnly';
export const SchoolOnly = (on = true) => SetMetadata(SCHOOL_ONLY_KEY, on);
