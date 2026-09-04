// ============ /api/approvals — 报销审批（整表持久化，多端共享） ============
// 前端审批模型为 chain[] / level，服务端不做模型转换，采用「整表存取」：
//   GET  /api/approvals          读取全部审批单
//   POST /api/approvals          传数组 = 整表覆盖；传对象 = 追加一条
//   DELETE /api/approvals/{id}   删除单条
// 注意：不做服务端排序——前端记录的 createdAt 是 'YYYY-MM-DD HH:mm' 字符串，
// 排序会打乱前端 unshift 的顺序，顺序以最后一次整表保存为准。
import { uid, body, json, preflight, kvGet, kvPut, requireSession } from './_utils.js';

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  let sess;
  try { sess = await requireSession(req, env); } catch (e) {
    return json({ ok: false, msg: '未登录' }, 401);
  }
  const path = new URL(req.url).pathname;

  // GET /api/approvals
  if (req.method === 'GET' && path === '/api/approvals') {
    const rows = await kvGet(env, 'approvals', []);
    return json({ ok: true, data: Array.isArray(rows) ? rows : [] });
  }

  // POST /api/approvals — 数组=整表覆盖；对象=追加
  if (req.method === 'POST' && path === '/api/approvals') {
    const p = await body(req);
    if (Array.isArray(p)) {
      // 只保留结构合法（含 id）的记录，避免脏数据写坏整表
      const clean = p.filter(r => r && typeof r === 'object' && r.id);
      await kvPut(env, 'approvals', clean);
      return json({ ok: true, count: clean.length });
    }
    if (!p || typeof p !== 'object') return json({ ok: false, msg: '请求体格式错误' }, 400);
    const rows = await kvGet(env, 'approvals', []);
    rows.unshift({ id: uid(), createdBy: sess.user.id, ...p });
    await kvPut(env, 'approvals', rows);
    return json({ ok: true });
  }

  // DELETE /api/approvals/{id}
  const m = path.match(/^\/api\/approvals\/([^\/]+)$/);
  if (req.method === 'DELETE' && m) {
    let rows = await kvGet(env, 'approvals', []);
    rows = rows.filter(r => r.id !== m[1]);
    await kvPut(env, 'approvals', rows);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}
