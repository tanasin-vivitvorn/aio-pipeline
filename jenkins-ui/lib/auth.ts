import { NextRequest } from 'next/server';

const SESSION_SECRET = process.env.SESSION_SECRET || 'default-insecure-secret-change-me';
export const COOKIE_NAME = 'session';
export const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours in ms
// Set COOKIE_SECURE=false in K8s ConfigMap if ingress terminates TLS
// so the pod speaks plain HTTP but the browser still sees HTTPS.
export const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

export interface User {
  username: string;
  tenant: string; // '*' = admin, otherwise scoped to username
}

export interface SessionPayload {
  username: string;
  tenant: string;
  exp: number;
}

// ---------------------------------------------------------------------------
// Jenkins LDAP authentication
// ---------------------------------------------------------------------------

export async function validateWithJenkins(username: string, password: string): Promise<User | null> {
  const jenkinsUrl = (process.env.JENKINS_URL || 'http://jenkins:8080').replace(/\/$/, '');
  const basicAuth = `Basic ${btoa(`${username}:${password}`)}`;

  // Verify credentials against Jenkins
  const authRes = await fetch(`${jenkinsUrl}/api/json`, {
    headers: { Authorization: basicAuth },
    cache: 'no-store',
  });

  if (!authRes.ok) return null;

  // Determine admin by probing an admin-only endpoint
  const adminRes = await fetch(`${jenkinsUrl}/computer/api/json`, {
    headers: { Authorization: basicAuth },
    cache: 'no-store',
  });

  return { username, tenant: adminRes.ok ? '*' : username };
}

// ---------------------------------------------------------------------------
// Web Crypto helpers (Edge Runtime + Node.js compatible)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

// Returns crypto.subtle — works in Edge Runtime, Node.js 18+, and Node.js 15-17.
export function getSubtle(): SubtleCrypto {
  // Edge Runtime / Node.js 19+ / browsers
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  // Node.js 15–18: webcrypto exists on the crypto module but is not a global
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const wc = (require('crypto') as any).webcrypto as Crypto | undefined;
    if (wc?.subtle) return wc.subtle;
  } catch { /* not in Node.js */ }
  throw new Error('crypto.subtle is unavailable — upgrade to Node.js ≥ 18');
}

function getWebCrypto(): Crypto {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const wc = (require('crypto') as any).webcrypto as Crypto | undefined;
    if (wc) return wc;
  } catch { /* not in Node.js */ }
  throw new Error('WebCrypto is unavailable — upgrade to Node.js ≥ 18');
}

async function hmacKey(): Promise<CryptoKey> {
  return getSubtle().importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  return atob(pad ? padded + '='.repeat(4 - pad) : padded);
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Session token  (base64url-payload . hex-hmac-sha256-sig)
// ---------------------------------------------------------------------------

export async function createSessionToken(user: User): Promise<string> {
  const payload: SessionPayload = {
    username: user.username,
    tenant: user.tenant,
    exp: Date.now() + SESSION_TTL,
  };
  const encoded = toBase64url(JSON.stringify(payload));
  const key = await hmacKey();
  const sigBuf = await getSubtle().sign('HMAC', key, enc.encode(encoded));
  return `${encoded}.${bufToHex(sigBuf)}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  try {
    const key = await hmacKey();
    const valid = await getSubtle().verify(
      'HMAC',
      key,
      hexToBuf(sig),
      enc.encode(encoded)
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64url(encoded)) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---------------------------------------------------------------------------
// CSRF & Challenge helpers
// ---------------------------------------------------------------------------

export const CSRF_COOKIE_NAME = 'csrf';
export const CHALLENGE_COOKIE_NAME = 'chal';
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 min

/** Server-side: create a one-time challenge for password encryption. */
export async function createSignedChallenge(): Promise<{ challenge: string; cookieValue: string }> {
  const raw = getWebCrypto().getRandomValues(new Uint8Array(32));
  const challenge = bufToHex(raw.buffer);
  const payload = toBase64url(JSON.stringify({ challenge, exp: Date.now() + CHALLENGE_TTL }));
  const key = await hmacKey();
  const sig = bufToHex(await getSubtle().sign('HMAC', key, enc.encode(payload)));
  return { challenge, cookieValue: `${payload}.${sig}` };
}

/** Server-side: verify challenge cookie and return the raw challenge hex, or null. */
export async function verifySignedChallenge(cookieValue: string): Promise<string | null> {
  const dot = cookieValue.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  try {
    const key = await hmacKey();
    const valid = await getSubtle().verify('HMAC', key, hexToBuf(sig), enc.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(fromBase64url(payload)) as { challenge: string; exp: number };
    if (data.exp < Date.now()) return null;
    return data.challenge;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tenant helpers
// ---------------------------------------------------------------------------

export function jobBelongsToTenant(jobName: string, tenant: string): boolean {
  if (tenant === '*') return true;
  return jobName.startsWith(tenant + '_') || jobName.startsWith(tenant + '/');
}
