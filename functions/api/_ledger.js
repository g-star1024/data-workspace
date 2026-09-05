// ============ /api/ledger — 门店流水 CRUD ============
import { uid, body, json, preflight, kvGet, kvPut, requireSession, flattenRecord } from './_utils.js';

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  const u = new URL(req.url);
  const path = u.pathname;
  const q = u.searchParams;

  // GET /api/ledger/summary — 免登录公开聚合（供数据大屏投屏常驻）
  // 只返回 KPI 汇总数字（总收入/支出/月度/渠道/分类），绝不返回逐笔明细行，
  // 明细仍走下方需登录的 /api/ledger。字段名与前端中文业务字段一致。
  if (req.method === 'GET' && path === '/api/ledger/summary') {
    const rows = (await kvGet(env, 'ledger', [])).map(flattenRecord);
    const a = {
      income: 0, expense: 0, net: 0, inCnt: 0, outCnt: 0, wx: 0,
      byChannel: {}, byCategory: {}, byMonth: {},
    };
    rows.forEach(r => {
      const amt = Number(r['金额'] || 0);
      const isIn = r['收支类型'] === '收入';
      const mk = String(r['交易时间'] || '').slice(0, 7);
      if (mk) {
        if (!a.byMonth[mk]) a.byMonth[mk] = { month: mk, income: 0, expense: 0, inCnt: 0, outCnt: 0 };
        if (isIn) { a.byMonth[mk].income += amt; a.byMonth[mk].inCnt++; }
        else { a.byMonth[mk].expense += amt; a.byMonth[mk].outCnt++; }
      }
      if (isIn) {
        a.income += amt; a.inCnt++;
        const ch = r['渠道'] || '其他';
        a.byChannel[ch] = (a.byChannel[ch] || 0) + amt;
        if (ch === '微信') a.wx += amt;
      } else {
        a.expense += amt; a.outCnt++;
        const ct = r['分类'] || '其他支出';
        a.byCategory[ct] = (a.byCategory[ct] || 0) + amt;
      }
    });
    a.net = a.income - a.expense;
    return json({ ok: true, data: a });
  }

  let sess;
  try { sess = await requireSession(req, env); } catch (e) {
    return json({ ok: false, msg: '未登录' }, 401);
  }

  // GET /api/ledger
  if (req.method === 'GET' && path === '/api/ledger') {
    // 字段名必须与前端一致（中文业务字段），按交易时间降序；读时拍平兼容历史包装数据
    let rows = (await kvGet(env, 'ledger', [])).map(flattenRecord);
    rows.sort((a, b) => String(b['交易时间'] || '').localeCompare(String(a['交易时间'] || '')));
    return json({ ok: true, data: rows });
  }

  // GET /api/ledger/stats?month=YYYY-MM — 聚合统计（供大屏/汇总用）
  if (req.method === 'GET' && path === '/api/ledger/stats') {
    const rows = (await kvGet(env, 'ledger', [])).map(flattenRecord);
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
    const p = flattenRecord(await body(req));
    const rows = (await kvGet(env, 'ledger', [])).map(flattenRecord);
    rows.push({ id: uid(), createdAt: Date.now(), createdBy: sess.user.id, ...p });
    await kvPut(env, 'ledger', rows);
    return json({ ok: true });
  }

  const m = path.match(/^\/api\/ledger\/([^\/]+)$/);
  if (m) {
    const id = m[1];
    if (req.method === 'PUT') {
      const p = flattenRecord(await body(req));
      let rows = (await kvGet(env, 'ledger', [])).map(flattenRecord);
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