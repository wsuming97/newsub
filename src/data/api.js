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

export const RECOMMENDED_APPS = [
  { appStoreId: '6448311069', name: 'ChatGPT', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/df/e7/8a/dfe78ae8-cb35-b6d0-ce4c-e9f2e7467789/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6473753684', name: 'Claude', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79b3-e371-93e8c867a1e8/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6670324846', name: 'Grok', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/33/43/02/3343025c-462b-ebb3-e4b1-c2a94e48b68e/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '686449807', name: 'Telegram', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79b3-e371-93e8c867a1e8/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '333903271', name: 'X', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/0d/17/dc/0d17dcd3-ab67-27b2-fc8e-73c1fec35835/AppIcon-0-0-1x_U007emarketing-0-1-0-sRGB-85-220.png/230x0w.webp', category: 'News', plansCount: 0 },
  { appStoreId: '544007664', name: 'YouTube', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b0/b6/c1/b0b6c1e8-1f66-e48b-e604-4f51ef0c5ab9/logo_youtube_color-0-0-1x_U007emarketing-0-0-0-6-0-0-sRGB-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '324684580', name: 'Spotify', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1b/e8/ea/1be8eaca-253c-4a23-e5c4-ca9a2cd8e498/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  { appStoreId: '363590051', name: 'Netflix', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b9/e7/d2/b9e7d2bb-3ef7-47b7-5421-2e6b78ae070f/AppIcon-0-0-1x_U007emarketing-0-7-0-P3-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1446075923', name: 'Disney+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/35/65/d5/3565d5fa-ea73-3560-64ad-4dd3dbadd0d7/AppIcon-0-0-1x_U007emarketing-0-4-0-sRGB-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '570060128', name: 'Duolingo', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a4/09/a2/a409a250-93a8-4228-4ad0-ea857f6d90bc/AppIcon-0-0-1x_U007emarketing-0-5-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  { appStoreId: '547702041', name: 'Tinder', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e5/db/37/e5db3712-6b3e-e0af-f91b-8b125271e878/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/230x0w.webp', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '897446215', name: 'Canva', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fa/d3/18/fad31855-32e6-aeb5-31a9-9e0c15f9dff5/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '586447913', name: 'Microsoft Word', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f4/e0/f1/f4e0f10c-15a9-e260-bd4a-6752df85d6b4/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '546505307', name: 'ZOOM', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1e/18/cd/1e18cde6-45ef-dd30-e31e-45de5076e469/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/230x0w.webp', category: 'Business', plansCount: 0 },
  { appStoreId: '985746746', name: 'Discord', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/aa/62/7b/aa627bbc-c598-a90f-561b-9d41d13bcfac/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '1228438669', name: 'Notion', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/28/fc/24/28fc244e-a612-daff-f187-573516bed53a/AppIcon-Light-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 }
]
