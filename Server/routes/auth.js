import { error } from 'itty-router';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/db.js';
import { signJwt } from '../lib/jwt.js';
import { verifyAuth } from '../middleware/auth.js';
import { ok, err, okWithCookie, clearCookie } from '../lib/response.js';

const isProd = (env) => env.ENVIRONMENT === 'production';

export function authRoutes(router) {

  // POST /api/auth/login
  router.post('/api/auth/login', async (request, env) => {
    const { username, password } = await request.json().catch(() => ({}));
    if (!username || !password) return err('Username and password required', 400);
    const db = getDb(env);
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return err('Invalid username or password', 401);
    const player = await db.get('SELECT id FROM players WHERE user_id = ?', [user.id]);
    const payload = { id: user.id, username: user.username, role: user.role, player_id: player?.id ?? null };
    const token = await signJwt(payload, env.JWT_SECRET);
    return okWithCookie({ user: payload }, 'token', token, isProd(env));
  });

  // POST /api/auth/logout
  router.post('/api/auth/logout', () => clearCookie('token'));

  // GET /api/auth/me
  router.get('/api/auth/me', verifyAuth, async (request, env) => {
    const db = getDb(env);
    const user = await db.get('SELECT id,username,role,created_at FROM users WHERE id = ?', [request.user.id]);
    if (!user) return err('User not found', 404);
    const player = await db.get('SELECT * FROM players WHERE user_id = ?', [user.id]);
    return ok({ user, player: player ?? null });
  });

  // POST /api/auth/register  (GM only)
  router.post('/api/auth/register', verifyAuth, async (request, env) => {
    if (request.user.role !== 'gm') return err('GM only', 403);
    const { username, password, role, callsign } = await request.json().catch(() => ({}));
    if (!username || !password || !role) return err('username, password, role required', 400);
    const valid = ['player','technician','quartermaster','gm'];
    if (!valid.includes(role)) return err(`role must be one of: ${valid.join(', ')}`, 400);
    const db = getDb(env);
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return err('Username already taken', 409);
    const hash   = bcrypt.hashSync(password, 10);
    const userId = uuid();
    const stmts  = [{ sql: 'INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)', params: [userId, username, hash, role] }];
    let playerId = null;
    if (role === 'player') {
      playerId = uuid();
      stmts.push({ sql: 'INSERT INTO players (id,user_id,callsign) VALUES (?,?,?)', params: [playerId, userId, callsign || username] });
    }
    await db.batch(stmts);
    return ok({ message: 'User created', userId, playerId }, 201);
  });

  // POST /api/auth/change-password
  router.post('/api/auth/change-password', verifyAuth, async (request, env) => {
    const { currentPassword, newPassword } = await request.json().catch(() => ({}));
    if (!currentPassword || !newPassword) return err('currentPassword and newPassword required', 400);
    if (newPassword.length < 8) return err('New password must be at least 8 characters', 400);
    const db   = getDb(env);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [request.user.id]);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) return err('Current password incorrect', 401);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), request.user.id]);
    return ok({ ok: true });
  });
}
