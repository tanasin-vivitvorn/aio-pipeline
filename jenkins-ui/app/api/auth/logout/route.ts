import { NextResponse } from 'next/server';
import { COOKIE_NAME, CSRF_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' });
  response.cookies.set(CSRF_COOKIE_NAME, '', { httpOnly: false, maxAge: 0, path: '/' });
  return response;
}
