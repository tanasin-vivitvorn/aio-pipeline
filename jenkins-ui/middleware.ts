import { NextRequest, NextResponse } from 'next/server';

// Only state-mutating methods need CSRF protection.
// GET/HEAD requests are safe — the session cookie (httpOnly, SameSite=Lax)
// already prevents cross-site reads.
const CSRF_SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function middleware(request: NextRequest) {
  if (CSRF_SAFE.has(request.method.toUpperCase())) {
    return NextResponse.next();
  }

  // Double-submit cookie pattern — no crypto needed.
  // The browser can't forge both the X-Csrf-Token header AND the csrf cookie
  // from a different origin (SameSite=Strict blocks cross-site cookie reads).
  const csrfHeader = request.headers.get('X-Csrf-Token') ?? '';
  const csrfCookie = request.cookies.get('csrf')?.value ?? '';

  if (!csrfCookie || csrfHeader !== csrfCookie) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/jenkins/:path*', '/api/auth/logout', '/api/auth/me'],
};
