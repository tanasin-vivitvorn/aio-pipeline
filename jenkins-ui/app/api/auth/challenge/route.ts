import { NextResponse } from 'next/server';
import { createSignedChallenge, CHALLENGE_COOKIE_NAME, COOKIE_SECURE } from '@/lib/auth';

export async function GET() {
  const { challenge, cookieValue } = await createSignedChallenge();
  const response = NextResponse.json({ challenge });
  response.cookies.set(CHALLENGE_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: 300, // 5 minutes
    path: '/',
  });
  return response;
}
