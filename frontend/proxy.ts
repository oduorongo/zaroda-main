import { NextResponse, type NextRequest } from 'next/server';
import { canonicalUrl, isOldHost } from './lib/canonical-host';

// Anyone who arrives on an old address (the previous domain, or the raw Render address that cannot sign
// people in) is sent to the same page on zarodaschool.com. 307 = temporary, so browsers do not remember
// it for good while we are still settling the addresses.
export function proxy(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (isOldHost(host)) {
    return NextResponse.redirect(canonicalUrl(req.nextUrl.pathname, req.nextUrl.search), 307);
  }
}
