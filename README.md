# Averie 做饭档案站

手机优先的做饭档案：三人页 **做过的 / 想做的 / 想吃的**。访客可评分、点想吃；**完整食谱仅站长登录后可见**。评分使用 **10 分制**（写入 D1 的也是 1–10；旧的 1–5 记录在迁移里 ×2）。

**长期公开 URL：** https://averieh0202-maker.github.io/averie-cook/  
**API：** `https://averie-cook-api.averieh0202.workers.dev`（部署后按你的 workers 子域替换）

聊天记录不是档案。成菜总结、完整食谱写在 **Cloudflare D1**；图片可写入 D1 `media_objects` / KV / R2。GitHub Pages 托管静态前端，并带一份 **匿名菜品快照**（标题、日期、分类、封面、平均分）。重新部署 Worker **不会**清空 D1。

首页卡片可直接 **1–10 分评分**（不必进详情）。每人一个身份（`visitor_key`），平均分按不同身份计算。**同一人再评只改自己的分数，不另算一个人。** 匿名响应和 Pages 快照都 **不含完整食谱**。

本机身份写在 GitHub Pages 源站的 **localStorage + 第一方 cookie**（`SameSite=Lax`，长期有效）。仅靠 localStorage 时，微信内置浏览器或清除站点数据会当成新人反复投票。可选 **昵称 + PIN 账号**，换设备也能找回同一份分数。

### 大陆手机（workers.dev 不可达）

`*.workers.dev` 在中国大陆手机上经常被墙或极慢。若首页死等 Worker 列表接口，就会一直骨架屏 / 「信息加载不出来」。

因此首页是 **static-first**：

1. 立刻用 GitHub Pages 同源的 `data/catalog.json`（以及 `data/dishes-cooked.json`）画出菜卡：标题、日期、分类、快照平均分、封面。
2. 封面只走 Pages：`web/public/covers/`（烩饭实拍 JPEG；另外两道暂无成菜照片时用设计占位图）。**不请求** `/api/media`。
3. 再用很短超时尝试 Worker。成功则刷新实时评分、登录态、想吃；失败则保留快照，并显示非阻断提示 **「网络不通，评分暂不可用」**。评分 / 想吃写入同样软失败，整页不会空白。

不需要为此购买自定义域名。可读路径只部署 GitHub Pages 即可；Worker 只用于登录、评分、想吃、ingest。

刷新快照：

```sh
npm run snapshot
```

CI 在 Pages 构建前也会跑。快照只含匿名 DTO，脚本会拒绝写入 recipe。

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

```sh
npm test
npm run typecheck
npm run build
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
| `VITE_API_BASE_URL` | Worker 源站。生产默认 `https://averie-cook-api.averieh0202.workers.dev`。本地留空，走 Vite 代理。 |
| `VITE_BASE` | 静态资源前缀。GitHub Pages 为 `/averie-cook/`。 |

### Worker（`api/`）

| 变量 | 类型 | 说明 |
|---|---|---|
| `OWNER_PASSWORD` | Secret | 站长登录。本地默认 `averie-cook`。**生产必须改掉**。 |
| `OWNER_SESSION_SECRET` | Secret | httpOnly JWT，与密码分离，至少 16 位。 |
| `INGEST_SECRET` | Secret | 米其林大厨写入接口：请求头 `X-Ingest-Secret`。与站长 cookie 分离。 |
| `ASSET_BASE_URL` | var | Pages 根。生产：`https://averieh0202-maker.github.io/averie-cook` |
| `ENVIRONMENT` | var | `development` 或 `production`。 |

本地：`cp api/.dev.vars.example api/.dev.vars`（gitignore）。

生产：

```sh
cd api
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put OWNER_SESSION_SECRET
npx wrangler secret put INGEST_SECRET
```

## 如何 seed

种子源文件：`data/seed.json`（与 `api/src/seed.ts` 一致）。烩饭 1:1 封面在 Worker 资源 `api/src/assets/`。

空的 D1 在 Worker **第一次处理业务请求**时导入：

- 8 个分类
- 3 道已做的菜（含完整 `recipe` JSON，仅站长 API 返回）
- 烩饭封面 blob → `media_objects`（以及已绑定的 KV/R2）

`INSERT … ON CONFLICT DO NOTHING`：库里已有这三道菜时，**不会**用种子覆盖食谱或评分。刷新页面、重新 `wrangler deploy` 都不会丢 D1 数据（除非有人手动删库）。

本地也可先跑：

```sh
cd api
npx wrangler d1 migrations apply averie-cook --local
npm run dev
curl -s http://127.0.0.1:8787/api/dishes?status=cooked
```

应看到 3 道菜。烩饭封面 URL 形如  
`https://averieh0202-maker.github.io/averie-cook/covers/2026-09-14-chicken-pumpkin-risotto.jpg`  
另外两道若 Worker 仍返回 `coverUrl: null`，前端会改用 Pages 占位封面。匿名快照在 `web/public/data/`（`npm run snapshot` 生成；`bash scripts/verify-recipe-leak.sh --snapshot-only` 检查不含食谱）。

## 如何 ingest（米其林大厨）

请求头必须带 `X-Ingest-Secret: <INGEST_SECRET>`。不要用站长密码。

