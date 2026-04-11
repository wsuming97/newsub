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
// 虚拟应用（不在 App Store 上架，价格硬编码，启动时注入缓存）
// ============================================================
const VIRTUAL_APPS = {
  'virtual-icloud': {
    id: 'virtual-icloud',
    name: 'iCloud+',
    company: 'Apple Inc.',
    category: 'Cloud Storage',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp',
    description: 'Apple 官方云存储订阅服务。每位 iCloud 用户免费获得 5GB 储存空间，需要更多空间可升级至 iCloud+ 订阅。包含 iCloud 专用代理、隐藏邮件地址和 HomeKit 安防视频等隐私功能。',
    plansCount: 5,
    plans: ['50GB', '200GB', '2TB', '6TB', '12TB'],
    // 价格来源：support.apple.com/zh-cn/108047（2025年数据，实际价格以官网为准）
    prices: {
      '50GB': [
        { region: '土耳其', flag: '🇹🇷', original: '₺14.99', cny: 2.77 },
        { region: '尼日利亚', flag: '🇳🇬', original: '₦750', cny: 3.75 },
        { region: '印度', flag: '🇮🇳', original: '₹75', cny: 6.43 },
        { region: '巴西', flag: '🇧🇷', original: 'R$ 5.90', cny: 7.35 },
        { region: '墨西哥', flag: '🇲🇽', original: 'MX$17', cny: 6.65 },
        { region: '阿根廷', flag: '🇦🇷', original: 'ARS 299', cny: 2.19 },
        { region: '中国大陆', flag: '🇨🇳', original: '¥6', cny: 6 },
        { region: '中国香港', flag: '🇭🇰', original: 'HK$8', cny: 7.41 },
        { region: '中国台湾', flag: '🇹🇼', original: 'NT$30', cny: 6.62 },
        { region: '日本', flag: '🇯🇵', original: '¥130', cny: 6.05 },
        { region: '韩国', flag: '🇰🇷', original: '₩1,100', cny: 5.68 },
        { region: '马来西亚', flag: '🇲🇾', original: 'RM4.90', cny: 7.43 },
        { region: '泰国', flag: '🇹🇭', original: '฿35', cny: 7.14 },
        { region: '新加坡', flag: '🇸🇬', original: 'S$1.48', cny: 7.86 },
        { region: '澳大利亚', flag: '🇦🇺', original: 'A$1.49', cny: 6.90 },
        { region: '美国', flag: '🇺🇸', original: '$0.99', cny: 7.17 },
        { region: '加拿大', flag: '🇨🇦', original: 'CA$1.29', cny: 6.65 },
        { region: '英国', flag: '🇬🇧', original: '£0.99', cny: 9.16 },
        { region: '德国', flag: '🇩🇪', original: '€1.19', cny: 9.00 },
        { region: '法国', flag: '🇫🇷', original: '€1.19', cny: 9.00 },
        { region: '沙特阿拉伯', flag: '🇸🇦', original: 'SAR3.99', cny: 7.52 },
        { region: '阿联酋', flag: '🇦🇪', original: 'AED3.99', cny: 7.68 },
      ],
      '200GB': [
        { region: '土耳其', flag: '🇹🇷', original: '₺44.99', cny: 8.34 },
        { region: '尼日利亚', flag: '🇳🇬', original: '₦2,200', cny: 11.01 },
        { region: '印度', flag: '🇮🇳', original: '₹219', cny: 18.78 },
        { region: '巴西', flag: '🇧🇷', original: 'R$ 16.90', cny: 21.04 },
        { region: '中国大陆', flag: '🇨🇳', original: '¥21', cny: 21 },
        { region: '中国香港', flag: '🇭🇰', original: 'HK$23', cny: 21.31 },
        { region: '中国台湾', flag: '🇹🇼', original: 'NT$90', cny: 19.86 },
        { region: '日本', flag: '🇯🇵', original: '¥400', cny: 18.61 },
        { region: '韩国', flag: '🇰🇷', original: '₩3,300', cny: 17.05 },
        { region: '新加坡', flag: '🇸🇬', original: 'S$3.98', cny: 21.14 },
        { region: '澳大利亚', flag: '🇦🇺', original: 'A$4.49', cny: 20.79 },
        { region: '美国', flag: '🇺🇸', original: '$2.99', cny: 21.66 },
        { region: '英国', flag: '🇬🇧', original: '£2.49', cny: 23.03 },
        { region: '德国', flag: '🇩🇪', original: '€2.99', cny: 22.62 },
      ],
      '2TB': [
        { region: '土耳其', flag: '🇹🇷', original: '₺134.99', cny: 25.02 },
        { region: '印度', flag: '🇮🇳', original: '₹749', cny: 64.24 },
        { region: '巴西', flag: '🇧🇷', original: 'R$ 54.90', cny: 68.35 },
        { region: '中国大陆', flag: '🇨🇳', original: '¥68', cny: 68 },
        { region: '中国香港', flag: '🇭🇰', original: 'HK$78', cny: 72.27 },
        { region: '中国台湾', flag: '🇹🇼', original: 'NT$290', cny: 63.99 },
        { region: '日本', flag: '🇯🇵', original: '¥1,300', cny: 60.49 },
        { region: '韩国', flag: '🇰🇷', original: '₩11,000', cny: 56.83 },
        { region: '新加坡', flag: '🇸🇬', original: 'S$13.98', cny: 74.27 },
        { region: '澳大利亚', flag: '🇦🇺', original: 'A$14.99', cny: 69.38 },
        { region: '美国', flag: '🇺🇸', original: '$9.99', cny: 72.33 },
        { region: '英国', flag: '🇬🇧', original: '£8.99', cny: 83.12 },
        { region: '德国', flag: '🇩🇪', original: '€9.99', cny: 75.58 },
      ],
      '6TB': [
        { region: '中国大陆', flag: '🇨🇳', original: '¥198', cny: 198 },
        { region: '美国', flag: '🇺🇸', original: '$32.99', cny: 238.83 },
        { region: '英国', flag: '🇬🇧', original: '£29.99', cny: 277.27 },
        { region: '德国', flag: '🇩🇪', original: '€32.99', cny: 249.55 },
      ],
      '12TB': [
        { region: '中国大陆', flag: '🇨🇳', original: '¥398', cny: 398 },
        { region: '美国', flag: '🇺🇸', original: '$64.99', cny: 470.57 },
        { region: '英国', flag: '🇬🇧', original: '£59.99', cny: 554.81 },
        { region: '德国', flag: '🇩🇪', original: '€64.99', cny: 491.69 },
      ]
    }
  }
}

