# 优惠 Youhu —— 全球 App Store 订阅比价与价格追踪

Youhu 是一个现代化的混合架构 Web 应用，旨在帮助用户追踪和对比 全球 App Store 在不同国家和地区的真实订阅价格，从而找到最划算的“优惠”区域，节省用户的数字订阅开支。完全开源免费。

## 🎯 核心功能
- **全球比价**：自动抓取覆盖尼日利亚、土耳其、美国等 34 个国家的 App Store 内购价格。
- **直观可视化**：多维度的“地区对比”与“套餐对比”表格及内置条形排布图。
- **实时汇率**：价格实时自动换算成统一货币（默认 CNY）。
- **图片分享卡片**：一键生成并在社交媒体上分享最低价详情图。

## 🏗 技术栈架构
该项目摒弃了初代的静态 Github Pages 数据架构，已全面升级为 **动态 API + SQLite** 的架构模式。

- **前端层 (Frontend)**: Vue 3 + Vite + vue-router，SPA 交互。
- **后端层 (Backend)**: Express API (`server/index.js`) 暴露标准 RESTful 接口供前端调用。
- **数据层 (Database)**: 运行时使用的是高性能持久化的 **SQLite 数据库 (`data/youhu.db`)**。
- **数据管线 (Data Pipeline)**: 
  - 通过 `node server/generate_apps.js` 脚本定时去 App Store 拉取真实的多国价格 HTML 并解析。
  - 数据爬取结束后会生成 `server/data/apps.json`，需要再显式执行 `node seed.js --force` 才会同步入库。

## 🚀 本地开发指南

### 1. 启动后端 (API + 数据库服务)
后端默认监听在 `3000` 端口。提供数据展示的接口支持。
```bash
cd server
npm install
npm start
```

### 2. 启动前端 (Vue SPA)
前端默认运行在 `8888` 端口。开发环境下（`npm run dev`），Vite 会将 `/api` 自动代理到本地 `3000` 端口的后端服务。
```bash
# 在项目根目录下执行
npm install
npm run dev
```

### 3. 数据更新 (重新拉取价格数据)
平时您无需频繁变动数据，所有的前端都会读取您本地已有的 SQLite 数据源。如果发现有了新的汇率或者苹果更改了价格：
```bash
cd server
node generate_apps.js
node seed.js --force
```
*备注：`generate_apps.js` 只负责抓取并生成 JSON，不会自动改写 SQLite。真正入库需要显式执行 `seed.js --force`。*

## 🐳 Docker 生产部署
项目提供了开箱即用的 `docker compose` 方案，结合 Nginx 将前端静态文件和后端动态请求统筹在一个容器下。

```bash
docker compose up -d --build
```
> **数据持久化提示**：
> `docker-compose.yml` 已经配置了自动挂载，您的 `data/youhu.db` 在重启或更新容器时不会丢失。
> 
> **首次部署提示**：
> 当前镜像启动时不会自动执行 `seed.js`。如果 VPS 上的 `data/` 是空目录，建议先执行一次：
> `docker compose run --rm youhu sh -lc "cd /app/server && DB_PATH=/app/data/youhu.db node seed.js"`
> 然后再执行 `docker compose up -d --build`。
>
> **生产环境必配项**：
> - `ADMIN_TOKEN`：保护 `POST /api/apps` 和 `DELETE /api/apps/:id`
> - `CORS_ORIGIN`：你的前端域名白名单，例如 `https://youhu.example.com`
> 
> 后端在 `NODE_ENV=production` 且缺失以上任一配置时会拒绝启动，避免把写接口和跨域策略暴露成裸奔状态。
>
> **健康检查与冒烟验收**：
> 默认端口可通过 `WEB_PORT` 覆盖，默认是 `8080`。
> 部署完成后建议立即执行：
> `curl http://127.0.0.1:8080/api/health`
> `npm run smoke:deploy -- http://127.0.0.1:8080`
>
> **发布验收清单**：
> 详见仓库根目录 [VPS_DEPLOY_CHECKLIST.md](./VPS_DEPLOY_CHECKLIST.md)

## ⚠️ 免责声明
本网站提供的数据仅供参考，不保证绝对的实时性和准确性。App 价格变动频繁，最终支付金额请以苹果 `App Store` 应用内的最终结算页面为准。本站与 Apple Inc. 及所列应用开发商均无任何直接商业关联。
