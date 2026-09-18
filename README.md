# Averie 做饭档案站

手机优先的做饭档案：三人页 **做过的 / 想做的 / 想吃的**。访客可评分、点想吃；**完整食谱仅站长登录后可见**。评分使用 **10 分制**（写入 D1 的也是 1–10；旧的 1–5 记录在迁移里 ×2）。

**长期公开 URL（Cloudflare Pages，同源 `/api`）：** https://averie-cook.pages.dev/  
**过渡：** https://averieh0202-maker.github.io/averie-cook/  
**遗留 API：** `https://averie-cook-api.averieh0202.workers.dev`（仅作后备；正常使用不要再让浏览器打 `workers.dev`）

聊天记录不是档案。成菜总结、完整食谱写在 **Cloudflare D1**；图片可写入 D1 `media_objects` / KV / R2。Cloudflare Pages 同时托管静态前端和 **Pages Functions**（同一套 Hono 路由）。GitHub Pages 仍可作过渡静态站。重新部署 Worker / Functions **不会**清空 D1。

首页卡片可直接 **1–10 分评分**（不必进详情）。每人一个身份（`visitor_key`），平均分按不同身份计算。**同一人再评只改自己的分数，不另算一个人。** 匿名响应和 Pages 快照都 **不含完整食谱**。

本机身份写在站点源站的 **localStorage + 第一方 cookie**（`SameSite=Lax`，长期有效）。仅靠 localStorage 时，微信内置浏览器或清除站点数据会当成新人反复投票。可选 **昵称 + PIN 账号**，换设备也能找回同一份分数。

### 大陆手机（不要打 workers.dev）

`*.workers.dev` 在中国大陆手机上经常被墙或极慢。因此：

1. **Canonical 站点**是 Cloudflare Pages：`https://averie-cook.pages.dev`。前端 `VITE_API_BASE_URL` 为空，浏览器只请求 **同源** `/api/*` 与 `/health`（不是另一个 `*.workers.dev` 主机名）。
2. 首页仍是 **static-first**：立刻用同源 `data/catalog.json` 画出菜卡；封面走 `covers/`。Functions 失败时快照仍可用，横幅 **「网络不通，评分暂不可用」**。
3. `workers.dev` Worker 可以继续部署作遗留后备（ingest 脚本、GitHub Pages 过渡期），但登录/注册的正常路径是 Pages 同源 API。

刷新快照：

```sh
npm run snapshot
```

CI 在构建前也会跑。快照只含匿名 DTO，脚本会拒绝写入 recipe。

## 架构（Pages Functions）

没有用 advanced-mode `_worker.js`（那种会拦截全部请求；Functions 挂了静态站也可能一起挂）。

采用 **path-scoped Pages Functions**：

| 路径 | 谁处理 |
|---|---|
| `/api/*` | `functions/api/[[path]].ts` → 现有 Hono `api/src/index.ts` |
| `/health` | `functions/health.ts` → 同一套 Hono |
| `/`、`/data/*`、`/covers/*`、SPA 路由 | Pages 静态资源（`web/dist`） |

`web/public/_routes.json` 把 Functions 调用限制在 `/api/*` 与 `/health`，静态请求不占 Functions 配额。`_redirects` 把不存在的路径回退到 `index.html`（SPA）。

同一份 D1（`averie-cook`，id 已写在根目录 `wrangler.toml`）和 MEDIA KV 绑到 Pages 项目。**不要**再 `d1 create` 一个空库。

## 本地运行

需要 Node.js 22.13+。

```sh
cp api/.dev.vars.example api/.dev.vars
npm install
npm run dev
```

- 前端：http://127.0.0.1:5173 （Vite 把 `/api` 代理到 Worker）
- API：http://127.0.0.1:8787

首次访问会把 3 道已做的菜和烩饭封面写入**本地 D1**（已存在的行不会被覆盖）。

单独启动：`npm run dev:api` / `npm run dev:web`

模拟 Cloudflare Pages（静态 + Functions，同源 `/api`）：

