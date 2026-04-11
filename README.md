# Youhu

全球 App Store 订阅价格实时查询站。

当前版本不是“预灌库价格仓库”，而是：

- 前端搜索和展示应用
- 后端按需实时抓取 34 个国家或地区的价格
- 结果同时写入内存热缓存和 JSON 持久化缓存
- 汇率优先走实时接口，失败时回退到内置默认值

## 当前架构

```text
浏览器
  -> Nginx（容器内 80）
    -> 前端 dist 静态页面
    -> /api 转发到 Express（3000）
      -> App Store 页面实时抓取
      -> 实时汇率 API
      -> 内存缓存（Map + TTL）
      -> JSON 持久化缓存（/app/data/*.json）
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite + vue-router + vue-i18n + html2canvas |
| 后端 | Express + app-store-scraper |
| 缓存 | 内存 `Map + TTL` + JSON 持久化缓存 |
| 缓存策略 | In-Flight Dedup + Stale-While-Revalidate |
| 汇率 | 实时汇率 API + fallback 默认值 |
| 部署 | Docker + Nginx + Supervisor 单容器 |

## 现在和旧版本的区别

当前主链代码已经不再使用以下旧链路：

- SQLite 持久化价格库
- 历史灌库脚本链路
- 历史数据库重算链路
- 历史定时巡检更新链路

也就是说，当前系统的真值源是实时抓取结果，JSON 只作为持久化缓存层。

## 运行机制

### 首页

- 首页通过 `/api/apps` 获取当前缓存中的应用列表
- 服务启动时会预热一批推荐应用的元数据和部分价格
- 首页每 5 秒轮询一次，刷新已抓取完成的应用状态

### 搜索

- 搜索弹窗调用 `/api/search?q=...`
- 后端使用 `app-store-scraper` 搜索 App Store 应用

### 详情页

- 详情页调用 `/api/app/:appStoreId`
- 如果内存缓存命中，直接返回
- 如果 JSON 持久化缓存命中，也会快速返回，并回填内存
- 如果缓存过期但仍在容忍期内，先返回旧值，同时后台静默刷新
- 如果完全没有缓存，后端会实时抓取该应用在 34 个国家或地区的价格
- 首次抓取可能需要 15 到 30 秒

### 缓存

- 热缓存保存在进程内存中
- 持久化缓存保存在 `CACHE_DIR` 指向的目录中，默认是：
  - 本地开发：`<repo>/data`
  - 容器内：`/app/data`
- 持久化文件包括：
  - `app_cache.json`
  - `rates_cache.json`
- 写盘采用防抖和原子替换，避免高频写入和半写入损坏 JSON

### SWR（Stale-While-Revalidate）

- 默认缓存 TTL 为 24 小时
- 过期后不会立刻阻塞用户
- 在 7 天容忍期内，接口会先返回旧值，再后台刷新
- 前端详情页会显示“正在静默刷新最新价格”的提示横幅

### 并发去重

- 同一个 App 在缓存未命中时，只允许一个真实抓取任务进行
- 其他并发请求会复用同一个 Promise
- 这样可以避免高并发下重复抓取 34 个国家价格

### 汇率

- 启动时拉一次实时汇率
- 每 12 小时刷新一次
- 当外部汇率接口不可用时，自动回退到内置默认汇率表

## 当前运行特征

| 方面 | 当前表现 |
|---|---|
| 首次打开详情页 | 慢，15 到 30 秒属于正常现象 |
| 第二次打开 | 快，因为命中缓存 |
| 普通重启后 | 只要 `/app/data` 挂了宿主机卷，缓存就会保留 |
| `docker compose up -d --build` 后 | 只要 `./data:/app/data` 挂载存在，缓存仍会保留 |
| 数据新鲜度 | 高于旧数据库模式 |
| 稳定性 | 更依赖 Apple 页面结构和外部汇率 API |
| 部署复杂度 | 低于旧数据库模式 |
| 运维预期 | 更像在线抓取服务，而不是价格仓库 |

## API

### `GET /api/health`

健康检查。

### `GET /api/config`

返回：

- 当前汇率表
- 34 个国家或地区配置
- `regionCount`

### `GET /api/search?q=关键词`

搜索 App Store 应用。

### `GET /api/app/:appStoreId`

获取单个应用的实时价格详情。

返回内容包含：

- 应用元数据
- 套餐列表
- 各套餐在 34 个国家或地区的价格
- `cached`
- `stale`
- `refreshing`
- `fetchedAt`

### `GET /api/apps`

返回当前缓存中的应用列表，以及预热中的推荐应用元数据。

## 本地开发

### 1. 启动后端

```bash
cd server
npm install
node index.js
```

默认监听 `3000`。

### 2. 启动前端

```bash
npm install
npm run dev
```

默认监听 `8888`。

本地开发时，Vite 会把 `/api` 代理到：

```text
http://127.0.0.1:3000
```

如需修改代理目标，可设置：

```bash
VITE_PROXY_TARGET=http://127.0.0.1:3000
```

## Docker 部署

### 1. 准备环境变量

推荐在项目根目录创建 `.env`：

```env
CORS_ORIGIN=https://你的域名,https://www.你的域名
WEB_PORT=8080
```

说明：

- `CORS_ORIGIN`
  允许访问后端 API 的前端来源白名单
- `WEB_PORT`
  宿主机对外暴露端口，默认 `8080`

### 2. 启动

```bash
docker compose up -d --build
```

当前 `docker-compose.yml` 已默认挂载：

```text
./data -> /app/data
```

因此只要保留宿主机 `data/` 目录，缓存文件就会跨容器重建保留。

### 3. 健康检查

```bash
curl http://127.0.0.1:8080/api/health
```

如改过端口，把 `8080` 替换成你自己的 `WEB_PORT`。

## 域名部署建议

当前项目自身已经包含一层容器内 Nginx：

- `/` 提供前端页面
- `/api/` 转发到 Express

正式上线时，推荐再在 VPS 宿主机放一层 Nginx 或 Caddy：

```text
域名 / 443
  -> 宿主机 Nginx / Caddy
    -> 127.0.0.1:8080
      -> youhu 容器
