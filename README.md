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

## 仓库

`https://github.com/g-star1024/data-workspace`（主分支 `main`，已推送）

## 部署步骤

> 状态：**代码已推送到 GitHub**，剩余为 Cloudflare 侧配置（必须你在控制台做）。

1. **Cloudflare 控制台** → Workers & Pages → KV → 创建 Namespace，命名 `数据工作台`，记下 Namespace ID
2. **Cloudflare 控制台** → Workers & Pages → Pages → **Connect to Git** → 授权并选择 `g-star1024/data-workspace`
3. 构建设置：
   - Framework preset: **None**
   - Build command: **留空**
   - Build output directory: **`pages`**
4. 部署完成后 → **Settings → Functions → KV Namespaces** → Add binding：
   - Variable name = **`KV`**
   - KV namespace = 第 1 步建的 Namespace
5. 改完绑定后**重新部署一次**（Deployments → Retry deployment），KV 绑定才生效

### 部署通道：Cloudflare Pages Git 集成

已确定**只走 Git 集成**，不使用 GitHub Actions（`.github/workflows/deploy.yml` 已移除）。

原因：Pages 项目的 KV 绑定**必须**在 Cloudflare 控制台手动配置（`functions/api/*.js` 读 `env.KV`，而 Pages 不认 `wrangler.toml` 里的 bindings）。既然这一步绕不开，Actions 的 Secret 配置就是纯冗余，且两条通道并存会导致重复部署。

> ⚠️ **KV 绑定是硬依赖**：没配 `KV` 绑定前，页面能打开，但所有 `/api/*` 会 500。这是部署后第一件要确认的事。

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