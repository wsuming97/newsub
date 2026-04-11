import { ratesCache } from './cache.js'

/**
 * Youhu 实时价格抓取引擎
 * 
 * 核心模块：从 App Store 页面实时抓取 IAP 价格，从 Frankfurter API 获取实时汇率。
 * 抓取结果通过 Cache 层写入内存热缓存 + SQLite 持久化缓存，支持 SWR 后台刷新。
 */

// ============================================================
// 目标国家/地区 — 34个，覆盖低价区 + 主要市场
// ============================================================
export const COUNTRIES = [
  // 低价区（重点覆盖）
  { code: 'ng', name: '尼日利亚',   flag: '🇳🇬', currency: 'NGN' },
  { code: 'eg', name: '埃及',       flag: '🇪🇬', currency: 'EGP' },
  { code: 'ar', name: '阿根廷',     flag: '🇦🇷', currency: 'ARS' },
  { code: 'tr', name: '土耳其',     flag: '🇹🇷', currency: 'TRY' },
  { code: 'pk', name: '巴基斯坦',   flag: '🇵🇰', currency: 'PKR' },
  { code: 'bd', name: '孟加拉国',   flag: '🇧🇩', currency: 'BDT' },
  { code: 'in', name: '印度',       flag: '🇮🇳', currency: 'INR' },
  { code: 'ua', name: '乌克兰',     flag: '🇺🇦', currency: 'UAH' },
  { code: 'vn', name: '越南',       flag: '🇻🇳', currency: 'VND' },
  { code: 'id', name: '印度尼西亚', flag: '🇮🇩', currency: 'IDR' },
  { code: 'ph', name: '菲律宾',     flag: '🇵🇭', currency: 'PHP' },
  { code: 'co', name: '哥伦比亚',   flag: '🇨🇴', currency: 'COP' },
  { code: 'ke', name: '肯尼亚',     flag: '🇰🇪', currency: 'KES' },
  { code: 'ru', name: '俄罗斯',     flag: '🇷🇺', currency: 'RUB' },
  // 中等价位
  { code: 'br', name: '巴西',       flag: '🇧🇷', currency: 'BRL' },
  { code: 'mx', name: '墨西哥',     flag: '🇲🇽', currency: 'MXN' },
  { code: 'th', name: '泰国',       flag: '🇹🇭', currency: 'THB' },
  { code: 'my', name: '马来西亚',   flag: '🇲🇾', currency: 'MYR' },
  { code: 'za', name: '南非',       flag: '🇿🇦', currency: 'ZAR' },
  { code: 'cl', name: '智利',       flag: '🇨🇱', currency: 'CLP' },
  // 主要市场
  { code: 'us', name: '美国',       flag: '🇺🇸', currency: 'USD' },
  { code: 'cn', name: '中国大陆',   flag: '🇨🇳', currency: 'CNY' },
  { code: 'hk', name: '中国香港',   flag: '🇭🇰', currency: 'HKD' },
  { code: 'tw', name: '中国台湾',   flag: '🇹🇼', currency: 'TWD' },
  { code: 'jp', name: '日本',       flag: '🇯🇵', currency: 'JPY' },
  { code: 'kr', name: '韩国',       flag: '🇰🇷', currency: 'KRW' },
  { code: 'sg', name: '新加坡',     flag: '🇸🇬', currency: 'SGD' },
  { code: 'au', name: '澳大利亚',   flag: '🇦🇺', currency: 'AUD' },
  { code: 'ca', name: '加拿大',     flag: '🇨🇦', currency: 'CAD' },
  { code: 'gb', name: '英国',       flag: '🇬🇧', currency: 'GBP' },
  { code: 'de', name: '德国',       flag: '🇩🇪', currency: 'EUR' },
  { code: 'fr', name: '法国',       flag: '🇫🇷', currency: 'EUR' },
  { code: 'sa', name: '沙特阿拉伯', flag: '🇸🇦', currency: 'SAR' },
  { code: 'ae', name: '阿联酋',     flag: '🇦🇪', currency: 'AED' },
]

