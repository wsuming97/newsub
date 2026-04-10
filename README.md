# Youhu — 全球 App Store 订阅比价引擎

帮用户找到全球最便宜的 App 订阅区。覆盖 **46 款热门应用 / 252 个套餐 / 34 个国家地区**。

## 核心功能

- **全球比价**：自动抓取 34 国 App Store 内购真实价格，一眼看出哪个区最便宜
- **估算标记**：真实爬取的价格与汇率估算的参考价严格区分，不忽悠用户
- **套餐 + 地区**：两个维度自由切换对比
- **分享卡片**：一键生成比价图，发朋友圈/Twitter/Telegram
- **自动巡查**：部署后每 48 小时自动更新全库价格，无需人工干预

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + Vite + vue-router (SPA) |
| 后端 | Express + better-sqlite3 |
| 数据库 | SQLite (`data/youhu.db`) |
| 部署 | Docker + Nginx + Supervisor 一体容器 |

## 一键部署（VPS）

```bash
curl -sL https://raw.githubusercontent.com/wsuming97/newsub/main/deploy.sh | bash
```

脚本自动完成：安装 Docker → 拉代码 → 配置环境变量 → 构建启动 → 灌库 → 挂 cron → 健康检查。

### 手动部署

```bash
git clone https://github.com/wsuming97/newsub.git /opt/youhu
cd /opt/youhu

# 配置环境变量
cat > .env << 'EOF'
ADMIN_TOKEN=你的管理密钥
CORS_ORIGIN=https://你的域名
WEB_PORT=8080
EOF

# 构建启动
docker compose up -d --build

# 首次灌库
docker exec youhu node /app/server/seed.js --force

# 验证
curl http://127.0.0.1:8080/api/health
```

## 本地开发

```bash
# 后端（端口 3000）
cd server && npm install && node index.js

# 前端（端口 8888）
npm install && npm run dev
```

## 数据管理

| 脚本 | 用途 | 使用时机 |
|------|------|---------|
| `generate_apps.js` | 爬取 34 国真实价格 → `apps.json` | 本地开发 / 首次部署前 |
| `seed.js --force` | `apps.json` → SQLite 数据库 | 首次部署（只跑一次） |
| `reprice_db.js` | 按最新汇率重算库中已有价格 | 汇率表更新后，优先使用 |
| `updater.js` | 增量巡查更新（只 UPDATE 不 DELETE） | VPS 定时任务 (cron) |

```bash
# 定时更新（已由 deploy.sh 自动配置）
0 3 */2 * * docker exec youhu node /app/server/updater.js >> /var/log/youhu-update.log 2>&1

# 汇率表更新后，直接重算现有数据库（无需重新爬 34 国）
docker exec youhu node /app/server/reprice_db.js

# 只修复单个应用，例如 ChatGPT
docker exec youhu node /app/server/reprice_db.js chatgpt
```

## 项目结构

```
├── deploy.sh              # 一键部署脚本
├── Dockerfile             # 多阶段构建
├── docker-compose.yml     # 容器编排
├── nginx.conf             # 反代配置
├── src/                   # Vue 前端
│   ├── views/             # 首页 / 详情 / 计算器
│   ├── components/        # 搜索 / 分享卡片
│   └── data/api.js        # API 调用层
├── server/                # Node 后端
│   ├── index.js           # Express API
│   ├── db.js              # SQLite 引擎
│   ├── generate_apps.js   # 爬虫 + 应用目录
│   ├── reprice_db.js      # 按最新汇率重算现有数据库
│   ├── seed.js            # 创世灌库
│   └── updater.js         # 增量更新器
└── data/youhu.db          # 运行时数据库（git 忽略）
```

## 免责声明

本站数据仅供参考，最终价格以 App Store 实际结算为准。本站与 Apple Inc. 及所列应用开发商无任何商业关联。