// ============================================================
// 预热机制：后台获取这些应用，缓存价格和多国数据
// ============================================================
const RECOMMENDED_IDS = [
  '6448311069', '6473753684', '6670324846',             // AI
  '686449807', '333903271', '985746746', '547702041',   // 社交
  '930441707', '575855453',                             // 交友
  '544007664', '324684580', '363590051', '1446075923',  // 影音
  '1435009534', '578608491', '391307905', '336353151',  // 影音续
  '459858183', '1440241219',                            // 音乐
  '586447913', '586454090', '586374669', '477537958',   // Office
  '546505307', '1228438669', '1477376905', '1037215463',// 效率
  '1232780281',                                         // 效率续
  '897446215', '1488977981', '1570800848', '1065046889',// 设计
  '1147396723', '1116898438', '1193508329',             // 创作
  '571800810', '426826309', '1239223143', '1065081912', // 健身
  '346818049',                                          // 健身续
  '570060128', '1469863401', '1440642956', '1265591769',// 教育
  '303878510',                                          // 教育续
  '1315275818', '590379981', '1236571234', '1475105505',// VPN
  '1484286629', '389681421', '1278757452', '1452054429',// 金融
  '288666525', '1356282326', '1447513738',              // 新闻
  '1640745955', '310633997', '444934566', '1096918571', // 游戏
  '979274205', '1188369007', '1452289769', '389801252', // 游戏续
  '626143814',                                          // 游戏续2
  '1488977981', '1232780281', '1570800848', '1477376905',// 创作/效率（旧）
  '1065046889', '1147396723',                           // P图/笔记（旧）
]
let recommendedMeta = {}

// 虚拟应用注入缓存（直接以硬编码数据写入，无需拉取）
function injectVirtualApps() {
  const TTL_7DAYS = 7 * 24 * 60 * 60 * 1000
  for (const [id, data] of Object.entries(VIRTUAL_APPS)) {
    if (!appCache.getRaw(id)) {
      appCache.set(id, data, TTL_7DAYS)
      console.log(`✅ [虚拟应用] 已注入缓存: ${data.name}`)
    }
  }
}

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

// 启动时预加载汇率，注入虚拟应用，然后开始预热
fetchLiveRates().then(() => {
  console.log('🚀 汇率预加载完成')
  injectVirtualApps()  // 先注入虚拟应用（iCloud 等）
  preWarmCache()       // 再开始后台预热真实应用
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

  // 校验：允许纯数字 ID 或 virtual-xxx 虚拟 ID
  const isVirtual = /^virtual-.+$/.test(appStoreId)
  if (!isVirtual && !/^\d+$/.test(appStoreId)) {
    return res.status(400).json({ success: false, error: 'App Store ID 格式不正确' })
  }

  // 虚拟应用：直接从缓存读取（启动时已注入），不走爬虫
  if (isVirtual) {
    const cached = appCache.get(appStoreId)
    if (cached) {
      return res.json({ success: true, data: cached.data, cached: true, stale: false })
    }
    // 重新注入（容器重启且缓存文件丢失时）
    if (VIRTUAL_APPS[appStoreId]) {
      appCache.set(appStoreId, VIRTUAL_APPS[appStoreId], 7 * 24 * 60 * 60 * 1000)
      return res.json({ success: true, data: VIRTUAL_APPS[appStoreId], cached: false })
    }
    return res.status(404).json({ success: false, error: '未找到该虚拟应用' })
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
  // 返回已抓取完的真实应用
  const fullApps = appCache.keys().map(key => appCache.getRaw(key)).filter(Boolean)
  const fullAppIds = new Set(fullApps.map(a => a.id))
  
  // 加上仅有元数据、尚未完成 34 国抓取的应用
  const pendingApps = RECOMMENDED_IDS.filter(id => !fullAppIds.has(id) && recommendedMeta[id]).map(id => ({
    id,
    ...recommendedMeta[id],
    plansCount: 0 
  }))

  // 虚拟应用（iCloud 等）：始终追加，不重复
  const virtualApps = Object.values(VIRTUAL_APPS).filter(va => !fullAppIds.has(va.id)).map(va => ({
    id: va.id,
    appStoreId: va.id,
    name: va.name,
    company: va.company,
    category: va.category,
    icon: va.icon,
    description: va.description,
    plansCount: va.plansCount
  }))

  const merged = [...fullApps, ...pendingApps, ...virtualApps].map(a => ({
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