```sh
cp .dev.vars.example .dev.vars   # 若还没有
npm run pages:dev                # 构建 web/dist 后 wrangler pages dev（默认 :8788）
```

```sh
npm test
npm run typecheck
npm run build          # GitHub Pages 模式（/averie-cook/ + workers.dev API）
npm run build:pages    # Cloudflare Pages 模式（/ + 同源 /api）
```

匿名详情不得含 recipe：

```sh
curl -s http://127.0.0.1:8787/api/dishes/2026-09-14-chicken-pumpkin-risotto
# 或: bash scripts/verify-recipe-leak.sh
```

## 环境变量

### 前端（`web/`，构建期）

| 变量 | 说明 |
|---|---|
| `VITE_API_BASE_URL` | API 源站。**Cloudflare Pages 必须留空**（同源相对路径 `/api`）。GitHub Pages 过渡默认 `https://averie-cook-api.averieh0202.workers.dev`。本地留空，走 Vite 代理。 |
| `VITE_BASE` | 静态资源前缀。Cloudflare Pages 为 `/`；GitHub Pages 为 `/averie-cook/`。 |

`web/.env.pages` 给 `npm run build:pages` 用；`web/.env.production` 给 GitHub Pages 构建用。

### Worker / Pages Functions（同一套 Hono）

| 变量 | 类型 | 说明 |
|---|---|---|
| `OWNER_PASSWORD` | Secret | 站长登录。本地默认 `averie-cook`。**生产必须改掉**。 |
| `OWNER_SESSION_SECRET` | Secret | httpOnly JWT，与密码分离，至少 16 位。 |
| `INGEST_SECRET` | Secret | 米其林大厨写入接口：请求头 `X-Ingest-Secret`。与站长 cookie 分离。 |
| `ASSET_BASE_URL` | var | 静态封面根。Pages Functions 在 `*.pages.dev` 上会改用请求 origin（同源 covers）。遗留 Worker 生产：`https://averieh0202-maker.github.io/averie-cook` |
| `ENVIRONMENT` | var | `development` 或 `production`。 |

本地：`cp api/.dev.vars.example api/.dev.vars`（gitignore）。Pages 本地再 `cp .dev.vars.example .dev.vars`。

**Pages 与 Worker 的 secret 是分开的**，但必须填**同一组值**（PIN 哈希、站长会话都依赖 `OWNER_SESSION_SECRET`）。不要提交明文。

## 如何 seed

种子源文件：`data/seed.json`（与 `api/src/seed.ts` 一致）。烩饭 1:1 封面在 Worker 资源 `api/src/assets/`。

空的 D1 在 API **第一次处理业务请求**时导入：

- 8 个分类
- 3 道已做的菜（含完整 `recipe` JSON，仅站长 API 返回）
- 烩饭封面 blob → `media_objects`（以及已绑定的 KV/R2）

`INSERT … ON CONFLICT DO NOTHING`：库里已有这三道菜时，**不会**用种子覆盖食谱或评分。刷新页面、重新 `wrangler deploy` / `pages deploy` 都不会丢 D1 数据（除非有人手动删库）。

本地也可先跑：

```sh
cd api
npx wrangler d1 migrations apply averie-cook --local
npm run dev
curl -s http://127.0.0.1:8787/api/dishes?status=cooked
```

应看到 3 道菜。烩饭封面 URL 形如  
`https://averie-cook.pages.dev/covers/2026-09-14-chicken-pumpkin-risotto.jpg`  
（遗留 Worker 仍可能指到 GitHub Pages 同源 covers。）匿名快照在 `web/public/data/`（`npm run snapshot` 生成；`bash scripts/verify-recipe-leak.sh --snapshot-only` 检查不含食谱）。

## 如何 ingest（米其林大厨）

请求头必须带 `X-Ingest-Secret: <INGEST_SECRET>`。不要用站长密码。

把 `$PAGES` 换成实际 Pages 域名（第一次 deploy 后 wrangler 会打印）。

