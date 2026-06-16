import { getDb } from '../db/db.js';
import { verifyAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';

export function notificationRoutes(router) {

  router.get('/api/notifications', verifyAuth, async (request, env) => {
    const db = getDb(env);
    return ok(await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50', [request.user.id]));
  });

  router.patch('/api/notifications/:id/read', verifyAuth, async (request, env) => {
    const db = getDb(env);
    await db.run('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', [request.params.id, request.user.id]);
    return ok({ ok: true });
  });

  router.post('/api/notifications/read-all', verifyAuth, async (request, env) => {
    const db = getDb(env);
    await db.run('UPDATE notifications SET read=1 WHERE user_id=?', [request.user.id]);
    return ok({ ok: true });
  });
}
