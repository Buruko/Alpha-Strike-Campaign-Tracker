/**
 * auth.js middleware
 * Verifies JWT from httpOnly cookie or Authorization header.
 * Attaches decoded payload to req.user.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function verifyAuth(req, res, next) {
  // Try cookie first, then Authorization header
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyAuth, JWT_SECRET };
