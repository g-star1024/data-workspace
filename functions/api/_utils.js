// ============ Pages Functions 共享工具 ============
// 供 api/auth.js / admin.js / salary.js / ledger.js / approvals.js 引用

/** 文本 SHA-256 */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 唯一 ID */
function uid() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/** 随机 32 字节 token（16 进制） */
function token() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/** 从 Authorization header 取 bearer token */
function bearer(req) {
  const h = req.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/** 取查询字符串参数 */
function qs(req) {
  const u = new URL(req.url);
  const m = {};
  u.searchParams.forEach((v, k) => { m[k] = v; });
  return m;
}

/** JSON 请求体（兜底空对象） */
async function body(req) {
  try { return req.bodyUsed ? null : await req.json(); } catch (e) { return {}; }
}

/** JSON 响应 */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      ...headers,
    },
  });
}

/** OPTIONS 预检 */
function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    },
  });
}

/** 读 KV 并反序列化，key 为空返回默认值 */
async function kvGet(env, key, defaultVal) {
  const v = await env.KV.get(key);
  if (!v) return defaultVal;
  try { return JSON.parse(v); } catch (e) { return defaultVal; }
}

/** 写 KV（JSON 序列化） */
async function kvPut(env, key, val) {
  await env.KV.put(key, JSON.stringify(val));
}

/**
 * 拆「资料库 SDK 字段包装」→ 标量值。
 * 旧资料库写入时字段形如 {select:'微信'} / {number:100} / {text:'摘要'} / {date:'2026-09-05'}；
 * 迁移到 Cloudflare 后前端表格/聚合按扁平标量读取，这里统一拍平。
 * 标量、数组、未知对象原样返回，兼容历史扁平数据与审批 chain 等结构。
 */
function flattenValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    if (typeof v.select === 'string') return v.select;
    if (v.number !== undefined && v.number !== null) return v.number;
    if (typeof v.text === 'string') return v.text;
    if (v.date !== undefined && v.date !== null) return v.date;
    if (typeof v.value === 'string' || typeof v.value === 'number') return v.value;
    return v;
  }
  return v;
}

// 系统/结构字段不参与拍平（审批 chain、记录元数据等）
const FLATTEN_SKIP = new Set(['id', '_id', 'createdAt', 'updatedAt', 'createdBy', 'chain', 'level', 'status', 'approvers', 'approvals']);

/** 拍平整条记录的业务字段（系统字段原样保留） */
function flattenRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
  const out = {};
  for (const k of Object.keys(rec)) {
    out[k] = FLATTEN_SKIP.has(k) ? rec[k] : flattenValue(rec[k]);
  }
  return out;
}

/** 校验当前会话，返回 {userId, user} 或抛 401 */
async function requireSession(req, env) {
  const t = bearer(req);
  if (!t) throw new Error('UNAUTH');
  const raw = await env.KV.get('session:' + t);
  if (!raw) throw new Error('UNAUTH');
  const sess = JSON.parse(raw);
  if (!sess || !sess.userId) throw new Error('UNAUTH');
  // 读用户
  const users = await kvGet(env, 'users', []);
  const user = users.find(u => u.id === sess.userId);
  if (!user) throw new Error('UNAUTH');
  user.admin = (user.roles || []).includes('admin');
  return { userId: user.id, user };
}

/** 校验管理员权限 */
async function requireAdmin(req, env) {
  const sess = await requireSession(req, env);
  if (!sess.user.roles || !sess.user.roles.includes('admin')) throw new Error('FORBID');
  return sess;
}

export { sha256, uid, token, bearer, qs, body, json, preflight, kvGet, kvPut, requireSession, requireAdmin, flattenValue, flattenRecord };