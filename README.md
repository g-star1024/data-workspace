# 数据工作台 — Cloudflare Pages 部署

## 架构

- **Cloudflare Pages**：托管 6 个静态页面（导航首页 / 工资 / 流水 / 待处理 / 审批 / 数据大屏）
- **Pages Functions（Worker）**：`/api/*` 后端，处理鉴权、CRUD、审批
- **KV Namespace**：存储用户、会话、工资、流水、审批数据（6 个 key）

## URL 映射

| 路径 | 页面 |
|---|---|
| `/` | 导航首页 |
| `/salary/` | 工资台账 |
| `/ledger/` | 鼎知堂门店收支 |
| `/pending/` | 待处理 |
| `/approval/` | 报销审批 |
| `/screen/` | 数据大屏（深色科技风） |

## API 端点

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | 登录，返回 token | 无 |
| POST | `/api/auth/logout` | 登出 | 需要 token |
| GET | `/api/auth/me` | 当前用户 | 需要 token |
| GET/POST | `/api/admin/bootstrap` | 首次初始化（创建村长账号） | 无（仅无用户时） |
| GET | `/api/admin/users` | 用户列表 | 管理员 |
| POST | `/api/admin/users` | 创建用户 | 管理员 |
| PUT | `/api/admin/users/{id}` | 修改角色 | 管理员 |
| DELETE | `/api/admin/users/{id}` | 删除用户 | 管理员 |
| GET | `/api/salary` | 工资列表 | 已登录 |
| POST | `/api/salary` | 新增工资 | 已登录 |
| PUT | `/api/salary/{id}` | 修改工资 | 已登录 |
| DELETE | `/api/salary/{id}` | 删除工资 | 已登录 |
| GET | `/api/ledger` | 流水列表 | 已登录 |
| GET | `/api/ledger/stats` | 月度聚合 | 已登录 |
| POST | `/api/ledger` | 新增流水 | 已登录 |
| PUT | `/api/ledger/{id}` | 修改流水 | 已登录 |
| DELETE | `/api/ledger/{id}` | 删除流水 | 已登录 |
| GET | `/api/approvals` | 审批列表 | 已登录 |
| POST | `/api/approvals` | 发起报销 | 已登录 |
| PUT | `/api/approvals/{id}` | 审批操作 | 已登录 |

## 部署步骤

1. **Cloudflare 控制台** → Workers & Pages → KV → 创建 Namespace，命名 `数据工作台`
2. **GitHub 新建仓库**（公开/私有均可），clone 本项目并 push
3. **Cloudflare 控制台** → Workers & Pages → Pages → Connect to Git → 选 GitHub 仓库
4. 构建设置：
   - Framework preset: None
   - Build command: (留空)
   - Build output directory: `pages`
5. **Functions → KV Namespaces**：添加绑定，Variable name = `KV`，选刚建的 Namespace
6. **Variables and Secrets**：添加 `CF_API_TOKEN`（可选，用于 wrangler 操作）
7. 提交 push 触发自动部署

## 首次使用

1. 打开首页，访问 `/api/admin/bootstrap` 触发初始化（自动创建村长账号，密码 admin123）
2. 右上角登录 → 用户名 `村长`，密码 `admin123`
3. 登录后立即进入账号管理修改密码
4. 创建员工账号并分配角色

## 数据迁移（从旧 WorkBuddy 版）

旧版数据存于 WorkBuddy 云表，新版存于 KV。首版支持手动录入（数据量通常不大）。如需批量迁移，可在管理员面板导入 JSON（后续迭代）。

## 本地开发

```bash
# 需要 wrangler 已安装且已登录
npx wrangler pages dev pages --kv DATA_KV=<your-kv-id>
```