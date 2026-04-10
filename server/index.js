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
// 预热机制：后台获取这些应用，缓存价格和多国数据
// ============================================================
const RECOMMENDED_IDS = [
  '6448311069', '6473753684', '6670324846', // AI
  '544007664', '324684580', '363590051', '1446075923', // 影音
  '1488977981', '1232780281', '1570800848', '1477376905', // 创作/效率
  '1640745955', '310633997', '444934566', '1096918571', // 更多AI/社交
  '1065046889', '979274205', '1188369007', '1147396723', // P图/笔记
  '1193508329', '1452289769', '389801252', '626143814', // 其他知名订阅
  '686449807', '333903271', '570060128', '547702041',   // Telegram, X, Duolingo, Tinder
  '897446215', '586447913', '546505307', '985746746',   // Canva, Word, Zoom, Discord
  '1228438669', '571800810', '930441707', '426826309'   // Notion, Calm, Bumble, Strava
]
let recommendedMeta = {}

async function preWarmCache() {
  console.log('🚀 [预热] 开始并发拉取推荐应用的基础信息(图标/名字)...')
  try {
    const metas = await Promise.all(RECOMMENDED_IDS.map(id => fetchAppMeta(id).catch(() => null)))
    metas.forEach((meta, idx) => {
      if (meta) recommendedMeta[RECOMMENDED_IDS[idx]] = meta
    })
    console.log(`✅ [预热] 获取到 ${Object.keys(recommendedMeta).length} 个应用的元数据`)
  } catch(e) {}

  console.log('🚀 [预热] 开始后台逐个抓取 34 国价格...')
  for (const id of RECOMMENDED_IDS) {
    if (!appCache.getRaw(id)) {
      try {
        console.log(`  正在预抓取: ${recommendedMeta[id]?.name || id}`)
        const scrapePromise = performScrape(id, true)
        appCache.setInFlight(id, scrapePromise)
        await scrapePromise
      } catch (e) {
        console.log(`  预抓取失败: ${id}`, e.message)
      } finally {
        appCache.clearInFlight(id)
      }
    }
  }
}

// 启动时预加载汇率，然后开始预热
fetchLiveRates().then(() => {
  console.log('🚀 汇率预加载完成')
  preWarmCache()
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
// 封装的公共抓取方法（支持路由和预热共用）
// ============================================================
async function performScrape(appStoreId, silent = false) {
  let meta = await fetchAppMeta(appStoreId)
  if (!meta) throw new Error('未找到该应用')
  
  if (!silent) console.log(`[抓取] ${meta.name} (${appStoreId}) 开始实时抓取 34 国价格...`)
  const start = Date.now()
  const priceData = await scrapeAppPrices(appStoreId, () => {}) // 关闭进度输出防刷屏
  if (!priceData) throw new Error('该应用无订阅/内购数据')

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  if (!silent) console.log(`[抓取] ✅ ${meta.name} 完成，${priceData.plans.length} 个套餐，耗时 ${elapsed}s`)

  const result = {
    id: appStoreId,
    ...meta,
    plansCount: priceData.plans.length,
    plans: priceData.plans,
    prices: priceData.prices,
  }
  appCache.set(appStoreId, result, CACHE_TTL)
  return result
}

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

  try {
    // 1. 检查缓存与 Stale-While-Revalidate (SWR) 后台续期
    const cached = appCache.get(appStoreId)
    if (cached) {
      if (!cached.stale) {
        return res.json({ success: true, data: cached.data, cached: true, stale: false, fetchedAt: cached.fetchedAt })
      } else {
        // 缓存失效期满，但仍在宽限期内。立刻吐出旧值防空等。
        res.json({ success: true, data: cached.data, cached: true, stale: true, refreshing: true, fetchedAt: cached.fetchedAt })
        // 触发后台无缝刷新
        if (!appCache.getInFlight(appStoreId)) {
          const promise = performScrape()
            .catch(e => console.error(`[SWR] 刷新失败 ${appStoreId}:`, e.message))
            .finally(() => appCache.clearInFlight(appStoreId))
          appCache.setInFlight(appStoreId, promise)
        }
        return
      }
    }

    // 2. 无缓存：检查是否已有其他请求在抓取 (In-Flight Dedup)
    let scrapePromise = appCache.getInFlight(appStoreId)
    if (scrapePromise) {
      console.log(`[抓取锁] ${appStoreId} 正在并发抓取中，新请求挂起复用...`)
      const data = await scrapePromise
      return res.json({ success: true, data, cached: true, stale: false })
    }

    // 3. 全局全新请求
    scrapePromise = performScrape().finally(() => appCache.clearInFlight(appStoreId))
    appCache.setInFlight(appStoreId, scrapePromise)

    const data = await scrapePromise
    res.json({ success: true, data, cached: false })
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '价格抓取失败: ' + e.message })
    }
  }
})

// ============================================================
// GET /api/apps — 返回缓存中已有的应用列表
// ============================================================
app.get('/api/apps', readLimiter, (req, res) => {
  // 返回已抓取完所有的完整应用
  const fullApps = appCache.keys().map(key => appCache.getRaw(key)).filter(Boolean)
  const fullAppIds = new Set(fullApps.map(a => a.id))
  
  // 加上仅有元数据、尚未完成 34 国抓取的应用
  const pendingApps = RECOMMENDED_IDS.filter(id => !fullAppIds.has(id) && recommendedMeta[id]).map(id => {
    return {
      id,
      ...recommendedMeta[id],
      plansCount: 0 
    }
  })

  const merged = [...fullApps, ...pendingApps].map(a => ({
    id: a.id,
    appStoreId: a.id,
    name: a.name,
    company: a.company,
    category: a.category,
    icon: a.icon,
    description: a.description,
    plansCount: a.plansCount
  }))

  res.json({ success: true, data: merged })
})

// ============================================================
// 启动
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Youhu API v2 已启动 → http://0.0.0.0:${PORT}`)
  console.log(`📊 接口: /api/search | /api/app/:id | /api/config | /api/apps`)
  console.log(`🗄️  模式: 实时抓取 + 内存缓存（无数据库）`)
})