```sh
PAGES=https://averie-cook.pages.dev

# 健康检查
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" \
  "$PAGES/api/ingest/health"

# 写入已做/想做（含私密食谱）
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" -H 'content-type: application/json' \
  -d '{
    "id": "2026-09-20-tomato-noodle",
    "title": "番茄牛腩面",
    "status": "want_cook",
    "categories": ["chinese","beef"],
    "recipe": { "summary": "想做", "steps": ["备菜"] }
  }' \
  "$PAGES/api/ingest/dishes"

# 上传封面（multipart 字段名 file），得到 coverPath 后再写进菜
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" \
  -F "file=@cover.jpg" \
  "$PAGES/api/ingest/upload"
```

遗留 Worker 仍可用同一路径，把 `$PAGES` 换成 `https://averie-cook-api.averieh0202.workers.dev`。

`status`：`cooked`（已做）或 `want_cook`（想做）。`deleted: true` 软删除。同一 `id` 再 POST 为更新。

兼容路径：`POST /api/owner/dishes` 与 `/api/owner/upload` 也可使用同一 ingest 头。

## 部署

**不要**再执行 `npx wrangler d1 create averie-cook`：远程库已经存在（`database_id` 写在根目录 `wrangler.toml` 与 `api/wrangler.toml`）。也不要新建 MEDIA KV。

**不要**把 `OWNER_PASSWORD` 设成默认值 `averie-cook`。

### 1) Cloudflare Pages（canonical：静态站 + 同源 API）

在已登录 wrangler 的机器上（免费账号 `averieh0202`）：

```sh
# 一次性：创建 Pages 项目（若已存在会报错，可忽略，继续 deploy）
npx wrangler pages project create averie-cook --production-branch main

# 一次性：把现有 Worker 上的同一组 secret 写到 Pages 项目（交互式；不要写进 git）
npx wrangler pages secret put OWNER_PASSWORD --project-name averie-cook
npx wrangler pages secret put OWNER_SESSION_SECRET --project-name averie-cook
npx wrangler pages secret put INGEST_SECRET --project-name averie-cook

# D1 / KV 绑定已写在仓库根 wrangler.toml，pages deploy 时生效。
# 若 dashboard 里还没有绑定，确认项目 Settings → Bindings：
#   DB    → D1  averie-cook   (b05980b7-5117-428f-9347-a2e5c649afa5)
#   MEDIA → KV  8d276e34e2944f18800074735ffaba8b

# 构建（VITE_BASE=/、VITE_API_BASE_URL 为空）并发布
npm ci
npm run snapshot                 # 可选：从当前 API 刷新匿名快照
npm run build:pages
npx wrangler pages deploy        # 读取 pages_build_output_dir=./web/dist
# 等价：npm run deploy:pages
```

`wrangler.toml` 的 `name = "averie-cook"` 必须对上 Pages 项目名。部署成功后终端会打印生产 URL，形如 `https://averie-cook.pages.dev`（若被占用则为 `https://averie-cook-<hash>.pages.dev`）。把 README 顶部与 `ASSET_BASE_URL` 换成实际 URL。

若 D1 还没跑过评分账号迁移：

```sh
npx wrangler d1 migrations apply averie-cook --remote
```

（根目录与 `api/wrangler.toml` 指向**同一个** `database_id`，只 apply 一次。）

#### 上线冒烟

浏览器 DevTools 打开 **https://averie-cook.pages.dev**（不要走 github.io）：

1. 首页立刻出现菜卡（同源 `/data/catalog.json` + `/covers/`）。
2. Network 里列表/登录请求是 `https://averie-cook.pages.dev/api/...`，**没有** `averie-cook-api.*.workers.dev`。
3. `GET /health` → `{ ok: true, service: "averie-cook-api" }`。
4. 匿名打开一道菜：响应 **没有** `recipe`。
5. 站长登录（Bearer + 同源 cookie）后详情出现食谱。
6. 昵称 + PIN 注册/登录后页眉显示昵称；评分写入同一 `visitor_key`。

