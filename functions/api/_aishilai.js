// ============ /api/aishilai - 艾诗莱美数据分析 ============
// 提供艾诗莱美门店的推广数据和交易数据的读写接口

import { json, qs, body, kvGet, kvPut, requireSession } from './_utils.js';

const KV_KEY = 'aishilai_data';

/**
 * GET /api/aishilai/data - 获取艾诗莱美数据
 * 无需登录（数据不涉密，类似大屏）
 */
async function getData(req, env) {
  const data = await kvGet(env, KV_KEY, null);
  if (!data) {
    return json({ ok: false, msg: '暂无数据，请先导入' });
  }
  return json({ ok: true, data });
}

/**
 * POST /api/aishilai/data - 更新艾诗莱美数据
 * 需要登录
 * body: { storeReport: [...], promotionSummary: [...] }
 */
async function setData(req, env) {
  try {
    await requireSession(req, env);
  } catch (e) {
    return json({ ok: false, msg: '未登录' }, 401);
  }

  const b = await body(req);
  if (!b || !b.storeReport) {
    return json({ ok: false, msg: '缺少 storeReport 字段' }, 400);
  }

  const data = {
    storeReport: Array.isArray(b.storeReport) ? b.storeReport : [],
    promotionSummary: Array.isArray(b.promotionSummary) ? b.promotionSummary : [],
    updatedAt: new Date().toISOString(),
  };

  await kvPut(env, KV_KEY, data);
  return json({ ok: true, msg: '数据已更新', count: data.storeReport.length });
}

/**
 * GET /api/aishilai/monthly - 获取按月聚合的数据
 * 查询参数: month=2026-01 (可选，不传返回所有月份列表)
 */
async function getMonthlyData(req, env) {
  const data = await kvGet(env, KV_KEY, null);
  if (!data || !data.storeReport) {
    return json({ ok: false, msg: '暂无数据' });
  }

  const q = qs(req);
  const month = q.month; // 格式: 2026-01

  // 按月聚合
  const byMonth = {};
  data.storeReport.forEach(row => {
    const mk = row.date.slice(0, 7); // 2026-01
    if (!byMonth[mk]) {
      byMonth[mk] = {
        month: mk,
        cost: 0,
        exposure: 0,
        clicks: 0,
        merchantViews: 0,
        phoneViews: 0,
        onlineConsultClicks: 0,
        reviewViews: 0,
        prepaidOrderQty: 0,
        appointmentIntent: 0,
        customerLeads: 0,
        prepaidClicks: 0,
        days: 0,
      };
    }
    byMonth[mk].cost += row.cost || 0;
    byMonth[mk].exposure += row.exposure || 0;
    byMonth[mk].clicks += row.clicks || 0;
    byMonth[mk].merchantViews += row.merchantViews || 0;
    byMonth[mk].phoneViews += row.phoneViews || 0;
    byMonth[mk].onlineConsultClicks += row.onlineConsultClicks || 0;
    byMonth[mk].reviewViews += row.reviewViews || 0;
    byMonth[mk].prepaidOrderQty += row.prepaidOrderQty || 0;
    byMonth[mk].appointmentIntent += row.appointmentIntent || 0;
    byMonth[mk].customerLeads += row.customerLeads || 0;
    byMonth[mk].prepaidClicks += row.prepaidClicks || 0;
    byMonth[mk].days++;
  });

  // 计算衍生指标
  const months = Object.keys(byMonth).sort();
  months.forEach(mk => {
    const m = byMonth[mk];
    m.clickAvgPrice = m.clicks > 0 ? Math.round(m.cost / m.clicks * 100) / 100 : 0;
    m.leadCost = m.customerLeads > 0 ? Math.round(m.cost / m.customerLeads * 100) / 100 : 0;
    m.clickRate = m.exposure > 0 ? Math.round(m.clicks / m.exposure * 10000) / 100 : 0;
    m.leadRate = m.clicks > 0 ? Math.round(m.customerLeads / m.clicks * 10000) / 100 : 0;
  });

  if (month) {
    const m = byMonth[month];
    if (!m) return json({ ok: false, msg: '该月份无数据' });
    return json({ ok: true, data: m });
  }

  return json({ ok: true, data: months.map(mk => byMonth[mk]) });
}

/**
 * 路由分发
 */
export async function onRequest(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/aishilai' || path === '/api/aishilai/') {
    return json({ ok: true, msg: '艾诗莱美数据分析 API', endpoints: ['data', 'monthly'] });
  }

  if (path === '/api/aishilai/data') {
    if (method === 'GET') return getData(req, env);
    if (method === 'POST') return setData(req, env);
    return json({ ok: false, msg: '不支持的方法' }, 405);
  }

  if (path === '/api/aishilai/monthly') {
    if (method === 'GET') return getMonthlyData(req, env);
    return json({ ok: false, msg: '不支持的方法' }, 405);
  }

  return json({ ok: false, msg: '未找到路径: ' + path }, 404);
}
