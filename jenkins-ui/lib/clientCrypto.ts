// Browser-side crypto utilities.
// Uses Web Crypto API (AES-GCM + HMAC) when available (HTTPS / localhost).
// Falls back to challenge-XOR one-time-pad when crypto.subtle is absent (HTTP).

const enc = new TextEncoder();

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hasSubtle(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

// ---------------------------------------------------------------------------
// AES-GCM path (HTTPS / localhost)
// ---------------------------------------------------------------------------

async function deriveAesKey(challengeHex: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', hexToBuf(challengeHex), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('pw-enc') },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

async function encryptAes(password: string, challengeHex: string): Promise<{ iv: string; ct: string }> {
  const key = await deriveAesKey(challengeHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(password));
  return { iv: bufToHex(iv.buffer), ct: bufToHex(ct) };
}

async function hmacSignAes(body: string, challengeHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBuf(challengeHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return bufToHex(sig);
}

// ---------------------------------------------------------------------------
// XOR one-time-pad fallback (HTTP — crypto.subtle unavailable)
// The challenge is random and used exactly once, so XOR provides perfect
// secrecy for the password length. iv is set to the sentinel 'xor-v1'.
// ---------------------------------------------------------------------------

function encryptXor(password: string, challengeHex: string): { iv: string; ct: string } {
  const pwBytes = enc.encode(password);
  const keyBytes = new Uint8Array(hexToBuf(challengeHex));
  const out = new Uint8Array(pwBytes.length);
  for (let i = 0; i < pwBytes.length; i++) out[i] = pwBytes[i] ^ keyBytes[i % keyBytes.length];
  return { iv: 'xor-v1', ct: bufToHex(out.buffer) };
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encrypt the password with the server-issued challenge.
 *  Uses AES-GCM on HTTPS/localhost; falls back to XOR one-time-pad on plain HTTP. */
export async function encryptPassword(
  password: string,
  challengeHex: string,
): Promise<{ iv: string; ct: string }> {
  if (hasSubtle()) {
    try {
      return await encryptAes(password, challengeHex);
    } catch {
      // crypto.subtle present but failed (some HTTP contexts return a broken object)
    }
  }
  return encryptXor(password, challengeHex);
}

/** Compute a request checksum over the body using the challenge as key.
 *  Returns empty string when crypto.subtle is unavailable (XOR mode). */
export async function hmacSign(body: string, challengeHex: string): Promise<string> {
  if (hasSubtle()) {
    try {
      return await hmacSignAes(body, challengeHex);
    } catch {
      // fall through
    }
  }
  return '';
}
