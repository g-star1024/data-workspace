// ============ /api/* 统一路由入口 ============
// Cloudflare Pages Functions 的路由规则：一个 xxx.js 只匹配该精确路径，
// 不匹配子路径（functions/api/auth.js 只匹配 /api/auth，匹配不到 /api/auth/login）。
// 因此这里用 catch-all（[[path]].js）接收全部 /api/* 并按前缀分发；
// 真正的处理逻辑放在 _ 开头的模块中（Pages 会把 _ 前缀文件排除在路由之外）。

import { json, preflight } from './_utils.js';
import { onRequest as authHandler } from './_auth.js';
import { onRequest as adminHandler } from './_admin.js';
import { onRequest as salaryHandler } from './_salary.js';
import { onRequest as ledgerHandler } from './_ledger.js';
import { onRequest as approvalsHandler } from './_approvals.js';

export async function onRequest(context) {
  // Pages Functions 传入 context（含 request / env / params），
  // 各处理模块的签名统一为 onRequest(req, env)，这里做适配。
  const req = context.request || context;
  const env = context.env || {};

  if (req.method === 'OPTIONS') return preflight();

  const path = new URL(req.url).pathname;

  if (path === '/api' || path === '/api/') {
    return json({ ok: true, msg: 'data-workspace api', endpoints: ['auth', 'admin', 'salary', 'ledger', 'approvals'] });
  }
  if (path.startsWith('/api/auth')) return authHandler(req, env);
  if (path.startsWith('/api/admin')) return adminHandler(req, env);
  if (path.startsWith('/api/salary')) return salaryHandler(req, env);
  if (path.startsWith('/api/ledger')) return ledgerHandler(req, env);
  if (path.startsWith('/api/approvals')) return approvalsHandler(req, env);

  return json({ ok: false, msg: '不支持的路径：' + path }, 404);
}
