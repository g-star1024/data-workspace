// ============ /api/auth — 登录 / 会话 / 注册关闭 ============
import { sha256, token, body, json, preflight, kvGet, kvPut, requireSession } from './_utils.js';

export async function onRequest(req, env) {
  if (req.method === 'OPTIONS') return preflight();
  const u = new URL(req.url);
  const path = u.pathname;

  // POST /api/auth/login
  if (req.method === 'POST' && path === '/api/auth/login') {
    const { name, password } = await body(req);
    if (!name || !password) return json({ ok: false, msg: '用户名和密码必填' }, 400);
    const users = await kvGet(env, 'users', []);
    const u2 = users.find(x => x.name === name);
    if (!u2) return json({ ok: false, msg: '用户不存在' }, 401);
    const hash = await sha256(password + u2.salt);
    if (hash !== u2.password_hash) return json({ ok: false, msg: '密码错误' }, 401);
    const t = token();
    await env.KV.put('session:' + t, JSON.stringify({ userId: u2.id, token: t, createdAt: Date.now() }));
    const { password_hash, salt, ...safe } = u2;
    safe.admin = (safe.roles || []).includes('admin');
    return json({ ok: true, token: t, user: safe });
  }

  // POST /api/auth/register  — 已关闭
  if (req.method === 'POST' && path === '/api/auth/register') {
    return json({ ok: false, msg: '注册已关闭，请联系管理员创建账号' }, 403);
  }

  // GET /api/auth/me
  if (req.method === 'GET' && path === '/api/auth/me') {
    let sess;
    try { sess = await requireSession(req, env); } catch (e) {
      return json({ ok: false, msg: '未登录' }, 401);
    }
    const { password_hash, salt, ...safe } = sess.user;
    return json({ ok: true, user: safe });
  }

  // POST /api/auth/change-password — 用户修改自己的登录密码（需登录，验证原密码）
  if (req.method === 'POST' && path === '/api/auth/change-password') {
    let sess;
    try { sess = await requireSession(req, env); } catch (e) {
      return json({ ok: false, msg: '未登录' }, 401);
    }
    const { oldPassword, newPassword } = await body(req);
    if (!newPassword || String(newPassword).length < 4) {
      return json({ ok: false, msg: '新密码至少 4 位' }, 400);
    }
    const users = await kvGet(env, 'users', []);
    const me = users.find(u => u.id === sess.user.id);
    if (!me) return json({ ok: false, msg: '用户不存在' }, 404);
    const oldHash = await sha256(String(oldPassword || '') + me.salt);
    if (oldHash !== me.password_hash) {
      return json({ ok: false, msg: '原密码错误' }, 400);
    }
    const newSalt = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    me.salt = newSalt;
    me.password_hash = await sha256(String(newPassword) + newSalt);
    await kvPut(env, 'users', users);
    return json({ ok: true, msg: '密码已修改' });
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && path === '/api/auth/logout') {
    let sess;
    try { sess = await requireSession(req, env); } catch (e) {
      return json({ ok: true }); // 不存在的会话也算登出成功
    }
    // 清除当前会话
    const t = req.headers.get('Authorization') || '';
    const tk = t.startsWith('Bearer ') ? t.slice(7) : '';
    if (tk) await env.KV.delete('session:' + tk);
    return json({ ok: true });
  }

  return json({ ok: false, msg: '不支持的路径' }, 404);
}