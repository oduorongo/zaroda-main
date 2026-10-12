// The one address people should use for the school system. Older addresses (the previous domain and the
// raw Render address) still reach this app, but the Render address does not sign people in properly, so
// they are sent on to the real one - see proxy.ts.

export const CANONICAL_ORIGIN = 'https://zarodaschool.com';

// Hosts whose visitors are redirected. Matched on the host name only (never the path or query).
//  - zarodasolutions.app (and any subdomain): the previous domain
//  - *.onrender.com: the address Render gives every service, which must not be used to sign in
const OLD_HOST_PATTERNS: RegExp[] = [/(^|\.)zarodasolutions\.app(:\d+)?$/i, /(^|\.)onrender\.com(:\d+)?$/i];

/** True when a request arrived on an address that should be sent to the canonical one. */
export function isOldHost(host: string | null | undefined): boolean {
  const h = (host || '').trim();
  if (!h) return false;
  return OLD_HOST_PATTERNS.some((p) => p.test(h));
}

/**
 * Where to send a visitor: the same page on the canonical address, keeping the path and query.
 * The path is SET on the canonical address rather than joined to it: joining would let a path that
 * starts with a double slash ("//other-site.com/x") be read as a different host, an open redirect.
 */
export function canonicalUrl(pathname: string, search: string): URL {
  const url = new URL(CANONICAL_ORIGIN);
  url.pathname = pathname || '/';
  url.search = search || '';
  return url;
}