// ============================================================
// 离线兜底汇率（仅在 Frankfurter API 不可用时使用）
// ============================================================
const FALLBACK_RATES = {
  USD: 7.24, EUR: 7.85, GBP: 9.12, JPY: 0.0478, KRW: 0.00520,
  AUD: 4.62, CAD: 5.15, SGD: 5.38, HKD: 0.930, TWD: 0.222,
  CNY: 1.00, INR: 0.0857, TRY: 0.153, NGN: 0.00461, EGP: 0.144,
  ARS: 0.00724, PKR: 0.0261, BDT: 0.0659, UAH: 0.174,
  VND: 0.000285, IDR: 0.000443, PHP: 0.124, COP: 0.00176,
  KES: 0.0559, RUB: 0.0824, BRL: 1.265, MXN: 0.355,
  THB: 0.211, MYR: 1.639, ZAR: 0.386, CLP: 0.00764,
  SAR: 1.931, AED: 1.972,
}

// 活跃汇率表优先从持久化缓存恢复，避免外部汇率接口短暂波动时完全回退到离线兜底值。
const persistedRates = ratesCache.get('live-rates')?.data
let cnyRates = persistedRates?.rates
  ? { ...FALLBACK_RATES, ...persistedRates.rates }
  : { ...FALLBACK_RATES }

/**
 * 获取当前汇率表（只读，供外部使用）
 */
export function getCnyRates() {
  return { ...cnyRates }
}

/**
 * 从 Frankfurter API 拉取实时汇率
 * API 返回：1 CNY = ? 外币，取倒数得到 1 外币 = ? CNY
 */
export async function fetchLiveRates() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=CNY', {
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const live = { CNY: 1.00 }
    for (const [code, val] of Object.entries(data.rates)) {
      if (val > 0) live[code] = parseFloat((1 / val).toFixed(6))
    }
    // 实时数据覆盖兜底值，Frankfurter 未覆盖的小币种保留兜底。
    cnyRates = { ...FALLBACK_RATES, ...live }
    ratesCache.set('live-rates', {
      date: data.date,
      rates: cnyRates,
    }, 12 * 60 * 60 * 1000)
    console.log(`✅ 实时汇率已加载（${data.date}，${Object.keys(live).length} 个币种）`)
    return cnyRates
  } catch (e) {
    console.warn(`⚠️  汇率拉取失败（${e.message}），使用离线兜底`)
    return cnyRates
  }
}

// ============================================================
// 工具函数
// ============================================================
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 消耗型 IAP 过滤词（充值包/代币/宝石等，不是订阅）
const CONSUMABLE_KEYWORDS = [
  'gem', 'gems', 'coin', 'coins', 'token', 'tokens', 'credit', 'credits',
  'star', 'stars', 'point', 'points', 'diamond', 'diamonds', 'chest',
  'pack', 'bundle', 'boost', 'energy', 'lives', 'hints',
]

function isConsumable(name) {
  const lower = name.toLowerCase()
  if (/\(\d+\)/.test(name)) return true
  if (CONSUMABLE_KEYWORDS.some(k => lower.includes(k))) return true
  return false
}

/**
 * 解析价格字符串 → { val: 数值, currency: 货币代码|null }
 * 支持多种国际格式：$12.99 · ₺1.234,56 · ₹ 1,999 · 4.999.000đ · Rp 349ribu
 */
