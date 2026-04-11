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
// 热门推荐应用列表（前端后备展示）
// - 所有 appStoreId 已通过 iTunes API 验证确认存在
// - 虚拟应用（如 iCloud）使用 "virtual-xxx" 格式，后端启动时注入缓存
// - 图标使用占位符，后端 /api/apps 轮询时会替换为真实图标
// ============================================================
export const RECOMMENDED_APPS = [
  // ─── AI 工具 ─────────────────────────────────────────────────
  { appStoreId: '6448311069', name: 'ChatGPT', icon: '', category: 'AI', plansCount: 0 },
  { appStoreId: '6473753684', name: 'Claude', icon: '', category: 'AI', plansCount: 0 },
  { appStoreId: '6670324846', name: 'Grok', icon: '', category: 'AI', plansCount: 0 },
  // ─── 苹果官方服务（虚拟硬编码）──────────────────────────────
  { appStoreId: 'virtual-icloud', name: 'iCloud+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp', category: 'Cloud Storage', plansCount: 5 },
  // ─── 社交通讯 ─────────────────────────────────────────────────
  { appStoreId: '686449807', name: 'Telegram', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '333903271', name: 'X', icon: '', category: 'News', plansCount: 0 },
  { appStoreId: '985746746', name: 'Discord', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '447188370', name: 'Snapchat', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '443904275', name: 'LINE', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '414478124', name: 'WeChat', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '305343404', name: 'Tumblr', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '874139669', name: 'Signal', icon: '', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '382617920', name: 'Viber', icon: '', category: 'Social Networking', plansCount: 0 },
  // ─── 交友 ─────────────────────────────────────────────────────
  { appStoreId: '547702041', name: 'Tinder', icon: '', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '930441707', name: 'Bumble', icon: '', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '595287172', name: 'Hinge', icon: '', category: 'Lifestyle', plansCount: 0 },
  // ─── 影音娱乐 ─────────────────────────────────────────────────
  { appStoreId: '544007664', name: 'YouTube', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '363590051', name: 'Netflix', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1446075923', name: 'Disney+', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1174078549', name: 'Apple TV', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '460177396', name: 'Twitch', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1666653815', name: 'HBO Max', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '376510438', name: 'Hulu', icon: '', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '545519333', name: 'Amazon Prime Video', icon: '', category: 'Entertainment', plansCount: 0 },
  // ─── 音乐 ─────────────────────────────────────────────────────
  { appStoreId: '324684580', name: 'Spotify', icon: '', category: 'Music', plansCount: 0 },
  { appStoreId: '284035177', name: 'Pandora', icon: '', category: 'Music', plansCount: 0 },
  { appStoreId: '336353151', name: 'SoundCloud', icon: '', category: 'Music', plansCount: 0 },
  { appStoreId: '292738169', name: 'Deezer', icon: '', category: 'Music', plansCount: 0 },
  { appStoreId: '913943275', name: 'TIDAL', icon: '', category: 'Music', plansCount: 0 },
  { appStoreId: '284993459', name: 'Shazam', icon: '', category: 'Music', plansCount: 0 },
  // ─── 办公效率 ─────────────────────────────────────────────────
  { appStoreId: '586447913', name: 'Microsoft Word', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586683407', name: 'Microsoft Excel', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586449534', name: 'Microsoft PowerPoint', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '477537958', name: 'Microsoft OneDrive', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '546505307', name: 'Zoom', icon: '', category: 'Business', plansCount: 0 },
  { appStoreId: '1232780281', name: 'Notion', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1152747299', name: 'Figma', icon: '', category: 'Graphics & Design', plansCount: 0 },
  { appStoreId: '327630330', name: 'Dropbox', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '618783545', name: 'Slack', icon: '', category: 'Business', plansCount: 0 },
  { appStoreId: '461504587', name: 'Trello', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '489969512', name: 'Asana', icon: '', category: 'Business', plansCount: 0 },
  { appStoreId: '1290128888', name: 'Monday.com', icon: '', category: 'Business', plansCount: 0 },
  { appStoreId: '1444383602', name: 'GoodNotes', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1016366447', name: 'Bear', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1158877342', name: 'Grammarly', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '507874739', name: 'Google Drive', icon: '', category: 'Productivity', plansCount: 0 },
  // ─── 设计创作 ─────────────────────────────────────────────────
  { appStoreId: '897446215', name: 'Canva', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '587366035', name: 'Picsart', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1149994032', name: 'Facetune', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '409838725', name: 'Splice', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '953286746', name: 'Darkroom', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1062022008', name: 'LumaFusion', icon: '', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '916366645', name: 'Procreate Pocket', icon: '', category: 'Graphics & Design', plansCount: 0 },
  { appStoreId: '878783582', name: 'Adobe Lightroom', icon: '', category: 'Photo & Video', plansCount: 0 },
  // ─── 健康健身 ─────────────────────────────────────────────────
  { appStoreId: '571800810', name: 'Calm', icon: '', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '426826309', name: 'Strava', icon: '', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '493145008', name: 'Headspace', icon: '', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '792750948', name: 'Peloton', icon: '', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '341232718', name: 'MyFitnessPal', icon: '', category: 'Health & Fitness', plansCount: 0 },
  // ─── 学习教育 ─────────────────────────────────────────────────
  { appStoreId: '570060128', name: 'Duolingo', icon: '', category: 'Education', plansCount: 0 },
  { appStoreId: '435588892', name: 'Rosetta Stone', icon: '', category: 'Education', plansCount: 0 },
  { appStoreId: '829587759', name: 'Babbel', icon: '', category: 'Education', plansCount: 0 },
  { appStoreId: '919087726', name: 'Photomath', icon: '', category: 'Education', plansCount: 0 },
  { appStoreId: '469863705', name: 'Khan Academy', icon: '', category: 'Education', plansCount: 0 },
  { appStoreId: '1084807225', name: 'LinkedIn Learning', icon: '', category: 'Education', plansCount: 0 },
  // ─── VPN / 安全 ────────────────────────────────────────────────
  { appStoreId: '905953485', name: 'NordVPN', icon: '', category: 'Utilities', plansCount: 0 },
  { appStoreId: '886492891', name: 'ExpressVPN', icon: '', category: 'Utilities', plansCount: 0 },
  { appStoreId: '1391782046', name: 'Surfshark', icon: '', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1511601750', name: '1Password', icon: '', category: 'Productivity', plansCount: 0 },
  // ─── 金融理财 ─────────────────────────────────────────────────
  { appStoreId: '1010865877', name: 'YNAB', icon: '', category: 'Finance', plansCount: 0 },
  { appStoreId: '938003185', name: 'Robinhood', icon: '', category: 'Finance', plansCount: 0 },
  // ─── 新闻阅读 ─────────────────────────────────────────────────
  { appStoreId: '284862083', name: 'New York Times', icon: '', category: 'News', plansCount: 0 },
  { appStoreId: '892355414', name: 'Inoreader', icon: '', category: 'News', plansCount: 0 },
  // ─── 生活出行 ─────────────────────────────────────────────────
  { appStoreId: '429047995', name: 'Pinterest', icon: '', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '585027354', name: 'Google Maps', icon: '', category: 'Navigation', plansCount: 0 },
  { appStoreId: '529379082', name: 'Lyft', icon: '', category: 'Travel', plansCount: 0 },
  { appStoreId: '719972451', name: 'DoorDash', icon: '', category: 'Food & Drink', plansCount: 0 },
  // ─── 游戏 ─────────────────────────────────────────────────────
  { appStoreId: '1053012308', name: 'Clash Royale', icon: '', category: 'Games', plansCount: 0 },
  { appStoreId: '553834731', name: 'Candy Crush Saga', icon: '', category: 'Games', plansCount: 0 },
  { appStoreId: '1094591345', name: 'Pokémon GO', icon: '', category: 'Games', plansCount: 0 },
  { appStoreId: '1517783697', name: 'Genshin Impact', icon: '', category: 'Games', plansCount: 0 },
  { appStoreId: '479516143', name: 'Minecraft', icon: '', category: 'Games', plansCount: 0 },
]

