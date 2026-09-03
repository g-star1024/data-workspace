// ============ /api/salary — 工资台账 CRUD ============
import { uid, body, json, preflight, kvGet, kvPut, requireSession } from './_utils.js';

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  let sess;
  try { sess = await requireSession(req, env); } catch (e) {
    return json({ ok: false, msg: '未登录' }, 401);
  }
  const u = new URL(req.url);
  const path = u.pathname;
  const q = u.searchParams;

  // GET /api/salary — 列表
  if (req.method === 'GET' && path === '/api/salary') {
    const rows = await kvGet(env, 'salary', []);
    // 按月降序
    rows.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
    return json({ ok: true, data: rows });
  }

  // POST /api/salary — 新增
  if (req.method === 'POST' && path === '/api/salary') {
    const p = await body(req);
    const rows = await kvGet(env, 'salary', []);
    rows.push({ id: uid(), createdAt: Date.now(), createdBy: sess.user.id, ...p });
    await kvPut(env, 'salary', rows);
    return json({ ok: true });
  }

  const m = path.match(/^\/api\/salary\/([^\/]+)$/);
  if (m) {
    const id = m[1];
    if (req.method === 'PUT') {
      const p = await body(req);
      let rows = await kvGet(env, 'salary', []);
      const idx = rows.findIndex(r => r.id === id);
      if (idx < 0) return json({ ok: false, msg: '记录不存在' }, 404);
      Object.assign(rows[idx], p);
      rows[idx].updatedAt = Date.now();
      await kvPut(env, 'salary', rows);
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      let rows = await kvGet(env, 'salary', []);
      rows = rows.filter(r => r.id !== id);
      await kvPut(env, 'salary', rows);
      return json({ ok: true });
    }
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}