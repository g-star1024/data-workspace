// ============ /api/admin — 用户管理（仅管理员） ============
import { sha256, uid, token, body, json, preflight, kvGet, kvPut, requireSession, requireAdmin } from './_utils.js';

function salt6() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  const u = new URL(req.url);
  const path = u.pathname;

  // GET/POST /api/admin/bootstrap — 首次初始化：无用户时创建村长账号（无鉴权）
  if (path === '/api/admin/bootstrap') {
    const users = await kvGet(env, 'users', []);
    if (users.length > 0) return json({ ok: false, msg: '已有用户，跳过初始化' }, 409);
    let pw = 'admin123';
    if (req.method === 'POST') {
      const b = await body(req);
      if (b.password && String(b.password).length >= 4) pw = b.password;
    }
    const s = salt6();
    const hash = await sha256(pw + s);
    const admin = {
      id: 'u_admin', name: '村长', password_hash: hash, salt: s,
      roles: ['initiator', 'approver', 'admin'], createdAt: Date.now(), builtin: true,
    };
    await kvPut(env, 'users', [admin]);
    return json({ ok: true, user: { id: admin.id, name: admin.name, roles: admin.roles, admin: true } });
  }

  // GET /api/admin/users — 只读名单，任何已登录用户可读
  // 原因：发起人提交报销时需要拉取「审批人」名单，若限管理员则普通用户无法发起报销。
  // 响应已剔除 password_hash / salt，不泄露凭据。写操作（POST/PUT/DELETE）仍限管理员。
  if (req.method === 'GET' && path === '/api/admin/users') {
    let sess;
    try { sess = await requireSession(req, env); } catch (e) {
      return json({ ok: false, msg: '未登录' }, 401);
    }
    const users = await kvGet(env, 'users', []);
    const safe = users.map(u => { const { password_hash, salt, ...r } = u; r.admin = (r.roles || []).includes('admin'); return r; });
    return json({ ok: true, users: safe });
  }

  // 以下写操作一律要求管理员
  let sess;
  try { sess = await requireAdmin(req, env); } catch (e) {
    return json({ ok: false, msg: '无管理员权限' }, 403);
  }

  // POST /api/admin/users
  if (req.method === 'POST' && path === '/api/admin/users') {
    const { name, password, roles } = await body(req);
    if (!name || !password) return json({ ok: false, msg: '用户名和密码必填' }, 400);
    const users = await kvGet(env, 'users', []);
    if (users.find(u => u.name === name)) return json({ ok: false, msg: '用户名已存在' }, 409);
    const s = salt6();
    const hash = await sha256(password + s);
    const newUser = {
      id: uid(),
      name,
      password_hash: hash,
      salt: s,
      roles: roles && Array.isArray(roles) ? roles : ['initiator'],
      createdAt: Date.now(),
    };
    users.push(newUser);
    await kvPut(env, 'users', users);
    const { password_hash, salt, ...safe } = newUser;
    safe.admin = (safe.roles || []).includes('admin');
    return json({ ok: true, user: safe });
  }

  // PUT /api/admin/users/{id} — 改角色
  const m = path.match(/^\/api\/admin\/users\/([^\/]+)$/);
  if (req.method === 'PUT' && m) {
    const targetId = m[1];
    const { roles } = await body(req);
    if (!roles || !Array.isArray(roles)) return json({ ok: false, msg: 'roles 必须是数组' }, 400);
    const users = await kvGet(env, 'users', []);
    const idx = users.findIndex(u => u.id === targetId);
    if (idx < 0) return json({ ok: false, msg: '用户不存在' }, 404);
    users[idx].roles = roles;
    await kvPut(env, 'users', users);
    const { password_hash, salt, ...safe } = users[idx];
    safe.admin = (safe.roles || []).includes('admin');
    return json({ ok: true, user: safe });
  }

  // DELETE /api/admin/users/{id}
  if (req.method === 'DELETE' && m) {
    const targetId = m[1];
    if (targetId === sess.user.id) return json({ ok: false, msg: '不能删除自己' }, 409);
    let users = await kvGet(env, 'users', []);
    users = users.filter(u => u.id !== targetId);
    await kvPut(env, 'users', users);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}