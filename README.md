# Averie 做饭档案站

手机优先的做饭档案：三人页 **做过的 / 想做的 / 想吃的**。访客可评分、点想吃；**完整食谱仅站长登录后可见**。

公开站点（GitHub Pages）：https://averieh0202-maker.github.io/averie-cook/

API（Cloudflare Worker）：`https://averie-cook-api.averieh0202.workers.dev`

对标 [averie-skin](https://github.com/averieh0202-maker/averie-skin) 的 **Pages 静态站 + Worker API** 拆分。GitHub Pages 没有持久磁盘，**生产写入不要用本机 SQLite**；评分、想吃、站长会话走 Worker + D1。

## 本地运行

需要 Node.js 22.13+。

```sh
cp api/.dev.vars.example api/.dev.vars
npm install
npm run dev
```

- 前端：http://127.0.0.1:5173 （Vite 把 `/api` 代理到 Worker）
- API：http://127.0.0.1:8787

浏览器打开前端即可。种子数据会在 Worker 首次访问时写入本地 D1（3 道已做的菜）。

单独启动：

```sh
npm run dev:api
npm run dev:web
```

检查：

```sh
npm test
npm run typecheck
npm run build
```

验收食谱不泄漏（Worker 启动后）：

```sh
curl -s http://127.0.0.1:8787/api/dishes/2026-09-14-chicken-pumpkin-risotto
# 响应体不得出现 recipe / ingredients / steps / tasting 等键
```

登录后再看详情会包含 `recipe`：

```sh
curl -s -c /tmp/averie-cook.jar -b /tmp/averie-cook.jar \
  -H 'content-type: application/json' \
  -d '{"password":"averie-cook"}' \
  http://127.0.0.1:8787/api/owner/login

curl -s -b /tmp/averie-cook.jar \
  http://127.0.0.1:8787/api/dishes/2026-09-14-chicken-pumpkin-risotto
```

## 环境变量

### 前端（`web/`，构建期）

| 变量 | 说明 |
|---|---|
| `VITE_API_BASE_URL` | Worker 源站，生产默认 `https://averie-cook-api.averieh0202.workers.dev`。本地留空，走 Vite 代理。 |
| `VITE_BASE` | 静态资源前缀。GitHub Pages 生产为 `/averie-cook/`。 |

`web/.env.production` 已写入生产 API。仓库 Settings → Variables 可设 `VITE_API_BASE_URL` 覆盖。

### Worker（`api/`）

| 变量 | 类型 | 说明 |
|---|---|---|
| `OWNER_PASSWORD` | Secret | 站长登录密码。本地默认 `averie-cook`。**生产必须改掉**，否则登录接口返回 503。 |
| `OWNER_SESSION_SECRET` | Secret | 签发 httpOnly JWT 的密钥，与密码分离，至少 16 位。 |
| `INGEST_SECRET` | Secret | 后续助手写入菜谱：请求头 `X-Ingest-Secret`。与站长 cookie 分离。 |
| `ASSET_BASE_URL` | var | 静态站根，用于拼接封面 URL。生产：`https://averieh0202-maker.github.io/averie-cook` |
| `ENVIRONMENT` | var | `development` 或 `production`。 |

本地把 `api/.dev.vars.example` 复制为 `api/.dev.vars`（已 gitignore）。

生产：

```sh
cd api
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put OWNER_SESSION_SECRET
npx wrangler secret put INGEST_SECRET
```

## 部署

### 1) Cloudflare Worker + D1

```sh
cd api
npx wrangler d1 create averie-cook
```

把返回的 `database_id` 写进 `api/wrangler.toml`，然后：

```sh
npx wrangler d1 migrations apply averie-cook
npx wrangler deploy
```

可选：封面上传需要 KV：

```sh
npx wrangler kv namespace create MEDIA
```

把 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]` 后重新 deploy。未绑定 KV 时，种子封面走 Pages 的 `public/uploads`；`POST /api/owner/upload` 返回 501，可用 `coverPath: "uploads/....jpg"` 指向静态文件。

Worker 名称：`averie-cook-api` → `https://averie-cook-api.<your-subdomain>.workers.dev`。若子域不是 `averieh0202`，改 `web/.env.production` 与 Pages 构建变量。

CORS 已允许 `https://averieh0202-maker.github.io`。站长 cookie：httpOnly；同站 Lax；**跨站 Pages→Worker 时为 SameSite=None; Secure**（否则 github.io 无法带上 workers.dev 的 cookie）。JWT 12 小时过期。

### 2) GitHub Pages

本仓库带 `.github/workflows/pages.yml`：推送到 `main` 时构建 `web/` 并发布。

仓库设置一次即可：

1. Settings → Pages → **Source: GitHub Actions**
2. 合并本 PR 后，等 `Deploy GitHub Pages` workflow 成功
3. 打开 https://averieh0202-maker.github.io/averie-cook/

前端 `base` 为 `/averie-cook/`。SPA 深链靠构建产物里的 `404.html`（拷贝自 `index.html`）。

## 站长登录

1. 打开站点 → **站长登录**
2. 本地密码：`averie-cook`
3. 生产请使用 `wrangler secret put OWNER_PASSWORD` 设置的密码
4. 登录后详情页显示材料、步骤、改进笔记
5. **退出** 清除 httpOnly cookie

访客不需要登录。身份存在浏览器 `localStorage.visitor_key`（UUID），同一把钥匙对同一道菜可改评分、可切换想吃。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/dishes?status=cooked\|want_cook\|want_eat` | 列表，**永不返回 recipe** |
| GET | `/api/dishes/:id` | 详情；匿名 DTO 不含 recipe/notes/calories 等 |
| POST | `/api/dishes/:id/rate` | `{score:1-5}` + 头 `X-Visitor-Key` |
| POST | `/api/dishes/:id/want-eat` | 切换想吃 |
| POST | `/api/owner/login` | `{password}`，httpOnly cookie |
| POST | `/api/owner/logout` | 退出 |
| GET | `/api/owner/me` | `{owner:boolean}` |
| POST | `/api/owner/dishes` | 站长 cookie 或 `X-Ingest-Secret` 创建/更新/软删 |
| POST | `/api/owner/upload` | 图片（需 MEDIA KV） |

Rating / WantEat 唯一约束 `(dishId, visitorKey)`。均分只在服务端聚合。菜有 `published` 与 `deleted_at` 软删除。`coverPath` 只允许 `uploads/文件名` 或 `covers/文件名`，由服务端拼 URL。

登录有 IP 限流（15 分钟 5 次）。

## 数据

种子：`data/seed.json`（与 Worker `api/src/seed.ts` 一致）。

已做 3 道：

- 意式鸡肉南瓜烩饭（封面为 2026-09-14 实拍 1:1 中心裁切）
- 牛肝菌意式烩饭
- 牛肋条卤肉饭

想做页种子为空，走空状态文案。

## 目录

```
web/     Vite + React + Tailwind 静态前端
api/     Cloudflare Worker (Hono) + D1
data/    种子 JSON
```
