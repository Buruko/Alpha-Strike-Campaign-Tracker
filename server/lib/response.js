/**
 * response.js  —  Workers response helpers
 *
 * Replaces Express res.json(), res.status(), res.cookie(), res.clearCookie()
 */

export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function okWithCookie(data, cookieName, cookieValue, isProduction) {
  const cookie = [
    `${cookieName}=${cookieValue}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=604800',  // 7 days
    'SameSite=Lax',
    isProduction ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}

export function clearCookie(cookieName) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    },
  });
}
