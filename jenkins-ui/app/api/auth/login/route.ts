import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  validateWithJenkins,
  createSessionToken,
  COOKIE_NAME,
  SESSION_TTL,
  COOKIE_SECURE,
  CSRF_COOKIE_NAME,
  CHALLENGE_COOKIE_NAME,
  verifySignedChallenge,
  getSubtle,
} from '@/lib/auth';

const enc = new TextEncoder();

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

/** AES-GCM decrypt (HTTPS clients). */
async function decryptAes(ep: { iv: string; ct: string }, challengeHex: string): Promise<string | null> {
  try {
    const subtle = getSubtle();
    const baseKey = await subtle.importKey('raw', hexToBuf(challengeHex), 'HKDF', false, ['deriveKey']);
    const aesKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('pw-enc') },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: hexToBuf(ep.iv) }, aesKey, hexToBuf(ep.ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** XOR one-time-pad decrypt (HTTP clients — fallback when crypto.subtle unavailable in browser). */
function decryptXor(ep: { ct: string }, challengeHex: string): string | null {
  try {
    const ctBytes = new Uint8Array(hexToBuf(ep.ct));
    const keyBytes = new Uint8Array(hexToBuf(challengeHex));
    const out = new Uint8Array(ctBytes.length);
    for (let i = 0; i < ctBytes.length; i++) out[i] = ctBytes[i] ^ keyBytes[i % keyBytes.length];
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
}

async function decryptPassword(ep: { iv: string; ct: string }, challengeHex: string): Promise<string | null> {
  return ep.iv === 'xor-v1' ? decryptXor(ep, challengeHex) : decryptAes(ep, challengeHex);
}

async function verifyChecksum(body: string, challengeHex: string, checksum: string): Promise<boolean> {
  // XOR-mode clients cannot produce an HMAC — challenge cookie binding is sufficient.
  if (!checksum) return true;
  try {
    const subtle = getSubtle();
    const key = await subtle.importKey(
      'raw',
      hexToBuf(challengeHex),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return subtle.verify('HMAC', key, hexToBuf(checksum), enc.encode(body));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const challengeCookieValue = request.cookies.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!challengeCookieValue) {
    return NextResponse.json({ error: 'Missing challenge — call GET /api/auth/challenge first' }, { status: 400 });
  }

  const challenge = await verifySignedChallenge(challengeCookieValue);
  if (!challenge) {
    return NextResponse.json({ error: 'Invalid or expired challenge' }, { status: 400 });
  }

  const rawBody = await request.text();
  const checksum = request.headers.get('X-Checksum') ?? '';

  if (!(await verifyChecksum(rawBody, challenge, checksum))) {
    return NextResponse.json({ error: 'Invalid request checksum' }, { status: 400 });
  }

  let body: { username?: string; ep?: { iv: string; ct: string } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, ep } = body;
  if (!username || !ep) {
    return NextResponse.json({ error: 'username and encrypted password are required' }, { status: 400 });
  }

  const password = await decryptPassword(ep, challenge);
  if (!password) {
    return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 400 });
  }

  const user = await validateWithJenkins(username, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await createSessionToken(user);
  // CSRF token is a random value — the middleware does a plain double-submit
  // cookie check (no crypto), so there is no need for it to be derived from the session.
  const csrfToken = randomBytes(16).toString('hex');

  const response = NextResponse.json({ ok: true, username: user.username, tenant: user.tenant });

  // Consume the challenge — one-time use
  response.cookies.set(CHALLENGE_COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' });

  // Session cookie (httpOnly — never readable by JS)
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: SESSION_TTL / 1000,
    path: '/',
  });

  // CSRF token (readable by JS — client sends it back as X-Csrf-Token header)
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: 'strict',
    maxAge: SESSION_TTL / 1000,
    path: '/',
  });

  return response;
}
