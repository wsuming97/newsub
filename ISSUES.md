# Youhu 问题追踪

> 识别到的待修复问题。交给 AI 修复时，直接引用对应的编号即可。
> 状态：🔴 待修复 | 🟡 进行中 | 🟢 已修复

---

## 🟢 P1 — 部分应用爬取后无订阅数据显示（已修复）

**现象**：后端成功爬取了某些应用（如 Spotify、Google Meet），但返回 `该应用无订阅/内购数据`，导致前端 plansCount 始终为 0。

**修复方案**：已通过 `fallbackCatalog` 机制和 `apps.json` 提供官网支付应用的兜底数据。对于 100% 免费的应用已从推荐列表中移除。前端无数据时显示 "暂无数据"。

**相关文件**：`server/index.js`、`server/fallbackCatalog.js`、`src/data/api.js`

---

## 🟢 P2 — 前端 RECOMMENDED_APPS 图标依赖后端轮询（已修复）

**现象**：首页和搜索弹窗在后端预热完成前，所有应用只显示字母占位符，没有真实图标。

**修复方案**：写了一次性获取脚本，将所有真实图标准确嵌入到 `src/data/api.js` 中。后续重启也直接使用本地静态图片的 URL 加载，不再短暂显示字母圈。

**相关文件**：`src/data/api.js`

---

## 🟢 P3 — iCloud+ 虚拟应用的价格数据与真实应用格式不一致（已修复）

**现象**：iCloud+ 的 `prices` 字段不同，导致 DetailPage 异常。

**修复方案**：已弃用旧版的硬编码配置方法，重构使用 `fallbackCatalog.js` 进行构建，已完全匹配标准真实抓取价格的结构，避免前端发生判断失误。

**相关文件**：`server/index.js`、`server/fallbackCatalog.js`

---

## 🟢 P4 — 预热列表中部分应用实际无内购但仍占用爬取时间（已修复）

**现象**：后台预热时，免费应用浪费时间和请求配额。

**修复方案**：对推荐库进行全表检查，清理了无效纯免费应用（Shazam 等）；保留有效的官网订阅应用（通过 fallback Catalog 瞬间跳过 API），所有剩下的 IAP 程序预热时完全命中，不再被冗余废弃程序卡住。

**相关文件**：`server/index.js`

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

## 🟢 P10 — 持久化层从 JSON 升级为 SQLite（已修复）

**背景**：应用数量已扩展到 100+，JSON 整文件读写在并发和数据量上存在瓶颈。

**修复方案**：已完整利用 `better-sqlite3` 实现高性能异步缓存底座 `server/db.js`。采用 WAL 模式，实现了写后内存更新并在后台以短时延迟小批量异步落盘。成功重写了 `server/cache.js` 对接，并在最后关机前和 SIGTERM 退出时设置了强制 flush。实现了完美的向下兼容：如果在 SQLite 里没找到数据，第一次启动会自动吸纳解析旧版的 JSON（app_cache.json / rates_cache.json）。

**相关文件**：`server/cache.js`、`server/db.js`

---

## 备注

- **当前架构**：`实时抓取 + 内存热缓存 + SQLite 持久化缓存`
- 所有 81 个 RECOMMENDED_IDS 已通过 iTunes API 验证（2026-04-11）
- iCloud+ 虚拟应用的价格数据来源：[support.apple.com/zh-cn/108047](https://support.apple.com/zh-cn/108047)
- 前后端 ID 同步校验脚本见本次会话记录


