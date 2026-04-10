/**
 * Youhu 后端 API 服务 v2
 * 
 * 架构：实时查询 + 内存缓存（无数据库）
 * 用户搜索 → iTunes Search API
 * 用户查看详情 → 实时抓取 34 国价格 → 缓存 24h
 */
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import store from 'app-store-scraper'
import { appCache, ratesCache } from './cache.js'
import { COUNTRIES, fetchLiveRates, getCnyRates, scrapeAppPrices, fetchAppMeta } from './scraper.js'

const app = express()
const PORT = process.env.PORT || 3000

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 小时

// 速率限制
const searchLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { success: false, error: '搜索请求过于频繁' } })
const readLimiter = rateLimit({ windowMs: 60_000, max: 60, message: { success: false, error: '请求过于频繁' } })

// CORS
const corsOrigin = process.env.CORS_ORIGIN
const allowedOrigins = corsOrigin
  ? corsOrigin.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8888', 'http://127.0.0.1:8888', 'http://localhost:4173']
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error('CORS blocked')),
  credentials: true
}))
app.use(express.json())

// ============================================================
// 启动时预加载汇率
// ============================================================
fetchLiveRates().then(() => {
  console.log('🚀 汇率预加载完成')
})

// 每 12 小时刷新一次汇率
setInterval(() => fetchLiveRates(), 12 * 60 * 60 * 1000)

// ============================================================
// GET /api/health — 健康检查
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    cachedApps: appCache.size,
    timestamp: new Date().toISOString()
  })
})

// ============================================================
// GET /api/config — 全局配置（实时汇率 + 地区列表）
// ============================================================
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      cnyRates: getCnyRates(),
      regions: COUNTRIES.map(c => ({ code: c.code, name: c.name, flag: c.flag, currency: c.currency })),
      regionCount: COUNTRIES.length,
    }
  })
})

// ============================================================
// GET /api/search — 搜索 App Store 应用
// ============================================================
app.get('/api/search', searchLimiter, async (req, res) => {
  const q = req.query.q
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.json({ success: true, data: [] })
  }
  if (q.length > 100) {
    return res.status(400).json({ success: false, error: '搜索关键词过长' })
  }

  try {
    const results = await store.search({ term: q.trim(), num: 10, country: 'us' })
    const data = results.map(item => ({
      appStoreId: String(item.id),
      name: item.title,
      icon: item.icon,
      developer: item.developer,
      price: item.price,
      free: item.free,
      genre: item.primaryGenre || item.genres?.[0] || '未分类',
      url: item.url
    }))
    res.json({ success: true, data })
  } catch (err) {
    console.error('搜索失败:', err.message)
    res.status(500).json({ success: false, error: '搜索失败: ' + err.message })
  }
})

// ============================================================
// GET /api/app/:appStoreId — 获取应用详情 + 34 国实时价格
// 首次请求实时抓取（约 15-30 秒），缓存 24h
// ============================================================
app.get('/api/app/:appStoreId', readLimiter, async (req, res) => {
  const { appStoreId } = req.params

  // 校验：必须是纯数字
  if (!/^\d+$/.test(appStoreId)) {
    return res.status(400).json({ success: false, error: 'App Store ID 必须为纯数字' })
  }

  // 1. 检查缓存
  const cached = appCache.get(appStoreId)
  if (cached) {
    return res.json({ success: true, data: cached, cached: true })
  }

  // 2. 获取 App 元数据
  let meta
  try {
    meta = await fetchAppMeta(appStoreId)
    if (!meta) {
      return res.status(404).json({ success: false, error: '未找到该应用' })
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: '获取应用信息失败: ' + e.message })
  }

  // 3. 实时抓取 34 国价格
  try {
    console.log(`[抓取] ${meta.name} (${appStoreId}) 开始实时抓取 34 国价格...`)
    const start = Date.now()
    const priceData = await scrapeAppPrices(appStoreId, (cur, total, name) => {
      // 服务端日志打印进度
      if (cur % 5 === 0 || cur === total) {
        console.log(`  [${cur}/${total}] ${name}`)
      }
    })

    if (!priceData) {
      return res.status(404).json({ success: false, error: '该应用无订阅/内购数据' })
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`[抓取] ✅ ${meta.name} 完成，${priceData.plans.length} 个套餐，耗时 ${elapsed}s`)

    // 4. 组装响应数据
    const result = {
      id: appStoreId,
      ...meta,
      plansCount: priceData.plans.length,
      plans: priceData.plans,
      prices: priceData.prices,
    }

    // 5. 存入缓存
    appCache.set(appStoreId, result, CACHE_TTL)

    res.json({ success: true, data: result, cached: false })
  } catch (e) {
    console.error(`[抓取] ❌ ${meta.name} 失败:`, e.message)
    res.status(500).json({ success: false, error: '价格抓取失败: ' + e.message })
  }
})

// ============================================================
// GET /api/apps — 返回缓存中已有的应用列表
// ============================================================
app.get('/api/apps', readLimiter, (req, res) => {
  const keys = appCache.keys()
  const apps = keys.map(key => {
    const data = appCache.get(key)
    if (!data) return null
    return {
      id: data.id,
      name: data.name,
      company: data.company,
      category: data.category,
      icon: data.icon,
      description: data.description,
      plansCount: data.plansCount,
    }
  }).filter(Boolean)

  res.json({ success: true, data: apps })
})

// ============================================================
// 启动
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Youhu API v2 已启动 → http://0.0.0.0:${PORT}`)
  console.log(`📊 接口: /api/search | /api/app/:id | /api/config | /api/apps`)
  console.log(`🗄️  模式: 实时抓取 + 内存缓存（无数据库）`)
})
