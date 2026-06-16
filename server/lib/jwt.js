/**
 * jwt.js  —  Web Crypto based JWT (HS256)
 *
 * Cloudflare Workers does not support Node's `crypto` module for HMAC-SHA256
 * in the same way, so we use the native Web Crypto API available in all Workers.
 *
 * Replaces the `jsonwebtoken` package entirely.
 */

const EXP_SECONDS = 7 * 24 * 60 * 60; // 7 days

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function getKey(secret) {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

export async function signJwt(payload, secret) {
  const header  = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = base64url(new TextEncoder().encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + EXP_SECONDS,
  })));
  const key     = await getKey(secret);
  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(sig)}`;
}

export async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const key = await getKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      base64urlDecode(signature),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
