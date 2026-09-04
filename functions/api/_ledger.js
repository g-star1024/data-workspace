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
    // 字段名必须与前端一致（中文业务字段），按交易时间降序
    let rows = await kvGet(env, 'ledger', []);
    rows.sort((a, b) => String(b['交易时间'] || '').localeCompare(String(a['交易时间'] || '')));
    return json({ ok: true, data: rows });
  }

  // GET /api/ledger/stats?month=YYYY-MM — 聚合统计（供大屏/汇总用）
  if (req.method === 'GET' && path === '/api/ledger/stats') {
    const rows = await kvGet(env, 'ledger', []);
    const out = {};
    rows.forEach(r => {
      // 前端字段：交易时间 / 收支类型 / 金额
      const key = String(r['交易时间'] || '').slice(0, 7);
      if (!out[key]) out[key] = { month: key, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
      const amt = Number(r['金额'] || 0);
      const t = r['收支类型'] || '';
      if (t === '收入') { out[key].income += amt; out[key].incomeCount++; }
      else if (t === '支出') { out[key].expense += amt; out[key].expenseCount++; }
    });
    const data = Object.values(out).sort((a, b) => String(b.month).localeCompare(String(a.month)));
    return json({ ok: true, data });
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