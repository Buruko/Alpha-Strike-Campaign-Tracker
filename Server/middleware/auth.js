/**
 * auth.js  —  Workers-compatible JWT middleware
 *
 * Reads token from:
 *   1. Cookie header  (name=token)
 *   2. Authorization: Bearer <token>
 *
 * Attaches decoded payload to request.user.
 * Returns 401 Response if missing/invalid.
 */

import { error } from 'itty-router';
import { verifyJwt } from '../lib/jwt.js';

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('=').trim());
  }
  return out;
}

export async function verifyAuth(request, env) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const authHeader = request.headers.get('authorization') || '';
  const token = cookies.token ||
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) return error(401, 'Authentication required');

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return error(401, 'Invalid or expired token');

  request.user = payload;
  // returning undefined lets itty-router continue to next handler
}

export function requireRole(...roles) {
  return async (request, env) => {
    const authResult = await verifyAuth(request, env);
    if (authResult) return authResult; // error response
    if (!roles.flat().includes(request.user.role)) {
      return error(403, `Access denied. Required: ${roles.flat().join(' or ')}`);
    }
  };
}

export function requireMinRole(minRole) {
  const levels = { player: 1, technician: 2, quartermaster: 3, gm: 4 };
  const min = levels[minRole] ?? 1;
  return async (request, env) => {
    const authResult = await verifyAuth(request, env);
    if (authResult) return authResult;
    if ((levels[request.user.role] ?? 0) < min) {
      return error(403, `Minimum role required: ${minRole}`);
    }
  };
}
