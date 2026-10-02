import { DataSource } from 'typeorm';

// Per-user auth facts that JwtStrategy checks on every request, cached briefly so
// a busy school doesn't hit the users table on each call. Revoking a user's
// sessions clears their entry here, so this instance sees the change at once;
// other instances (if ever scaled out) catch up within the TTL.
export interface AuthUserRow {
  id: string;
  role: string;
  tenantId: string | null;
  schoolId: string | null;
  isActive: boolean;
  tokenVersion: number;
}

export const AUTH_CACHE_TTL_MS = 30_000;
export const authUserCache = new Map<string, { row: AuthUserRow | null; at: number }>();

export function forgetAuthUser(userId?: string | null): void {
  if (userId) authUserCache.delete(String(userId));
}

/** Invalidate every token already issued to these users (password reset/change,
 *  deactivation, role change). Fails soft: the change that triggered it has already
 *  been made, and must not be rolled back because revocation hit an error. */
export async function revokeSessions(ds: DataSource, userIds: (string | null | undefined)[]): Promise<void> {
  const ids = Array.from(new Set(userIds.filter(Boolean).map(String)));
  if (!ids.length) return;
  await ds.query(
    `UPDATE users SET token_version = token_version + 1 WHERE id::text = ANY($1::text[])`, [ids],
  ).catch((e: any) => console.warn(`⚠️  could not revoke sessions: ${e.message}`));
  ids.forEach(forgetAuthUser);
}
