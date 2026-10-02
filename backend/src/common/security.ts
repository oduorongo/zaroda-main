import * as crypto from 'crypto';

/** Constant-time string comparison. A length mismatch returns false without
 *  short-circuiting on content: both sides are hashed to equal-length digests first. */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a ?? '').length === String(b ?? '').length;
}

/** Escape a user-supplied value for interpolation into email/HTML markup. */
export function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c: string) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
  ));
}

export function isUuid(v: any): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''));
}

// ── JWT signing secrets ─────────────────────────────────────
// No shared fallback in production: a missing secret would otherwise let anyone who
// has read this source mint tokens. Development keeps a local-only fallback.
const isProduction = () => process.env.NODE_ENV === 'production';

function requiredSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProduction()) throw new Error(`${name} is not set. Refusing to start in production without it.`);
  return devFallback;
}

export const jwtSecret        = () => requiredSecret('JWT_SECRET', 'local-dev-only-access-secret');
export const jwtRefreshSecret = () => requiredSecret('JWT_REFRESH_SECRET', 'local-dev-only-refresh-secret');

/** Called first thing in bootstrap so a misconfigured deploy fails with a clear message. */
export function assertJwtSecretsConfigured(): void {
  jwtSecret();
  jwtRefreshSecret();
}
