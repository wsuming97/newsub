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
// - 图标已通过 iTunes API 批量获取并硬编码为真实 URL
// ============================================================
export const RECOMMENDED_APPS = [
  // ─── AI 工具 ─────────────────────────────────────────────────
  { appStoreId: '6448311069', name: 'ChatGPT', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ec/76/42/ec764230-710a-8160-e40c-3a31208206ad/AppIcon-0-0-1x_U007epad-0-0-0-1-0-P3-85-220.png/512x512bb.jpg', category: 'AI', plansCount: 0 },
  { appStoreId: '6473753684', name: 'Claude', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c6/48/aa/c648aa08-dbb4-d209-209e-ad773e5a7643/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'AI', plansCount: 0 },
  { appStoreId: '6670324846', name: 'Grok', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1c/ba/8e/1cba8e0a-3914-b514-2078-f1c2b1868938/AppIcon-0-0-1x_U007epad-0-0-0-1-0-0-P3-85-220.png/512x512bb.jpg', category: 'AI', plansCount: 0 },
  // ─── 苹果官方服务（虚拟硬编码）──────────────────────────────
  { appStoreId: 'virtual-icloud', name: 'iCloud+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/230x0w.webp', category: 'Cloud Storage', plansCount: 5 },
  // ─── 社交通讯 ─────────────────────────────────────────────────
  { appStoreId: '686449807', name: 'Telegram', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/da/4c/f6/da4cf68b-3261-b5f2-1b2d-cf8bbce4b6d1/Telegram-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '333903271', name: 'X', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/7c/c2/ed/7cc2ed30-b897-47db-ff1d-173d6fe0d9c8/ProductionAppIcon-0-0-1x_U007emarketing-0-8-0-0-0-85-220.png/512x512bb.jpg', category: 'News', plansCount: 0 },
  { appStoreId: '985746746', name: 'Discord', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b1/3f/06/b13f0645-061f-2776-cceb-5e7c4ce0b62e/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '447188370', name: 'Snapchat', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/3e/51/9d/3e519dbc-b0b0-b292-837b-97027c235050/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '443904275', name: 'LINE', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/3c/94/76/3c947650-6dca-95f0-ed2d-e75adb21b2c0/basic_default-0-0-1x_U007epad-0-6-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '414478124', name: 'WeChat', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/fd/60/e5/fd60e542-c113-d554-f321-0ac3d81a5280/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-0-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '305343404', name: 'Tumblr', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/bf/09/4e/bf094ec2-c283-8ff8-7e40-d94f82b2e106/TumblrIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '874139669', name: 'Signal', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/aa/41/34/aa413427-a8b5-b4e4-d81e-acbf7bf1e404/AppIcon-0-1x_U007epad-0-0-0-1-0-0-sRGB-0-85-220-0.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  { appStoreId: '382617920', name: 'Viber', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c3/6d/83/c36d83ea-ad22-dd42-a4c1-34cf743a2965/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-0-85-220.png/512x512bb.jpg', category: 'Social Networking', plansCount: 0 },
  // ─── 交友 ─────────────────────────────────────────────────────
  { appStoreId: '547702041', name: 'Tinder', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/cb/f3/f1/cbf3f10a-3003-d37e-d9e3-39c28f23292d/AppIcon-0-0-1x_U007emarketing-0-8-0-0-sRGB-0-85-220.png/512x512bb.jpg', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '930441707', name: 'Bumble', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e5/db/37/e5db3712-6b3e-e0af-f91b-8b125271e878/AppIcon-0-0-1x_U007ephone-0-1-0-85-220.png/512x512bb.jpg', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '595287172', name: 'Hinge', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/db/3e/b3/db3eb377-3fdb-b8b3-b248-3847e46c5f42/AppIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/512x512bb.jpg', category: 'Lifestyle', plansCount: 0 },
  // ─── 影音娱乐 ─────────────────────────────────────────────────
  { appStoreId: '544007664', name: 'YouTube', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/71/1e/48/711e48f1-1585-6c80-95b8-c8a13759ab41/logo_youtube_2024_q4_color-0-1x_U007emarketing-0-0-0-7-0-0-0-85-220-0.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '363590051', name: 'Netflix', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/76/7d/32/767d32ad-6e12-13eb-339f-1823ea6e5deb/AppIcon-0-0-1x_U007emarketing-0-11-0-sRGB-0-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1446075923', name: 'Disney+', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/17/74/23/17742375-defe-e18b-84dc-1418f954de4c/AppIcon-0-0-1x_U007emarketing-0-8-0-0-0-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1174078549', name: 'Apple TV', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/41/88/af/4188af31-d75a-23c9-f97b-486ec1ff4897/tv-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '460177396', name: 'Twitch', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2e/6e/7f/2e6e7f88-6a9c-cf76-7fc3-5da377192c9d/TwitchAppIcon-0-0-1x_U007epad-0-1-0-0-0-0-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '1666653815', name: 'HBO Max', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/68/58/a2/6858a221-a950-dbd1-e31a-3fd55d644ae9/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '376510438', name: 'Hulu', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f8/47/56/f84756a8-a4ac-78eb-f9be-9e56e9a41506/HuluAppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  { appStoreId: '545519333', name: 'Amazon Prime Video', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/98/92/11/989211e7-2f79-3f52-f6d4-c41d7bfb5cb3/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg', category: 'Entertainment', plansCount: 0 },
  // ─── 音乐 ─────────────────────────────────────────────────────
  { appStoreId: '324684580', name: 'Spotify', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c4/8c/93/c48c9331-24df-f7ba-2837-1719d1eb0a23/AppIcon-0-0-1x_U007epad-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'Music', plansCount: 0 },
  { appStoreId: '284035177', name: 'Pandora', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/17/9b/09/179b0988-c6df-4625-b07d-7449e499ac25/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg', category: 'Music', plansCount: 0 },
  { appStoreId: '336353151', name: 'SoundCloud', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/9e/b5/dc/9eb5dca9-3c73-e4ab-08f0-a203026e5312/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Music', plansCount: 0 },
  { appStoreId: '292738169', name: 'Deezer', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/24/0f/b3/240fb330-2122-24c2-6857-48ca9d4568be/AppIcon-0-0-1x_U007epad-0-11-0-0-85-220.png/512x512bb.jpg', category: 'Music', plansCount: 0 },
  { appStoreId: '913943275', name: 'TIDAL', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d8/3d/0d/d83d0d9e-6071-5e2d-6b1a-39ae9481a85a/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Music', plansCount: 0 },
  // ─── 办公效率 ─────────────────────────────────────────────────
  { appStoreId: '586447913', name: 'Microsoft Word', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/5e/e4/3b/5ee43b5f-e62a-daa8-47fb-55d5f15a2fa6/AppIcon-0-0-1x_U007epad-0-1-0-0-sRGB-0-0-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586683407', name: 'Microsoft Excel', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7c/08/d8/7c08d847-71ea-c6b1-7947-2f826a3ac61c/AppIcon-0-0-1x_U007epad-0-1-0-0-sRGB-0-0-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '586449534', name: 'Microsoft PowerPoint', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/25/10/d5/2510d5b8-f11e-61ce-66c3-b22c44ef5b7e/AppIcon-0-0-1x_U007epad-0-1-0-0-sRGB-0-0-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '477537958', name: 'Microsoft OneDrive', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/71/2c/25/712c2562-3108-e1e8-48e9-5665710bba2f/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '546505307', name: 'Zoom', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ed/82/58/ed8258ee-0ee7-1a77-13ec-829b448cb597/AppIcon-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg', category: 'Business', plansCount: 0 },
  { appStoreId: '1232780281', name: 'Notion', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/7f/77/5e/7f775e63-96bf-b789-b2f2-6ce264a7b6a7/AppIconProd-0-0-1x_U007epad-0-0-0-1-0-0-P3-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1152747299', name: 'Figma', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/68/fd/92/68fd9257-7632-2987-f487-6f20e5de1b27/AppIcon-0-1x_U007epad-0-1-0-85-220-0.png/512x512bb.jpg', category: 'Graphics & Design', plansCount: 0 },
  { appStoreId: '327630330', name: 'Dropbox', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e7/43/3d/e7433d3d-0c93-f6c1-db92-da3ffb2edfcd/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '618783545', name: 'Slack', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/4e/8f/58/4e8f581c-d875-5002-ff4f-085b9961f895/slack_icon_prod-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg', category: 'Business', plansCount: 0 },
  { appStoreId: '461504587', name: 'Trello', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7e/62/6c/7e626c31-214a-bb2e-d028-074995010ce4/AppIcon-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '489969512', name: 'Asana', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/89/24/b0/8924b00f-2e70-0ee4-805d-a4bbb4d9347d/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'Business', plansCount: 0 },
  { appStoreId: '1290128888', name: 'Monday.com', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/df/77/a2/df77a23a-2dbc-9e7a-df9d-3fc13619de1c/AppIcon-Monday-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Business', plansCount: 0 },
  { appStoreId: '1444383602', name: 'GoodNotes', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3a/09/a3/3a09a324-bd5d-350c-ef4f-73ca96789043/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1016366447', name: 'Bear', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7a/25/bb/7a25bb6c-49d8-e236-86e5-ccad3a5bf8c2/AppIcon-26-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1158877342', name: 'Grammarly', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/34/ad/b9/34adb9f7-5aca-d64e-2c15-6c40dc701aeb/AppIcon-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '507874739', name: 'Google Drive', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/24/e8/60/24e86031-0dd1-ecfa-31b6-631fe79f847e/drive_2020q4-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-0-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  // ─── 设计创作 ─────────────────────────────────────────────────
  { appStoreId: '897446215', name: 'Canva', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f0/0c/7c/f00c7cbe-8416-9468-1d70-4bc605b51b4b/AppIcon-0-0-1x_U007epad-0-11-0-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '587366035', name: 'Picsart', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/8e/de/11/8ede11eb-dd2f-a3e1-597f-de2e4a31fd30/AppIcon-0-0-1x_U007emarketing-0-8-0-sRGB-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1149994032', name: 'Facetune', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4d/64/92/4d64925f-a984-f0d3-fdea-e27e65799d93/AppIconLiquidGlass-0-0-1x_U007epad-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '409838725', name: 'Splice', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9d/f4/a0/9df4a04e-4e62-f2f5-0ce6-f8672dee6f7b/AppIcon-0-0-1x_U007epad-0-1-0-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '953286746', name: 'Darkroom', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/70/db/0d/70db0d10-66a7-7c89-1650-410e340dfc90/AppIcon-0-0-1x_U007epad-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '1062022008', name: 'LumaFusion', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a6/45/39/a64539ec-1521-9f96-fcd0-c7ac15a753ec/LumaFusionComposerIcon-0-1x_U007epad-0-1-0-0-85-220-0.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  { appStoreId: '878783582', name: 'Adobe Lightroom', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/57/65/07/57650728-13e2-a4ec-6ad2-54ac24660f2a/AppIcon-0-1x_U007ephone-0-1-0-0-85-220-0.png/512x512bb.jpg', category: 'Photo & Video', plansCount: 0 },
  // ─── 健康健身 ─────────────────────────────────────────────────
  { appStoreId: '571800810', name: 'Calm', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/64/57/c7/6457c7c6-a1c5-3700-e5f6-b7355e54b68e/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '426826309', name: 'Strava', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f3/ac/43/f3ac4387-5a6d-e8b8-cc58-3a3c4f521537/AppIcon-0-0-1x_U007ephone-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '493145008', name: 'Headspace', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4f/f0/e1/4ff0e121-e627-6b40-7535-bcd5c6329796/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '792750948', name: 'Peloton', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/5e/15/37/5e1537a5-6f60-1651-a2bb-363df4ec7849/peloton-white-0-0-1x_U007emarketing-0-8-0-sRGB-85-220.png/512x512bb.jpg', category: 'Health & Fitness', plansCount: 0 },
  { appStoreId: '341232718', name: 'MyFitnessPal', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/0e/8f/cc/0e8fcc7a-39ce-2c38-dcf6-a8dee4d12cf0/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Health & Fitness', plansCount: 0 },
  // ─── 学习教育 ─────────────────────────────────────────────────
  { appStoreId: '570060128', name: 'Duolingo', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/22/f8/8d/22f88d97-0776-74fe-6769-1851540ae0c8/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'Education', plansCount: 0 },
  { appStoreId: '435588892', name: 'Rosetta Stone', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ef/50/21/ef502101-299b-ba05-9241-d7d629cff024/AppIcon-1x_U007emarketing-0-8-0-85-220-0.png/512x512bb.jpg', category: 'Education', plansCount: 0 },
  { appStoreId: '829587759', name: 'Babbel', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b3/5f/3a/b35f3ad8-0ad2-936c-f6df-52f58abcd561/AppIcon-Default-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg', category: 'Education', plansCount: 0 },
  { appStoreId: '919087726', name: 'Photomath', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/0a/7f/46/0a7f4650-c4ad-91ed-a71c-388a3398839f/AppIcon-0-0-1x_U007emarketing-0-8-0-0-85-220.png/512x512bb.jpg', category: 'Education', plansCount: 0 },
  { appStoreId: '1084807225', name: 'LinkedIn Learning', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d5/fe/38/d5fe3833-b7ba-e2f0-222d-53ff99de3a49/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/512x512bb.jpg', category: 'Education', plansCount: 0 },
  // ─── VPN / 安全 ────────────────────────────────────────────────
  { appStoreId: '905953485', name: 'NordVPN', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/bf/10/71/bf107174-bc95-a950-1450-56212333fdb1/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Utilities', plansCount: 0 },
  { appStoreId: '886492891', name: 'ExpressVPN', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9b/cb/4c/9bcb4c59-e0f1-27fb-7306-62cce185be5e/AppIcon-0-1x_U007emarketing-0-8-0-85-220-0.png/512x512bb.jpg', category: 'Utilities', plansCount: 0 },
  { appStoreId: '1391782046', name: 'Surfshark', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/05/d4/58/05d4584e-5e45-b67d-87a5-41eb801c170e/iOS_AppIcon-0-0-1x_U007epad-0-0-0-1-0-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  { appStoreId: '1511601750', name: '1Password', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/39/e6/7b/39e67bdf-c912-f1f0-074a-539763003ddb/AppIcon-0-0-1x_U007epad-0-8-0-P3-85-220.png/512x512bb.jpg', category: 'Productivity', plansCount: 0 },
  // ─── 代理工具 ─────────────────────────────────────────────────
  { appStoreId: '1443988620', name: 'Quantumult X', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3b/51/ff/3b51ffee-5024-7b14-395b-768c5fe94b87/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Utilities', plansCount: 0 },
  { appStoreId: '1373567447', name: 'Loon', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1e/f0/a3/1ef0a326-8057-c21b-036b-ce67c73d642b/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Utilities', plansCount: 0 },
  { appStoreId: '932747118', name: 'Shadowrocket', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/0b/02/ca/0b02cadf-d5b7-aca7-c4f3-86e3f3bcc9d2/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Utilities', plansCount: 0 },
  { appStoreId: '1442620678', name: 'Surge 5', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/12/80/fd/1280fd46-c4da-3839-ef2d-d658115a50f4/AppIconS-0-0-1x_U007epad-0-1-0-0-85-220.png/512x512bb.jpg', category: 'Developer Tools', plansCount: 0 },
  // ─── 金融理财 ─────────────────────────────────────────────────
  { appStoreId: '1010865877', name: 'YNAB', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/0b/09/ef/0b09efb4-32fc-b5e1-2e08-1df2ccbf6713/AppIcon-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg', category: 'Finance', plansCount: 0 },
  { appStoreId: '938003185', name: 'Robinhood', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f0/18/5c/f0185c54-760d-743f-8a69-1c86af114832/AppIcon-0-0-1x_U007ephone-0-1-0-sRGB-85-220.png/512x512bb.jpg', category: 'Finance', plansCount: 0 },
  // ─── 新闻阅读 ─────────────────────────────────────────────────
  { appStoreId: '284862083', name: 'New York Times', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ab/13/04/ab13041f-c3c5-2d82-4225-db1eb4942143/Release-0-0-1x_U007epad-0-0-0-1-0-0-P3-85-220.png/512x512bb.jpg', category: 'News', plansCount: 0 },
  { appStoreId: '892355414', name: 'Inoreader', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/02/0d/2c/020d2cfe-8cca-7074-b11b-ae209c162df6/AppIcon-0-0-1x_U007emarketing-0-8-0-0-sRGB-85-220.png/512x512bb.jpg', category: 'News', plansCount: 0 },
  // ─── 生活出行 ─────────────────────────────────────────────────
  { appStoreId: '429047995', name: 'Pinterest', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/95/32/df/9532df9f-b41b-6d94-088d-1b927ab32d23/AppIcon-0-0-1x_U007epad-0-1-0-0-0-85-220.png/512x512bb.jpg', category: 'Lifestyle', plansCount: 0 },
  { appStoreId: '585027354', name: 'Google Maps', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/60/ea/a4/60eaa418-e34b-c2fc-c9b8-29c3e205a63c/maps_2025-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-0-0-85-220.png/512x512bb.jpg', category: 'Navigation', plansCount: 0 },
  { appStoreId: '719972451', name: 'DoorDash', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/75/f7/7b/75f77b09-b2d4-5962-9bf7-168191daae66/AppIcon-0-0-1x_U007ephone-0-1-sRGB-85-220.png/512x512bb.jpg', category: 'Food & Drink', plansCount: 0 },
  // ─── 游戏 ─────────────────────────────────────────────────────
  { appStoreId: '1053012308', name: 'Clash Royale', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1f/a2/1c/1fa21ca0-610d-b058-2cae-ea4a6d785c76/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/512x512bb.jpg', category: 'Games', plansCount: 0 },
  { appStoreId: '553834731', name: 'Candy Crush Saga', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/73/1a/b7/731ab722-f9bd-dde7-8e93-858e08e5a92a/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Games', plansCount: 0 },
  { appStoreId: '1094591345', name: 'Pokémon GO', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e6/5b/83/e65b83fd-b0f2-7b54-04d2-755d2a62ab98/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg', category: 'Games', plansCount: 0 },
  { appStoreId: '1517783697', name: 'Genshin Impact', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/5e/78/11/5e7811d5-4bd2-0108-19a3-0d413873da61/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg', category: 'Games', plansCount: 0 },
  { appStoreId: '479516143', name: 'Minecraft', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/22/d9/2d/22d92dca-ecec-60da-a0fc-df0d35040447/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/512x512bb.jpg', category: 'Games', plansCount: 0 },
]

