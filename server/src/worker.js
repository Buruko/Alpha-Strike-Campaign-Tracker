/**
 * worker.js  —  Cloudflare Workers entry point
 *
 * Uses itty-router (tiny, Workers-native) instead of Express.
 * Each route handler receives (request, env, ctx) and returns a Response.
 * The `env` object is threaded through to getDb(env) in every route.
 */

import { AutoRouter, cors, error, json } from 'itty-router';

import { authRoutes }          from '../routes/auth.js';
import { pilotRoutes }         from '../routes/pilots.js';
import { xpRoutes }            from '../routes/xp.js';
import { unitRoutes }          from '../routes/units.js';
import { repairRoutes }        from '../routes/repairs.js';
import { accountingRoutes }    from '../routes/accounting.js';
import { contractRoutes }      from '../routes/contracts.js';
import { playmodeRoutes }      from '../routes/playmode.js';
import { salvageRoutes }       from '../routes/salvage.js';
import { notificationRoutes }  from '../routes/notifications.js';

const { preflight, corsify } = cors({
  origin: (origin, req) => {
    // Allow configured CLIENT_URL or localhost in dev
    const allowed = [
      req.env?.CLIENT_URL,
      'http://localhost:5173',
      'http://localhost:4173',
    ].filter(Boolean);
    return allowed.includes(origin) ? origin : allowed[0];
  },
  credentials: true,
  allowMethods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization','Cookie'],
  exposeHeaders: ['Set-Cookie'],
});

const router = AutoRouter({ before: [preflight], finally: [corsify] });

// Health
router.get('/api/health', () => json({ ok: true, ts: new Date().toISOString() }));

// Mount all route groups
authRoutes(router);
pilotRoutes(router);
xpRoutes(router);
unitRoutes(router);
repairRoutes(router);
accountingRoutes(router);
contractRoutes(router);
playmodeRoutes(router);
salvageRoutes(router);
notificationRoutes(router);

// 404 fallback
router.all('/api/*', () => error(404, 'Not found'));

export default {
  fetch: (request, env, ctx) => {
    // Attach env to request so route helpers can access it
    request.env = env;
    return router.fetch(request, env, ctx).catch(err => {
      console.error(err);
      return error(500, err?.message || 'Internal server error');
    });
  },
};
