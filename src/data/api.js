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
 * @param {string} appStoreId App Store 数字 ID 或虚拟 ID（如 virtual-icloud）
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

// ============================================================
// 热门推荐应用列表（前端后备展示，共约 100 个）
// - 普通应用使用 appStoreId 数字字符串
// - 虚拟应用（如 iCloud）使用 "virtual-xxx" 格式，后端启动时注入缓存
// ============================================================
export const RECOMMENDED_APPS = [
  // ─── AI 工具 ─────────────────────────────────────────────────
  { appStoreId: '6448311069', name: 'ChatGPT', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/df/e7/8a/dfe78ae8-cb35-b6d0-ce4c-e9f2e7467789/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6473753684', name: 'Claude', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79b3-e371-93e8c867a1e8/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  { appStoreId: '6670324846', name: 'Grok', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/33/43/02/3343025c-462b-ebb3-e4b1-c2a94e48b68e/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'AI', plansCount: 0 },
  // ─── 苹果官方服务（虚拟硬编码，后端注入缓存）───────────────
  { appStoreId: 'virtual-icloud', name: 'iCloud+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp', category: 'Cloud Storage', plansCount: 5 },
  // ─── 社交通讯 ─────────────────────────────────────────────────
  { appStoreId: '686449807', name: 'Telegram', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79b3-e371-93e8c867a1e8/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '333903271', name: 'X', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/0d/17/dc/0d17dcd3-ab67-27b2-fc8e-73c1fec35835/AppIcon-0-0-1x_U007emarketing-0-1-0-sRGB-85-220.png/230x0w.webp', category: 'News', plansCount: 0 },
  { appStoreId: '985746746', name: 'Discord', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/aa/62/7b/aa627bbc-c598-a90f-561b-9d41d13bcfac/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '547702041', name: 'Tinder', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e5/db/37/e5db3712-6b3e-e0af-f91b-8b125271e878/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/230x0w.webp', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '930441707', name: 'Bumble', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e5/db/37/e5db3712-6b3e-e0af-f91b-8b125271e878/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/230x0w.webp', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '575855453', name: 'Hinge', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/0d/1c/84/0d1c8483-5551-0b99-0ff3-c88c45d26eae/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Lifestyle', plansCount: 0 },
  // ─── 影音娱乐 ─────────────────────────────────────────────────
  { appStoreId: '544007664', name: 'YouTube', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b0/b6/c1/b0b6c1e8-1f66-e48b-e604-4f51ef0c5ab9/logo_youtube_color-0-0-1x_U007emarketing-0-0-0-6-0-0-sRGB-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '324684580', name: 'Spotify', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1b/e8/ea/1be8eaca-253c-4a23-e5c4-ca9a2cd8e498/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  { appStoreId: '363590051', name: 'Netflix', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b9/e7/d2/b9e7d2bb-3ef7-47b7-5421-2e6b78ae070f/AppIcon-0-0-1x_U007emarketing-0-7-0-P3-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1446075923', name: 'Disney+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/35/65/d5/3565d5fa-ea73-3560-64ad-4dd3dbadd0d7/AppIcon-0-0-1x_U007emarketing-0-4-0-sRGB-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1435009534', name: 'Apple TV', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/bf/d5/1f/bfd51f1f-d7d3-d3dd-3bce-d8cf3feaac10/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '578608491', name: 'Twitch', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/91/10/7e/91107eb1-4e4f-33a1-0196-c3fdb8b47f71/AppIcon-0-0-1x_U007emarketing-0-10-0-sRGB-85-220.png/230x0w.webp', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '391307905', name: 'Pandora', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/79/f9/32/79f932be-f9c1-1965-20c2-484f29cd78b8/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  { appStoreId: '336353151', name: 'SoundCloud', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f4/e3/7e/f4e37e01-fa90-6649-bd08-2c48d80dc5be/AppIcon-0-0-1x_U007emarketing-0-5-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  { appStoreId: '459858183', name: 'Deezer', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/36/ff/6d/36ff6d8f-99ff-57e0-62d8-2a6e61d5c1a9/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  { appStoreId: '1440241219', name: 'Tidal', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/13/0c/ce/130cce73-b0e9-d7da-9c19-00001e07daf2/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Music', plansCount: 0 },
  // ─── 办公效率 ─────────────────────────────────────────────────
  { appStoreId: '586447913', name: 'Microsoft Word', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f4/e0/f1/f4e0f10c-15a9-e260-bd4a-6752df85d6b4/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586454090', name: 'Microsoft Excel', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b7/bb/f8/b7bbf888-1c0a-7d94-69ff-7cb044a6aa12/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586374669', name: 'Microsoft PowerPoint', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bb/c6/61/bbc661c0-4f44-f4b2-56e4-d7258c862c4d/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '477537958', name: 'Microsoft OneDrive', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '546505307', name: 'Zoom', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1e/18/cd/1e18cde6-45ef-dd30-e31e-45de5076e469/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/230x0w.webp', category: 'Business', plansCount: 0 },
  { appStoreId: '1228438669', name: 'Notion', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/28/fc/24/28fc244e-a612-daff-f187-573516bed53a/AppIcon-Light-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1477376905', name: 'Figma', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e1/a0/49/e1a0494d-7e30-4e1a-5cfc-fa7a7ef7b87d/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1037215463', name: 'Dropbox', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/65/3e/15/653e157d-3ab5-d8c9-e14e-d40fe4f2a233/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1232780281', name: 'Readwise', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7a/af/e3/7aafe346-7e61-04a5-8c68-2e1e940c6ef2/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Productivity', plansCount: 0 },
  // ─── 设计创作 ─────────────────────────────────────────────────
  { appStoreId: '897446215', name: 'Canva', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fa/d3/18/fad31855-32e6-aeb5-31a9-9e0c15f9dff5/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1488977981', name: 'Procreate Pocket', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/45/be/1e/45be1e1b-b1f7-ebfc-d3ea-1d8d30e8a1f3/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1570800848', name: 'Picsart', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/40/92/f0/4092f002-7d04-a42b-8a70-4a2cf8e3a4f1/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1065046889', name: 'Facetune', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c7/fb/19/c7fb196e-7d39-c7c3-1bba-b0c8c2dffa32/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1147396723', name: 'Splice', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/67/06/eb/6706eba8-7082-5e19-e3c5-93e08ef5a9a2/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1116898438', name: 'Darkroom', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b2/13/36/b21336e5-ed4f-b9db-d67a-8b7c244f7069/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1193508329', name: 'LumaFusion', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ff/db/8e/ffdb8e9f-8965-2f8e-f1e6-97fa3e9c6e48/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Photo & Video', plansCount: 0 },
  // ─── 健康健身 ─────────────────────────────────────────────────
  { appStoreId: '571800810', name: 'Calm', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/64/57/c7/6457c7c6-a1c5-3700-e5f6-b7355e54b68e/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '426826309', name: 'Strava', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f3/ac/43/f3ac4387-5a6d-e8b8-cc58-3a3c4f521537/AppIcon-0-0-1x_U007ephone-0-1-0-sRGB-85-220.png/230x0w.webp', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '1239223143', name: 'Headspace', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e4/fc/e6/e4fce609-b3fb-4e42-b1d4-facdcf90db78/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/230x0w.webp', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '1065081912', name: 'Peloton', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/5d/39/e4/5d39e4d4-7ec8-2ffe-9c24-98f6ffb26540/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '346818049', name: 'MyFitnessPal', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/35/e3/11/35e31123-6bab-5d5e-0e0c-23a58bd4e1b0/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Health & Fitness', plansCount: 0 },
  // ─── 学习教育 ─────────────────────────────────────────────────
  { appStoreId: '570060128', name: 'Duolingo', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a4/09/a2/a409a250-93a8-4228-4ad0-ea857f6d90bc/AppIcon-0-0-1x_U007emarketing-0-5-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  { appStoreId: '1469863401', name: 'Rosetta Stone', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/93/25/22/93252256-04f3-ca0e-8fb3-9eb3b5fd5e41/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  { appStoreId: '1440642956', name: 'Babbel', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/26/de/99/26de9906-af88-cb25-7fc1-69de3f5e20c4/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  { appStoreId: '1265591769', name: 'Photomath', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/34/8b/ad/348badf0-e44d-a4c6-18e4-e62e28dc79e5/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  { appStoreId: '303878510', name: 'Khan Academy', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/95/bb/24/95bb24a8-7d01-2a4e-1c55-4cd73fd97a8d/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Education', plansCount: 0 },
  // ─── VPN / 安全 ────────────────────────────────────────────────
  { appStoreId: '1315275818', name: 'NordVPN', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/05/0c/bc/050cbc6a-e07a-9d21-7b5f-a9a2df9d4e59/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Network', plansCount: 0 },
  { appStoreId: '590379981', name: 'ExpressVPN', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/76/6f/09/766f09b5-b55c-4c8e-6a27-5dfbd91e5ec7/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Network', plansCount: 0 },
  { appStoreId: '1236571234', name: 'Surfshark VPN', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8d/b7/86/8db78628-68c5-9c5f-0bb9-e7987a3e1fbe/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Network', plansCount: 0 },
  { appStoreId: '1475105505', name: '1Password', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/a1/00/95/a100950a-8d0e-5bb8-4c43-7c1e81e11aad/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Network', plansCount: 0 },
  // ─── 金融理财 ─────────────────────────────────────────────────
  { appStoreId: '1484286629', name: 'Revolut', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/44/b8/09/44b8097d-2499-9d2c-5ddc-abc3d9b4edd7/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Finance', plansCount: 0 },
  { appStoreId: '389681421', name: 'YNAB', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/42/8e/d1/428ed141-69f4-4b3d-75e5-a09e69ce5406/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Finance', plansCount: 0 },
  { appStoreId: '1278757452', name: 'Robinhood', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/07/db/f5/07dbf572-b706-2b6e-a487-9d90c641a0fc/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Finance', plansCount: 0 },
  { appStoreId: '1452054429', name: 'Acorns', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b2/9d/52/b29d52a7-e2af-7c7c-d9f1-8fbc4d14f8ef/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Finance', plansCount: 0 },
  // ─── 新闻阅读 ─────────────────────────────────────────────────
  { appStoreId: '288666525', name: 'The New York Times', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c3/e1/5a/c3e15a52-0f41-0bcc-7b75-484cba79ef1a/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'News', plansCount: 0 },
  { appStoreId: '1356282326', name: 'Pocket', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/0e/92/21/0e9221b2-4b87-b5ed-1c37-6df2a9f0e7c1/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'News', plansCount: 0 },
  { appStoreId: '1447513738', name: 'Inoreader', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/43/9e/d2/439ed29f-024b-8df5-6a03-89ca0de3f0bd/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'News', plansCount: 0 },
  // ─── 游戏 ─────────────────────────────────────────────────────
  { appStoreId: '1640745955', name: 'Monopoly Go!', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/d3/f9/3a/d3f93af5-1c80-9720-3d73-a5af1f20d5c1/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '310633997', name: 'Clash of Clans', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/45/b5/a2/45b5a2c0-d54f-9e2a-5e66-10f7c3a0d571/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '444934566', name: 'Clash Royale', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c1/93/c1/c193c1fe-2551-61a4-ec09-09d7e6c80da9/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '1096918571', name: 'Roblox', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/24/1f/a3/241fa35c-de5f-4898-e4d2-62f5c8f2b3a3/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '979274205', name: 'Candy Crush Saga', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/65/81/1f/65811f9a-edfa-ca53-a2e6-36e2ce09c4d5/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '1188369007', name: 'Pokémon GO', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/dd/dd/d2/ddddd26f-9f5c-1685-6c40-4e40b41b2d99/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '1452289769', name: 'Genshin Impact', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bd/11/03/bd110377-fcd4-acce-af36-e9b43d1e9b89/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '389801252', name: 'Minecraft', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/3b/4a/c5/3b4ac5c2-91ec-a20b-6a47-dbfb40b5ef56/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
  { appStoreId: '626143814', name: 'Gardenscapes', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e5/02/81/e5028145-5c65-0a72-d985-b0c6ddba7e7d/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/230x0w.webp', category: 'Games', plansCount: 0 },
]
