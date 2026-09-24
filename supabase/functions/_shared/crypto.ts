// Crypto helpers built on WebCrypto (available in the Edge Runtime).
const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Base64url without padding. */
export function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes base64url or standard base64, padded or not. Throws on invalid input. */
export function b64urlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) throw new Error('base64 inválido');
  const body = s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (body.length % 4 === 1) throw new Error('base64 inválido');
  return Uint8Array.from(atob(body + '==='.slice((body.length + 3) % 4)), (c) => c.charCodeAt(0));
}

/** PEM (any label) → DER bytes. Accepts literal "\n" sequences from env vars. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  return b64urlToBytes(body).slice().buffer as ArrayBuffer;
}