```

这样可以统一处理：

- HTTPS 证书
- 多站点共存
- 域名转发

## 目录结构

```text
youhu/
├── src/
│   ├── views/
│   │   ├── HomePage.vue
│   │   ├── DetailPage.vue
│   │   ├── CalculatorPage.vue
│   │   └── LegalPage.vue
│   ├── components/
│   │   ├── SearchModal.vue
│   │   ├── ShareCardModal.vue
│   │   ├── SiteNav.vue
│   │   └── SiteFooter.vue
│   └── data/api.js
├── server/
│   ├── index.js
│   ├── scraper.js
│   ├── cache.js
│   └── package.json
├── data/
│   ├── app_cache.json
│   └── rates_cache.json
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── deploy.sh
```

## 已知限制

1. 首次详情抓取较慢，这是当前架构的自然结果。
2. 如果你没有挂载 `./data:/app/data`，那么容器重建后缓存仍会丢失。
3. App Store 页面结构变化可能导致部分国家价格抓取失败。
4. 某些国家或套餐在当前时刻可能无价格数据，页面会显示未命中或缺失。
5. 汇率为实时换算结果，仅供参考，实际结算请以商店页面为准。

## 当前最值得继续处理的事项

1. 清理失真的维护文档和旧数据库时代残留说明。
2. 删除未使用调试文件和旧组件。
3. 给首页也补充“缓存预热 / 静默刷新”的更明显状态提示。
4. 决定是否要继续往前走一步，引入更细粒度的缓存清理策略。
5. 视访问量决定是否需要从 JSON 缓存升级到 SQLite 或 Redis。

## 免责声明

本项目数据仅供参考，最终价格请以 App Store 实际页面和结算为准。项目与 Apple Inc. 及相关应用开发商无商业隶属关系。