### 2) 遗留 Worker（可选后备）

GitHub Pages 过渡期、或 Pages Functions 尚未绑定时，仍可发布独立 Worker：

```sh
cd api
npx wrangler d1 migrations apply averie-cook --remote
npx wrangler deploy
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put OWNER_SESSION_SECRET
npx wrangler secret put INGEST_SECRET
```

这与 Pages **共用同一 D1 / KV**。CORS 仍允许 `https://averieh0202-maker.github.io`。

### 3) GitHub Pages（过渡静态站）

1. Settings → Pages → **Source: GitHub Actions**
2. 合并到 `main` 后等 `Deploy GitHub Pages`（构建前会 `npm run snapshot`）
3. 打开 https://averieh0202-maker.github.io/averie-cook/

该构建仍把 `VITE_API_BASE_URL` 指到 `workers.dev`（可用 repo variable 改成 Pages URL）。即使 API 不可达，首页也应显示三道已做的菜和封面。

## 站长登录与评分账号

本地站长密码：`averie-cook`。生产用 wrangler / pages secret。登录后详情显示材料与步骤。

访客评分身份：

1. **匿名（默认）**：`visitor_key` 存在 **localStorage** 和站点第一方 cookie（Cloudflare Pages 路径 `/`；GitHub Pages 路径 `/averie-cook`，`SameSite=Lax`，长期 Max-Age）。刷新、返回、部分微信内置浏览器清 localStorage 时，只要 cookie 还在就能对上原来的分。
2. **评分账号（推荐）**：昵称 + 4–6 位数字 PIN。第一次提交即注册，以后同一组登录。服务端只存 PIN 哈希，API 不返回 PIN。登录后评分都记在该账号的 `visitor_key` 上（`ON CONFLICT` 更新，一人一菜一分）。页眉显示昵称；退出会清空本机身份（需确认），账号和已打的分仍在服务器。

Cloudflare Pages 上前端与 `/api` **同源**，站长 httpOnly cookie（`SameSite=Lax`）可用；JSON `token` + `Authorization: Bearer` 仍然发送，兼容 GitHub Pages → Worker 跨站。评分账号 token 放在 `X-Rater-Token`。`GET /api/dishes/:id` 只在站长会话有效时包含 `recipe`；匿名响应继续剥除食谱字段。

## API 摘要

生产以 Pages 同源为准，例如 `https://averie-cook.pages.dev/api/dishes`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/dishes?status=` | 列表，永不返回 recipe |
| GET | `/api/dishes/:id` | 匿名无 recipe；站长 cookie 或 Bearer 才有 |
| GET | `/api/media/:file` | 持久化封面 |
| POST | `/api/dishes/:id/rate` | 1–10 分；同一 `visitor_key` 更新，不新增人数 |
| POST | `/api/dishes/:id/want-eat` | 切换想吃 |
| POST | `/api/account/login` | 昵称 + PIN → 注册或登录，返回 `visitorKey` 与 token |
| GET | `/api/account/me` | 当前评分账号（无则 `{ rater: false }`） |
| POST | `/api/ingest/dishes` | **INGEST_SECRET** 写入菜谱 |
| POST | `/api/ingest/upload` | **INGEST_SECRET** 存图 |
| GET | `/api/ingest/health` | ingest 密钥探活 |
| POST | `/api/owner/login` | 站长密码 → httpOnly cookie **和** JSON `token`（跨站 Bearer） |

## 目录

```
web/         静态前端（GitHub Pages 与 Cloudflare Pages 共用；public/data 快照）
api/         Hono API（Pages Functions 与遗留 Worker 共用）+ D1 迁移
functions/   Cloudflare Pages Functions 适配器（仅 /api/* 与 /health）
wrangler.toml  Pages 项目 averie-cook（D1/KV 绑定、pages_build_output_dir）
data/        种子 JSON（导入 D1；快照脚本读取，不含到匿名前端）
scripts/     导出匿名快照、检查 recipe 泄漏、校验 Pages 同源构建
```