function parsePriceString(str) {
  let s = str.trim()
  let currency = null

  const PREFIX = [
    [/^HK\$\s*/i, 'HKD'], [/^NT\$\s*/i, 'TWD'], [/^NZ\$\s*/i, 'NZD'],
    [/^AU?\$\s*/i, 'AUD'], [/^CA?\$\s*/i, 'CAD'], [/^S\$\s*/i, 'SGD'],
    [/^\$\s*/, 'USD'], [/^£\s*/, 'GBP'], [/^€\s*/, 'EUR'],
    [/^₺\s*/, 'TRY'], [/^₹\s*/, 'INR'], [/^₦\s*/, 'NGN'],
    [/^₩\s*/, 'KRW'], [/^฿\s*/, 'THB'], [/^₴\s*/, 'UAH'],
    [/^₱\s*/, 'PHP'], [/^R\$\s*/, 'BRL'], [/^Rp\s*/i, 'IDR'],
    [/^RM\s*/i, 'MYR'], [/^R\s+(?=\d)/, 'ZAR'], [/^¥\s*/, 'JPY'],
    [/^﹩\s*/, 'USD'],
  ]
  for (const [re, code] of PREFIX) {
    if (re.test(s)) { currency = code; s = s.replace(re, ''); break }
  }

  if (!currency) {
    if (/[₫đ]\s*$/.test(s)) { currency = 'VND'; s = s.replace(/[₫đ\s]+$/, '') }
    else if (/\bUSD\s*$/.test(s)) { currency = 'USD'; s = s.replace(/\s*USD\s*$/, '') }
    else if (/\bEUR\s*$/.test(s)) { currency = 'EUR'; s = s.replace(/\s*EUR\s*$/, '') }
    else if (/\bGBP\s*$/.test(s)) { currency = 'GBP'; s = s.replace(/\s*GBP\s*$/, '') }
  }

  s = s.trim()

  // 印尼语单位
  const ribu = s.match(/^([\d.,]+)\s*ribu\s*$/i)
  if (ribu) {
    return { val: (parseFloat(ribu[1].replace(/\./g, '').replace(',', '.')) || 0) * 1000, currency: currency || 'IDR' }
  }
  const juta = s.match(/^([\d.,]+)\s*juta\s*$/i)
  if (juta) {
    return { val: (parseFloat(juta[1].replace(/\./g, '').replace(',', '.')) || 0) * 1000000, currency: currency || 'IDR' }
  }

  s = s.replace(/[^\d.,]+$/, '').trim()

  let val = 0
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // 欧式千位点 + 逗号小数：1.234,56
    val = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    // 英式千位逗号：1,234.56
    val = parseFloat(s.replace(/,/g, ''))
  } else if (/^\d[\d ]*,\d{1,2}$/.test(s)) {
    // 空格千位 + 逗号小数：22,99
    val = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  } else {
    val = parseFloat(s.replace(/,/g, '')) || 0
  }

  return { val, currency }
}

/**
 * 从 App Store 页面 HTML 提取 IAP 列表
 * @returns {Array|null} [{name, priceStr, val, currency}, ...]
 */
async function fetchPageIAPs(appStoreId, countryCode) {
  const url = `https://apps.apple.com/${countryCode}/app/id${appStoreId}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return null
    const html = await res.text()

    // 提取 textPair JSON 对象
    const regex = /\{"\$kind":"textPair","leadingText":"([^"]+)","trailingText":"([^"]+)"\}/g
    let m
    const rawPairs = []
    while ((m = regex.exec(html)) !== null) {
      rawPairs.push({ name: m[1], priceStr: m[2] })
    }

    if (rawPairs.length === 0) return null

    // 只保留货币型价格字符串
    const pricePattern = /^[\$£€¥₺₹₦₩฿₫₴₱﹩R]|^\d{1,3}[,.\s]\d{2}/
    const filtered = rawPairs
      .filter(p => pricePattern.test(p.priceStr))
      .filter(p => !isConsumable(p.name))

    if (filtered.length === 0) return null

    // 去重（同名同价只保留一条）
    const nameGroups = {}
    for (const p of filtered) {
      if (!nameGroups[p.name]) nameGroups[p.name] = []
      const { val, currency } = parsePriceString(p.priceStr)
      if (val > 0 && !nameGroups[p.name].some(x => Math.abs(x.val - val) < 0.01)) {
        nameGroups[p.name].push({ priceStr: p.priceStr, val, currency })
      }
    }

    const result = []
    for (const [name, prices] of Object.entries(nameGroups)) {
      prices.sort((a, b) => a.val - b.val)
      for (const p of prices) {
        result.push({ name, priceStr: p.priceStr, val: p.val, currency: p.currency })
      }
    }

    return result.length > 0 ? result : null
  } catch (e) {
    return null
  }
}

/**
 * 从 iTunes Lookup API 获取 App 元数据（名称、图标、开发者等）
 */
export async function fetchAppMeta(appStoreId) {
  const url = `https://itunes.apple.com/lookup?id=${appStoreId}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const data = await res.json()
  if (!data.results || data.results.length === 0) return null

  const app = data.results[0]
  return {
    appStoreId: String(app.trackId),
    name: app.trackName,
    company: app.artistName || '',
    category: app.primaryGenreName || '',
    icon: app.artworkUrl512 || app.artworkUrl100 || '',
    description: app.description ? app.description.substring(0, 200) : '',
  }
}

