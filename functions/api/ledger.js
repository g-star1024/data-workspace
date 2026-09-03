// ============ /api/ledger — 门店流水 CRUD ============
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

  // GET /api/ledger
  if (req.method === 'GET' && path === '/api/ledger') {
    let rows = await kvGet(env, 'ledger', []);
    rows.sort((a, b) => String(b.transactionTime || b.date || '').localeCompare(String(a.transactionTime || a.date || '')));
    return json({ ok: true, data: rows });
  }

  // GET /api/ledger/stats?month=YYYY-MM — 聚合统计（供大屏/汇总用）
  if (req.method === 'GET' && path === '/api/ledger/stats') {
    const rows = await kvGet(env, 'ledger', []);
    const out = {};
    rows.forEach(r => {
      const key = String(r.month || r.transactionTime || '').slice(0, 7);
      if (!out[key]) out[key] = { month: key, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
      const amt = Number(r.amount || 0);
      const t = r.type || r.ioType || '';
      if (t === '收入') { out[key].income += amt; out[key].incomeCount++; }
      else { out[key].expense += amt; out[key].expenseCount++; }
    });
    return json({ ok: true, data: Object.values(out) });
  }

  // POST /api/ledger
  if (req.method === 'POST' && path === '/api/ledger') {
    const p = await body(req);
    const rows = await kvGet(env, 'ledger', []);
    rows.push({ id: uid(), createdAt: Date.now(), createdBy: sess.user.id, ...p });
    await kvPut(env, 'ledger', rows);
    return json({ ok: true });
  }

  const m = path.match(/^\/api\/ledger\/([^\/]+)$/);
  if (m) {
    const id = m[1];
    if (req.method === 'PUT') {
      const p = await body(req);
      let rows = await kvGet(env, 'ledger', []);
      const idx = rows.findIndex(r => r.id === id);
      if (idx < 0) return json({ ok: false, msg: '记录不存在' }, 404);
      Object.assign(rows[idx], p);
      rows[idx].updatedAt = Date.now();
      await kvPut(env, 'ledger', rows);
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      let rows = await kvGet(env, 'ledger', []);
      rows = rows.filter(r => r.id !== id);
      await kvPut(env, 'ledger', rows);
      return json({ ok: true });
    }
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}