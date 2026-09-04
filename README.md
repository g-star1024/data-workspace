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

### ⚠️ 关于 `.github/workflows/deploy.yml`

仓库里已有一条 GitHub Actions 部署工作流（走 `wrangler-action`，依赖 `CF_API_TOKEN` / `CF_ACCOUNT_ID` 两个 Secrets）。

它与「Pages Git 集成」是**两条互相独立的部署通道**，二选一即可：

- **只用 Git 集成（推荐）**：删掉 `deploy.yml`，Cloudflare 自动监听 push 并部署，零配置，不需要任何 Secret
- **只用 Actions**：保留 `deploy.yml`，并在仓库 Settings → Secrets and variables → Actions 里配置 `CF_API_TOKEN` 和 `CF_ACCOUNT_ID`

两条同时开着会**重复部署两次**，且 Actions 那条在没配 Secret 时每次 push 都会报红叉。

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