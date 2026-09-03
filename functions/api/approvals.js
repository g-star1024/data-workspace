// ============ /api/approvals — 报销/审批单 CRUD ============
import { uid, body, json, preflight, kvGet, kvPut, requireSession } from './_utils.js';

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  let sess;
  try { sess = await requireSession(req, env); } catch (e) {
    return json({ ok: false, msg: '未登录' }, 401);
  }
  const u = new URL(req.url);
  const path = u.pathname;

  // GET /api/approvals — 列表（支持 ?mine=1 只查我的）
  if (req.method === 'GET' && path === '/api/approvals') {
    const rows = await kvGet(env, 'approvals', []);
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json({ ok: true, data: rows });
  }

  // POST /api/approvals — 发起报销/审批
  if (req.method === 'POST' && path === '/api/approvals') {
    const p = await body(req);
    const rows = await kvGet(env, 'approvals', []);
    const steps = Array.isArray(p.approvers) ? p.approvers : [];
    const item = {
      id: uid(),
      createdAt: Date.now(),
      createdBy: sess.user.id,
      status: 'pending',
      currentStep: 1,
      steps: steps.map((a, i) => ({ step: i + 1, userId: a, status: 'pending' })),
      ...p,
    };
    delete item.approvers;
    rows.push(item);
    await kvPut(env, 'approvals', rows);
    return json({ ok: true });
  }

  const m = path.match(/^\/api\/approvals\/([^\/]+)$/);
  if (m && req.method === 'PUT') {
    const id = m[1];
    const p = await body(req);
    let rows = await kvGet(env, 'approvals', []);
    const idx = rows.findIndex(r => r.id === id);
    if (idx < 0) return json({ ok: false, msg: '记录不存在' }, 404);
    const a = rows[idx];
    if (p.action === 'approve' || p.action === 'reject') {
      const cur = a.steps.find(s => s.step === a.currentStep);
      if (!cur) return json({ ok: false, msg: '当前环节无效' }, 400);
      cur.status = p.action === 'approve' ? 'approved' : 'rejected';
      cur.user = sess.user.id;
      cur.time = Date.now();
      cur.comment = p.comment || '';
      // 是否全部完成
      const done = a.steps.every(s => s.status !== 'pending');
      a.status = done ? (p.action === 'approve' ? 'approved' : 'rejected') : (p.action === 'approve' ? 'pending' : 'rejected');
      if (p.action === 'approve' && a.currentStep < a.steps.length) a.currentStep++;
    }
    a.updatedAt = Date.now();
    await kvPut(env, 'approvals', rows);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}