/**
 * 核心：抓取单个 App 在 34 国的实时 IAP 价格
 * 返回与旧版 seed 完全兼容的数据结构
 * 
 * @param {string} appStoreId App Store 数字 ID
 * @param {function} onProgress 进度回调 (current, total, countryName)
 * @returns {{ plans, prices, meta }}
 */
export async function scrapeAppPrices(appStoreId, onProgress) {
  const rates = getCnyRates()

  // 1. 抓取美区作为基准
  const usIAPs = await fetchPageIAPs(appStoreId, 'us')
  if (!usIAPs || usIAPs.length === 0) {
    return null // 无 IAP 数据
  }

  // 2. 建立标准套餐列表（美区为基准）
  const nameCount = {}
  const canonicalPlans = []
  for (const iap of usIAPs) {
    nameCount[iap.name] = (nameCount[iap.name] || 0) + 1
    const isDup = usIAPs.filter(x => x.name === iap.name).length > 1
    // 同名套餐用美元价格区分（如月付/年付）
    const key = isDup ? `${iap.name} (${iap.priceStr})` : iap.name
    canonicalPlans.push({ key, name: iap.name, usVal: iap.val })
  }

  const plans = canonicalPlans.map(p => p.key)
  const prices = {}

  // 初始化美区价格
  for (const p of canonicalPlans) {
    const usIAP = usIAPs.find(x => x.name === p.name && Math.abs(x.val - p.usVal) < 0.01)
    const usRate = rates[usIAP?.currency] || rates.USD
    prices[p.key] = [{
      region: '美国', flag: '🇺🇸',
      original: usIAP?.priceStr || `$${p.usVal}`,
      cny: parseFloat((p.usVal * usRate).toFixed(2)),
    }]
  }

  // 3. 并发抓取其余国家（每批 5 个）
  const otherCountries = COUNTRIES.filter(c => c.code !== 'us')
  const concurrency = 5
  let completed = 1 // 美区已完成

  for (let i = 0; i < otherCountries.length; i += concurrency) {
    const batch = otherCountries.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(async (c) => {
      await sleep(Math.random() * 500)
      const iaps = await fetchPageIAPs(appStoreId, c.code)
      return { c, iaps }
    }))

    for (const { c, iaps } of results) {
      completed++
      if (onProgress) onProgress(completed, COUNTRIES.length, c.name)

      if (!iaps) continue

      // 按名称分组
      const countryByName = {}
      for (const iap of iaps) {
        if (!countryByName[iap.name]) countryByName[iap.name] = []
        countryByName[iap.name].push(iap)
      }

      // 匹配 canonical 套餐
      for (const cp of canonicalPlans) {
        const group = countryByName[cp.name]
        if (!group || group.length === 0) continue

        const usGroup = usIAPs.filter(x => x.name === cp.name)
        const posInGroup = usGroup.findIndex(x => Math.abs(x.val - cp.usVal) < 0.01)
        const localIAP = group[posInGroup] || group[group.length - 1]
        if (!localIAP) continue

        const detectedCurrency = localIAP.currency
        const rate = rates[detectedCurrency] || rates[c.currency]
        if (!rate) continue

        prices[cp.key].push({
          region: c.name, flag: c.flag,
          original: localIAP.priceStr,
          cny: parseFloat((localIAP.val * rate).toFixed(2)),
        })
      }
    }
  }

  // 4. 每个套餐按 CNY 升序排列（最低价在前）
  for (const key of plans) {
    prices[key].sort((a, b) => a.cny - b.cny)
  }

  return { plans, prices }
}
