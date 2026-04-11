import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)
const CATALOG_PATH = path.join(CURRENT_DIR, 'data', 'apps.json')

/**
 * 历史 apps.json 现在不再作为“线上真值库”，
 * 但它仍然非常适合做两类事情：
 * 1. 已知 Web 订阅应用（如 Spotify）在 App Store 无 IAP 时的兜底套餐目录
 * 2. 虚拟应用（如 iCloud+）的统一展示格式来源
 *
 * 这里将它降级为“兜底 catalog”，只在实时抓取拿不到真实 IAP 时使用。
 */
function loadCatalogApps() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return []
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn(`[catalog] 读取兜底目录失败: ${error.message}`)
    return []
  }
}

function normalizeAppName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CATALOG_APPS = loadCatalogApps()
const CATALOG_BY_ID = new Map(CATALOG_APPS.map(app => [app.id, app]))
const CATALOG_NAME_INDEX = CATALOG_APPS.map(app => ({
  app,
  normalizedName: normalizeAppName(app.name),
}))

/**
 * 对少数“App Store 名称”和 catalog 名称差异极大的应用做显式映射。
 * 这里只放高频、明确、稳定的映射，避免把模糊规则写死太多。
 */
const APP_STORE_ID_TO_CATALOG_ID = {
  '324684580': 'spotify',
  '6448311069': 'chatgpt',
  '6473753684': 'claude',
  '6670324846': 'grok',
  '544007664': 'youtube',
  '570060128': 'duolingo',
  '1511601750': '1password',
  'virtual-icloud': 'icloud',
}

export function getCatalogAppById(id) {
  return CATALOG_BY_ID.get(id) || null
}

export function findCatalogApp({ appStoreId, name }) {
  if (APP_STORE_ID_TO_CATALOG_ID[appStoreId]) {
    return getCatalogAppById(APP_STORE_ID_TO_CATALOG_ID[appStoreId])
  }

  const normalized = normalizeAppName(name)
  if (!normalized) return null

  const exact = CATALOG_NAME_INDEX.find(entry => entry.normalizedName === normalized)
  if (exact) return exact.app

  const prefix = CATALOG_NAME_INDEX.find(entry =>
    normalized.startsWith(`${entry.normalizedName} `) ||
    entry.normalizedName.startsWith(`${normalized} `)
  )
  if (prefix) return prefix.app

  const fuzzy = CATALOG_NAME_INDEX.find(entry =>
    entry.normalizedName.length >= 4 &&
    (normalized.includes(entry.normalizedName) || entry.normalizedName.includes(normalized))
  )
  return fuzzy?.app || null
}

export function hasCatalogFallback(appStoreId, name) {
  return !!findCatalogApp({ appStoreId, name })
}

export function buildCatalogBackedApp(catalogApp, { runtimeId, meta } = {}) {
  if (!catalogApp) return null

  /**
   * 运行时页面仍然使用当前 App Store 的数值 ID 作为详情路由主键，
   * 这样不会把新的实时架构又绕回旧 slug 体系。
   * 但套餐和价格则直接复用 catalog 中已经整理好的结构。
   */
  return {
    id: runtimeId || catalogApp.id,
    appStoreId: runtimeId || catalogApp.id,
    name: meta?.name || catalogApp.name,
    company: meta?.company || catalogApp.company,
    category: meta?.category || catalogApp.category,
    icon: meta?.icon || catalogApp.icon,
    description: meta?.description || catalogApp.description,
    plansCount: catalogApp.plansCount || catalogApp.plans?.length || 0,
    plans: catalogApp.plans || [],
    prices: catalogApp.prices || {},
    fallback: true,
    fallbackCatalogId: catalogApp.id,
  }
}