```sh
# 健康检查
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" \
  https://averie-cook-api.averieh0202.workers.dev/api/ingest/health

# 写入已做/想做（含私密食谱）
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" -H 'content-type: application/json' \
  -d '{
    "id": "2026-09-20-tomato-noodle",
    "title": "番茄牛腩面",
    "status": "want_cook",
    "categories": ["chinese","beef"],
    "recipe": { "summary": "想做", "steps": ["备菜"] }
  }' \
  https://averie-cook-api.averieh0202.workers.dev/api/ingest/dishes

# 上传封面（multipart 字段名 file），得到 coverPath 后再写进菜
curl -s -H "X-Ingest-Secret: $INGEST_SECRET" \
  -F "file=@cover.jpg" \
  https://averie-cook-api.averieh0202.workers.dev/api/ingest/upload
```

`status`：`cooked`（已做）或 `want_cook`（想做）。`deleted: true` 软删除。同一 `id` 再 POST 为更新。

兼容路径：`POST /api/owner/dishes` 与 `/api/owner/upload` 也可使用同一 ingest 头。

## 部署

### 1) Cloudflare Worker + D1（实时评分 / 登录 / 写入）

首页 **读路径不依赖 Worker**：GitHub Pages 的快照和封面足够在大陆手机上看菜。Worker 仍用于登录、打分、想吃、ingest。

```sh
cd api
npx wrangler d1 create averie-cook
```

把 `database_id` 写进 `api/wrangler.toml`，然后：

```sh
npx wrangler d1 migrations apply averie-cook --remote
npx wrangler kv namespace create MEDIA   # 把 id 替换 wrangler.toml 里的占位
npx wrangler deploy
```

可选 R2：`npx wrangler r2 bucket create averie-cook-covers`，取消注释 `[[r2_buckets]]`。

**不要**把 `OWNER_PASSWORD` 设成默认值 `averie-cook`。

合并后请 **先等 GitHub Pages**（读路径足够），Worker 只在需要实时评分 / 登录 / 写入时部署：

1. **GitHub Pages**（push `main` 后 Actions 自动部署）：静态快照、封面、static-first 首页。大陆手机即使打不开 `workers.dev` 也能看到菜卡。
2. **Worker + D1**（可选，实时评分 / 账号 / ingest）：`0004_raters.sql` 增加评分账号表。不需要新 secret（PIN 哈希复用 `OWNER_SESSION_SECRET`）。

```sh
cd api
npx wrangler d1 migrations apply averie-cook --remote
npx wrangler deploy
```

不跑 `0004` 的话，登录评分会失败（缺 `raters` 表）。

Worker 部署还会把种子封面的 JSON `coverUrl` 指到 Pages，并给 `/api/media` 更长的缓存头。

若库还停留在旧的 1–5 分约束，仍需先跑过 `0003_ratings_ten_point.sql`（上面的 `migrations apply` 会按顺序执行未应用的迁移）。不跑 `0003` 的话，新的 6–10 分写入会失败。

### 2) GitHub Pages（静态前端，读路径足够）

1. Settings → Pages → **Source: GitHub Actions**
2. 合并到 `main` 后等 `Deploy GitHub Pages`（构建前会 `npm run snapshot`）
3. 打开 https://averieh0202-maker.github.io/averie-cook/

即使 Worker 不可达，首页也应显示三道已做的菜和封面。

手动验证（模拟 API 不通）：把 `VITE_API_BASE_URL` 指到不可达地址后 `npm run build -w web && npm run preview -w web`，或在系统 hosts 里把 `averie-cook-api.averieh0202.workers.dev` 指到 `127.0.0.1`。首页仍应从 `/data/dishes-cooked.json` 与 `/covers/` 出字和封面，横幅为「网络不通，评分暂不可用」。

## 站长登录与评分账号

本地站长密码：`averie-cook`。生产用 wrangler secret。登录后详情显示材料与步骤。

访客评分身份：

1. **匿名（默认）**：`visitor_key` 存在 **localStorage** 和 Pages 源站的第一方 cookie（路径 `/averie-cook` 或 `/`，`SameSite=Lax`，长期 Max-Age）。刷新、返回、部分微信内置浏览器清 localStorage 时，只要 cookie 还在就能对上原来的分。
2. **评分账号（推荐）**：昵称 + 4–6 位数字 PIN。第一次提交即注册，以后同一组登录。服务端只存 PIN 哈希，API 不返回 PIN。登录后评分都记在该账号的 `visitor_key` 上（`ON CONFLICT` 更新，一人一菜一分）。页眉显示昵称；退出会清空本机身份（需确认），账号和已打的分仍在服务器。

GitHub Pages（`averieh0202-maker.github.io`）和 Worker（`*.workers.dev`）是**不同站**。浏览器经常拦截跨站 `Set-Cookie`（即使 `SameSite=None; Secure; Partitioned`）。因此站长登录 JSON 会带回 JWT `token`，前端用 `Authorization: Bearer` 发送；评分账号同样带回 token，放在 `X-Rater-Token`。cookie 仍用于本地 Vite 同源代理。`GET /api/dishes/:id` 只在站长会话有效时包含 `recipe`；匿名响应继续剥除食谱字段。

## API 摘要

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
web/     GitHub Pages 静态前端（含 public/data 匿名快照与 public/covers）
api/     Worker + D1 + 可选 KV/R2（实时评分 / 登录 / ingest）
data/    种子 JSON（导入 D1；快照脚本读取，不含到匿名前端）
scripts/ 导出匿名快照、检查 recipe 泄漏
```
