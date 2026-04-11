# Youhu 问题追踪

> 识别到的待修复问题。交给 AI 修复时，直接引用对应的编号即可。
> 状态：🔴 待修复 | 🟡 进行中 | 🟢 已修复

---

## 🔴 P1 — 部分应用爬取后无订阅数据显示

**现象**：后端成功爬取了某些应用（如 Spotify、Google Meet），但返回 `该应用无订阅/内购数据`，导致前端 plansCount 始终为 0。

**原因**：这些应用虽然有订阅服务，但不通过 App Store 内购提供（例如 Spotify 的订阅走官网，App Store 页面上没有内购价格条目）。

**影响范围**：Spotify、Google Meet、Shazam、部分游戏类应用。

**建议修复**：
- 方案 A：对这类应用采用 iCloud 同样的"虚拟应用"策略，硬编码其官方定价
- 方案 B：在前端对 plansCount=0 的应用显示"该应用不通过 App Store 订阅"提示，而非空白
- 方案 C：从 RECOMMENDED 列表中移除无法提供价格对比价值的应用

**相关文件**：`server/index.js`（performScrape / preWarmCache）、`server/scraper.js`

---

## 🔴 P2 — 前端 RECOMMENDED_APPS 图标依赖后端轮询

**现象**：首页和搜索弹窗在后端预热完成前，所有应用只显示字母占位符，没有真实图标。

**原因**：前端 `RECOMMENDED_APPS` 的 `icon` 字段为空字符串，依赖 `/api/apps` 轮询返回真实图标 URL。在后端刚启动、预热未完成的窗口期（约 1-5 分钟），用户看到的全是占位符。

**影响范围**：首次部署或容器重启后的前几分钟。

**建议修复**：
- 方案 A：写一个一次性脚本，批量从 iTunes API 获取所有 81 个应用的真实图标 URL，回填到 `src/data/api.js` 的 RECOMMENDED_APPS 里
- 方案 B：后端预热优先只拉取图标（元数据），再逐个拉价格，让图标更快出现

**相关文件**：`src/data/api.js`（RECOMMENDED_APPS）、`src/views/HomePage.vue`、`src/components/SearchModal.vue`

---

## 🔴 P3 — iCloud+ 虚拟应用的价格数据与真实应用格式不一致

**现象**：iCloud+ 的 `prices` 字段是按套餐分组的对象 `{ '50GB': [...], '200GB': [...] }`，而真实应用的价格数据是爬虫返回的平铺结构。

**原因**：iCloud+ 是硬编码注入的虚拟应用，数据结构是手动定义的，未严格对齐爬虫产出的格式。

**影响范围**：前端 `DetailPage.vue` 在渲染 iCloud+ 详情时，可能无法正确展示套餐对比和地区排名。

**建议修复**：
- 检查 `DetailPage.vue` 的数据解析逻辑，确认它能兼容虚拟应用的嵌套价格结构
- 或者将虚拟应用的价格格式对齐真实应用（推荐）

**相关文件**：`server/index.js`（VIRTUAL_APPS）、`src/views/DetailPage.vue`

---

## 🟡 P4 — 预热列表中部分应用实际无内购但仍占用爬取时间

**现象**：后台预热时，Signal、WeChat、Google Maps 等免费应用会被逐个尝试爬取，全部返回 `无订阅/内购数据`，浪费时间和请求配额。

**原因**：这些应用被加入 RECOMMENDED_IDS 是为了在首页展示热门应用的多样性，但它们本身没有 App Store 内购。

**建议修复**：
- 将纯免费应用从 RECOMMENDED_IDS 中移除（不预热，但仍保留在前端 RECOMMENDED_APPS 供展示）
- 或者在预热逻辑里加一个 `SKIP_SCRAPE_IDS` 黑名单，跳过已知无内购的应用

**相关文件**：`server/index.js`（RECOMMENDED_IDS / preWarmCache）

---

