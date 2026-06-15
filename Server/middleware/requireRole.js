/**
 * requireRole.js
 *
 * Role hierarchy: gm > quartermaster > technician > player
 * Use as: requireRole('gm')  or  requireRole(['gm','quartermaster'])
 */

const ROLE_LEVEL = {
  player:       1,
  technician:   2,
  quartermaster: 3,
  gm:           4,
};

/**
 * Require one or more specific roles.
 * Pass a string or array of allowed roles.
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowed.join(' or ')}`,
      });
    }
    next();
  };
}

/**
 * Require minimum role level.
 * requireMinRole('quartermaster') allows quartermaster and gm.
 */
function requireMinRole(minRole) {
  const minLevel = ROLE_LEVEL[minRole] ?? 1;
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userLevel = ROLE_LEVEL[req.user.role] ?? 0;
    if (userLevel < minLevel) {
      return res.status(403).json({
        error: `Access denied. Minimum role required: ${minRole}`,
      });
    }
    next();
  };
}

module.exports = { requireRole, requireMinRole, ROLE_LEVEL };
