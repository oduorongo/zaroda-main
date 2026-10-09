import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const host = req.headers.get('host') || '';
  if (host.includes('zarodasolutions.app')) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, 'https://zarodaschool.com');
    return NextResponse.redirect(url, 307);
  }
}