## 🟢 P5 — trust proxy 未设置导致 rate-limiter 报错（已修复）

**现象**：容器日志中出现 `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` 错误。

**修复**：已添加 `app.set('trust proxy', 1)`。

**提交**：`4c9366f`

---

## 🟢 P6 — 31 个伪造 App Store ID 导致预热大面积失败（已修复）

**现象**：后端日志大量 `未找到该应用` 错误。

**修复**：已通过 iTunes Lookup/Search API 逐个验证，替换为真实 ID。

**提交**：`4c9366f`

---

## 🟢 P7 — 前端图标全空白（已修复）

**现象**：搜索弹窗和首页所有应用图标显示为空。

**修复**：添加字母占位符 fallback。

**提交**：`2c58069`

---

## 🟢 P8 — 代码注释和启动日志中架构描述过时（已修复）

**现象**：`server/index.js` 头注释、`server/scraper.js` 头注释、启动日志均写着"内存缓存（无数据库）"，与实际架构不符。

**实际架构**：`实时抓取 + 内存热缓存 + JSON 持久化缓存`（不是 SQLite，也不是"无持久化"）。

**修复**：统一更新三处描述。

**提交**：`待提交`

---

## 🔴 P9 — 全链路 ID 一致性需要持续保障

**现象**：前端 RECOMMENDED_APPS 的 appStoreId → 后端 RECOMMENDED_IDS → 预热爬取 → 缓存写入 → /api/apps 返回 → /api/app/:id 查询 → 前端 DetailPage 展示，任何一环 ID 不一致就会导致"爬了但前端看不到价格"。

**当前状态**：81 个 ID 已验证同步（2026-04-11），但未来新增应用时需要重复验证。

**建议修复**：
- 增加一个开发脚本 `scripts/verify_ids.js`，自动对比前后端 ID 一致性 + iTunes API 可达性
- 在 CI/CD 或部署前跑一次，防止 ID 漂移

**相关文件**：`server/index.js`（RECOMMENDED_IDS）、`src/data/api.js`（RECOMMENDED_APPS）

---

## 🔴 P10 — 持久化层从 JSON 升级为 SQLite

**背景**：应用数量已扩展到 100+，JSON 整文件读写在并发和数据量上存在瓶颈。

**当前状态**：`app_cache.json` 单文件存储所有应用的价格数据，每次写入都是全量序列化。

**目标架构**：`实时抓取 + 内存热缓存 + SQLite 持久化缓存`

**升级要点**：
- 用 SQLite `better-sqlite3` 替换 JSON 文件读写
- 表结构：`apps (id, name, icon, category, prices_json, updated_at, ttl)`
- 支持按 ID 单条读写，避免全量序列化
- 保留内存热缓存 + SWR 策略不变，SQLite 只替换 JSON 落盘层
- 启动时从 SQLite 回填内存缓存
- 价格数据字段 `prices_json` 使用 TEXT 存储 JSON 字符串，查询时按需解析

**迁移步骤**：
1. 新建 `server/db.js`，封装 SQLite CRUD
2. 修改 `server/cache.js`，将 `loadFromDisk / saveToDisk` 替换为 SQLite 操作
3. 保留 `./data/` 目录用于 SQLite 数据库文件 `youhu.db`
4. Docker volume 映射不变（`./data:/app/data`）
5. 验证容器重启后数据持久化

**相关文件**：`server/cache.js`、`docker-compose.yml`

---

## 备注

- **当前架构**：`实时抓取 + 内存热缓存 + JSON 持久化缓存`
- **目标架构**：`实时抓取 + 内存热缓存 + SQLite 持久化缓存`（见 P10）
- 所有 81 个 RECOMMENDED_IDS 已通过 iTunes API 验证（2026-04-11）
- iCloud+ 虚拟应用的价格数据来源：[support.apple.com/zh-cn/108047](https://support.apple.com/zh-cn/108047)
- 前后端 ID 同步校验脚本见本次会话记录


