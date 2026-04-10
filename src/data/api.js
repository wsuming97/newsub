/**
 * 应用数据服务层 v2
 * 实时查询模式：搜索 → 选中 → 实时抓取价格
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const DEFAULT_CONFIG = Object.freeze({
  cnyRates: { USD: 6.84, CNY: 1 },
  regions: [],
  regionCount: 34
})

// ============================================================
// 缓存
// ============================================================
let configCache = null

async function parseJsonSafely(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * 获取全局配置（实时汇率 + 地区列表）
 */
export async function fetchConfig() {
  if (configCache) return configCache
  try {
    const res = await fetch(`${API_BASE}/config`)
    const json = await parseJsonSafely(res)
    if (res.ok && json?.success) {
      configCache = json.data
      return configCache
    }
  } catch (e) {
    console.error('获取配置失败:', e)
  }
  return DEFAULT_CONFIG
}

/**
 * 搜索 App Store 应用
 * @param {string} query 关键词
 * @returns {Promise<Array>} [{appStoreId, name, icon, developer, genre}, ...]
 */
export async function searchApps(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return []
    const json = await parseJsonSafely(res)
    return json?.success ? json.data : []
  } catch (e) {
    console.error('搜索失败:', e)
    return []
  }
}

/**
 * 获取应用详情 + 34 国实时价格
 * 首次请求可能需要 15-30 秒（实时抓取）
 * 
 * @param {string} appStoreId App Store 数字 ID
 * @returns {Promise<Object|null>} 应用详情含价格
 */
export async function fetchAppById(appStoreId) {
  const res = await fetch(`${API_BASE}/app/${appStoreId}`)
  const json = await parseJsonSafely(res)
  if (res.status === 404) return null
  if (!res.ok) {
    const error = new Error(json?.error || '获取应用详情失败')
    error.status = res.status
    throw error
  }
  return json || null
}

/**
 * 获取已缓存的应用列表（热门/最近查看）
 */
export async function fetchApps() {
  try {
    const res = await fetch(`${API_BASE}/apps`)
    const json = await parseJsonSafely(res)
    return json?.success ? json.data : []
  } catch {
    return []
  }
}

// 热门推荐应用 ID 列表（前端后备，防止后端崩了连图标都不显示）
export const RECOMMENDED_APPS = [
  { appStoreId: '6448311069', name: 'ChatGPT', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/df/e7/8a/dfe78ae8-cb35-b6d0-ce4c-e9f2e7467789/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6473753684', name: 'Claude', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79b3-e371-93e8c867a1e8/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6477489729', name: 'Google Gemini', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e0/2b/81/e02b8100-8608-89ec-8b0d-5b2854b5d86c/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6670324846', name: 'Grok', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/33/43/02/3343025c-462b-ebb3-e4b1-c2a94e48b68e/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '544007664', name: 'YouTube', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b0/b6/c1/b0b6c1e8-1f66-e48b-e604-4f51ef0c5ab9/logo_youtube_color-0-0-1x_U007emarketing-0-0-0-6-0-0-sRGB-85-220.png/230x0w.webp', category: '影音', plansCount: 0 },
  { appStoreId: '324684580', name: 'Spotify', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1b/e8/ea/1be8eaca-253c-4a23-e5c4-ca9a2cd8e498/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: '影音', plansCount: 0 }
]
