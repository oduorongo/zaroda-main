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

/** One-time password handed to a user by an admin, e.g. "Kx7p-9Qm3-Rt4w". Drawn from
 *  crypto.randomInt (not Math.random, which is predictable) over characters that
 *  can't be confused when read aloud or copied by hand (no 0/O, 1/l/I). */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const block = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

/** A school badge must be an embedded PNG/JPEG/WebP image. Anything else — a URL in
 *  particular, which headless Chromium would fetch while rendering a PDF — is
 *  dropped (returns ''). */
export function safeImageSrc(src: any): string {
  const s = String(src ?? '');
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(s) ? s : '';
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

// ── Encryption at rest (school payment credentials) ─────────
// AES-256-GCM with DATA_ENCRYPTION_KEY (32 bytes, base64). Stored as
// "enc:v1:<iv>:<tag>:<ciphertext>" (each base64). A value without that prefix is a
// row saved before encryption existed: it is returned as-is, and the next save of
// that school's settings writes it back encrypted.
const ENC_PREFIX = 'enc:v1:';

function dataKey(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY || '';
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  return key;
}

export function assertDataKeyConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY is not set. Refusing to start in production without it.');
  }
  dataKey();   // validates the length when it is set
}

export function encryptSecret(plain: string | null | undefined): string {
  if (!plain) return '';
  const key = dataKey();
  if (!key) return plain;   // development without a key: stored as before
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored || !String(stored).startsWith(ENC_PREFIX)) return stored || '';
  const key = dataKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY is required to read encrypted payment credentials.');
  const [iv, tag, data] = String(stored).slice(ENC_PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
