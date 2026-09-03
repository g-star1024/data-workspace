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

export { sha256, uid, token, bearer, qs, body, json, preflight, kvGet, kvPut, requireSession, requireAdmin };