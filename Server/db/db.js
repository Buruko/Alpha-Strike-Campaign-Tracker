/**
 * db.js  —  D1 adapter
 *
 * Wraps Cloudflare D1's async API so routes use:
 *   const db = getDb(env);
 *   await db.get(sql, [params])
 *   await db.all(sql, [params])
 *   await db.run(sql, [params])
 *   await db.transaction(async (db) => { ... })
 */

export function getDb(env) {
  const D1 = env.DB;

  async function get(sql, params = []) {
    const result = await D1.prepare(sql).bind(...params).first();
    return result ?? null;
  }

  async function all(sql, params = []) {
    const result = await D1.prepare(sql).bind(...params).all();
    return result.results ?? [];
  }

  async function run(sql, params = []) {
    return await D1.prepare(sql).bind(...params).run();
  }

  async function batch(statements) {
    const prepared = statements.map(({ sql, params = [] }) =>
      D1.prepare(sql).bind(...params)
    );
    return await D1.batch(prepared);
  }

  async function transaction(fn) {
    return await fn({ get, all, run, batch });
  }

  return { get, all, run, batch, transaction };
}
