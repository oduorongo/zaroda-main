import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { DataSource } from 'typeorm';
import { jwtSecret } from '../../common/security';
import { AuthUserRow, authUserCache, AUTH_CACHE_TTL_MS } from '../../common/sessions';

/** Token is still good for this user: they exist, are active, and the token was
 *  issued at their current token_version. Tokens from before versioning carry no
 *  `tv`, and are honoured only while the user has never been revoked (version 0). */
export function tokenMatchesUser(payload: any, user: { isActive: boolean; tokenVersion: number } | null): boolean {
  if (!user || !user.isActive) return false;
  const tv = payload?.tv === undefined ? 0 : Number(payload.tv);
  return tv === Number(user.tokenVersion || 0);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly ds: DataSource) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      jwtSecret(),
    });
  }

  private async loadUser(id: string): Promise<AuthUserRow | null> {
    const hit = authUserCache.get(id);
    if (hit && Date.now() - hit.at < AUTH_CACHE_TTL_MS) return hit.row;
    const select = (version: string) => this.ds.query(
      `SELECT id, role, tenant_id AS "tenantId", school_id AS "schoolId",
              is_active AS "isActive", ${version} AS "tokenVersion"
         FROM users WHERE id::text = $1 LIMIT 1`,
      [id],
    );
    // Migrations run just after the port binds, so for the first seconds of a fresh
    // deploy token_version may not exist yet. Treat it as 0 rather than logging
    // everyone out; nothing can have been revoked before the column existed.
    const rows = await select('token_version').catch((e: any) => {
      if (e?.code === '42703') return select('0');
      throw e;
    });
    const row: AuthUserRow | null = rows[0] || null;
    authUserCache.set(id, { row, at: Date.now() });
    return row;
  }

  async validate(payload: any) {
    if (!payload.sub) throw new UnauthorizedException();
    const user = await this.loadUser(String(payload.sub));
    if (!tokenMatchesUser(payload, user)) throw new UnauthorizedException();
    // Role and school come from the database, not the token, so a role change or
    // a move between schools takes effect without waiting for the token to expire.
    return {
      id:       user!.id,
      email:    payload.email,
      role:     user!.role,
      tenantId: user!.tenantId,
      schoolId: user!.schoolId,
    };
  }
}
