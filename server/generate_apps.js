import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * ============================================================
 * Youhu 全球订阅比价数据生成器 v2
 * ============================================================
 *
 * 数据来源：iTunes Lookup API（苹果官方，无需账号）
 * 接口格式：https://itunes.apple.com/lookup?id={appStoreId}&country={cc}&entity=inAppPurchase&limit=200
 *
 * 【如何添加新应用】
 * 1. 在 appList 中新增一条记录
 * 2. appStoreId 从 App Store 页面 URL 中获取（/id后面的数字）
 * 3. fallbackPlans 仅用于 App Store 没有 IAP 的应用（如 Netflix/Spotify 走 Web 订阅）
 * 4. 运行: node generate_apps.js
 * ============================================================
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
// 兑 CNY 汇率表（1 外币 = ? CNY）
// 更新周期：每季度或重大汇率变动时手动更新
// 基准日期：2026 Q1
// ============================================================
export const CNY_RATES = {
  USD: 7.24,
  EUR: 7.85,
  GBP: 9.12,
  JPY: 0.0478,
  KRW: 0.00520,
  AUD: 4.62,
  CAD: 5.15,
  SGD: 5.38,
  HKD: 0.930,
  TWD: 0.222,
  CNY: 1.00,
  INR: 0.0857,
  TRY: 0.153, // 从 0.213 暴跌至 0.153
  NGN: 0.00461,   // 1 NGN ≈ 0.0046 CNY (USD/NGN ≈ 1570)
  EGP: 0.144,     // USD/EGP ≈ 50.3
  ARS: 0.00724,   // USD/ARS ≈ 1000
  PKR: 0.0261,    // USD/PKR ≈ 278
  BDT: 0.0659,    // USD/BDT ≈ 110
  UAH: 0.174,     // USD/UAH ≈ 41.6
  VND: 0.000285,  // USD/VND ≈ 25400
  IDR: 0.000443,  // USD/IDR ≈ 16340
  PHP: 0.124,     // USD/PHP ≈ 58.3
  COP: 0.00176,   // USD/COP ≈ 4100
  KES: 0.0559,    // USD/KES ≈ 129.5
  RUB: 0.0824,    // USD/RUB ≈ 87.9
  BRL: 1.265,     // USD/BRL ≈ 5.72
  MXN: 0.355,     // USD/MXN ≈ 20.4
  THB: 0.211,     // USD/THB ≈ 34.3
  MYR: 1.639,     // USD/MYR ≈ 4.41
  ZAR: 0.386,     // USD/ZAR ≈ 18.75
  CLP: 0.00764,   // USD/CLP ≈ 948
  SAR: 1.931,     // USD/SAR ≈ 3.75
  AED: 1.972,     // USD/AED ≈ 3.67
}

// ============================================================
// App 列表
// appStoreId: App Store 页面 URL 中 /id 后面的数字
// fallbackPlans: 仅当 iTunes API 返回空 IAP 时启用（如走 Web 订阅的应用）
// ============================================================
export const appList = [
  // ============================
  // 1. AI 模型与前沿助手
  // ============================
  {
    id: 'chatgpt', name: 'ChatGPT', company: 'OpenAI', category: 'AI模型与前沿助手',
    appStoreId: '6448311069',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/df/e7/8a/dfe78ae8-cb35-b6d3-2fdb-b1b70d4fcb14/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: 'OpenAI 旗舰对话式 AI，支持文字、语音、图像多模态交互，全球用户量最大的生成式 AI 产品。',
    fallbackPlans: [
      { name: 'ChatGPT Plus 月付', priceUSD: 19.99 },
      { name: 'ChatGPT Plus 年付', priceUSD: 199.99 },
      { name: 'ChatGPT Pro 月付', priceUSD: 199.99 },
    ]
  },
  {
    id: 'claude', name: 'Claude', company: 'Anthropic', category: 'AI模型与前沿助手',
    appStoreId: '6473753684',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/bf/16/ab/bf16ab88-c7e6-79ba-b5d1-d2ed201a05cc/AppIcon-0-0-1x_U007emarketing-0-7-0-sRGB-85-220.png/230x0w.webp',
    description: '由 Anthropic 开发的安全优先 AI 助手，擅长长文分析、代码生成和深度推理。',
    fallbackPlans: [
      { name: 'Claude Pro 月付', priceUSD: 20 },
      { name: 'Claude Pro 年付', priceUSD: 216 },
      { name: 'Claude Max 5x 月付', priceUSD: 100 },
      { name: 'Claude Max 20x 月付', priceUSD: 200 },
    ]
  },
  {
    id: 'google-gemini', name: 'Google Gemini', company: 'Google LLC', category: 'AI模型与前沿助手',
    appStoreId: '6477489729',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e0/2b/81/e02b8100-8608-89ef-2f05-ad63ce22bc4e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'Google 推出的原生多模态 AI，深度集成 Google 生态，支持实时联网、代码执行和图片理解。',
    fallbackPlans: [
      { name: 'Gemini Advanced 月付', priceUSD: 19.99 },
    ]
  },
  {
    id: 'grok', name: 'Grok', company: 'xAI', category: 'AI模型与前沿助手',
    appStoreId: '6670324846',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/33/43/02/3343025c-462b-ebb4-8d90-6c4f81e88aa0/AppIcon-0-0-1x_U007ephone-0-5-85-220-0.png/230x0w.webp',
    description: '由 Elon Musk 创立的 xAI 打造，整合 X(Twitter) 实时数据流，以幽默风格回答问题。',
    fallbackPlans: [
      { name: 'SuperGrok 月付', priceUSD: 30 },
      { name: 'SuperGrok 年付', priceUSD: 300 },
    ]
  },
  {
    id: 'perplexity', name: 'Perplexity', company: 'Perplexity AI', category: 'AI模型与前沿助手',
    appStoreId: '1668000334',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/6f/31/4a/6f314a98-29c8-4588-2a03-9a3a1b90e498/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球最热门的 AI 搜索引擎，实时联网检索后以引用来源的方式给出精准答案。',
    fallbackPlans: [
      { name: 'Perplexity Pro 月付', priceUSD: 20 },
      { name: 'Perplexity Pro 年付', priceUSD: 200 },
    ]
  },
  {
    id: 'poe', name: 'Poe', company: 'Quora, Inc.', category: 'AI模型与前沿助手',
    appStoreId: '1640745955',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/4b/7e/81/4b7e8121-39dc-3834-2f56-657e3a52dca7/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'Quora 推出的多模型聚合平台，一个订阅即可使用 GPT-4、Claude、Gemini 等主流大模型。',
    fallbackPlans: [
      { name: 'Poe 月付', priceUSD: 19.99 },
      { name: 'Poe 年付', priceUSD: 199.99 },
    ]
  },
  {
    id: 'github-copilot', name: 'GitHub Copilot', company: 'GitHub / Microsoft', category: 'AI模型与前沿助手',
    appStoreId: '1477376905',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple116/v4/7d/3c/69/7d3c6979-4a93-19a7-a0c8-cd00cb7e4947/AppIcon-0-0-1x_U007emarketing-0-4-0-0-85-220-0.png/230x0w.webp',
    description: '面向开发者的 AI 编程助手，提供代码补全、解释和重构建议，支持 VS Code 等主流 IDE。',
    fallbackPlans: [
      { name: 'Copilot Individual 月付', priceUSD: 10 },
      { name: 'Copilot Individual 年付', priceUSD: 100 },
    ]
  },
  {
    id: 'monica', name: 'Monica', company: 'Monica AI', category: 'AI模型与前沿助手',
    appStoreId: '6450770590',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/98/ec/bc/98ecbcd5-96cc-fcca-a4a2-fdfbe02d44f1/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '跨平台 AI 浏览器助手，集成 GPT-4 等模型，支持翻译、写作、摘要等多场景。',
    fallbackPlans: [
      { name: 'Monica Pro 月付', priceUSD: 9.9 },
      { name: 'Monica Pro 年付', priceUSD: 99.9 },
    ]
  },

  // ============================
  // 2. 影视与音乐流媒体
  // ============================
  {
    id: 'youtube', name: 'YouTube', company: 'Google LLC', category: '影视与音乐流媒体',
    appStoreId: '544007664',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b0/b6/c1/b0b6c1e8-1f66-e48b-6aeb-c103e4587cf1/logo_youtube_color-0-0-1x_U007emarketing-0-6-0-85-220.png/230x0w.webp',
    description: '全球最大的视频平台。Premium 订阅可去广告、后台播放、离线下载并包含 YouTube Music。',
    fallbackPlans: [
      { name: 'YouTube Premium 个人月付', priceUSD: 13.99 },
      { name: 'YouTube Premium 家庭月付', priceUSD: 22.99 },
      { name: 'YouTube Premium 学生月付', priceUSD: 7.99 },
    ]
  },
  {
    id: 'spotify', name: 'Spotify', company: 'Spotify AB', category: '影视与音乐流媒体',
    appStoreId: '324684580',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/1b/e8/ea/1be8eaca-253c-4a26-4cf5-2bbb93365e00/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '全球领先的音乐与播客流媒体，拥有超一亿首歌曲和五百万档播客。',
    fallbackPlans: [
      { name: 'Spotify Individual 月付', priceUSD: 11.99 },
      { name: 'Spotify Duo 月付', priceUSD: 16.99 },
      { name: 'Spotify Family 月付', priceUSD: 19.99 },
      { name: 'Spotify Student 月付', priceUSD: 5.99 },
    ]
  },
  {
    id: 'netflix', name: 'Netflix', company: 'Netflix, Inc.', category: '影视与音乐流媒体',
    appStoreId: '363590051',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/bc/14/ac/bc14acf0-ab60-2285-9f40-d5e9e2905a1e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '全球最大的订阅制视频流媒体平台，拥有大量原创影视剧集。',
    fallbackPlans: [
      { name: 'Netflix 含广告 月付', priceUSD: 6.99 },
      { name: 'Netflix 标准 月付', priceUSD: 15.49 },
      { name: 'Netflix 高级 月付', priceUSD: 22.99 },
    ]
  },
  {
    id: 'disney-plus', name: 'Disney+', company: 'Disney', category: '影视与音乐流媒体',
    appStoreId: '1446075923',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e3/11/03/e3110397-0e41-7c83-981a-2a9b5e0d0241/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '迪士尼官方流媒体，汇集漫威、星球大战、皮克斯等独家内容。',
    fallbackPlans: [
      { name: 'Disney+ 含广告 月付', priceUSD: 7.99 },
      { name: 'Disney+ 无广告 月付', priceUSD: 13.99 },
      { name: 'Disney+ 无广告 年付', priceUSD: 139.99 },
    ]
  },
  {
    id: 'hbo-max', name: 'Max (HBO)', company: 'Warner Bros.', category: '影视与音乐流媒体',
    appStoreId: '1666653815',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ab/00/82/ab008226-a4f3-c093-0e50-42ec0738be84/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'HBO 经典剧集聚集地，提供权游、白莲花等独占美剧。',
    fallbackPlans: [
      { name: 'Max 含广告 月付', priceUSD: 9.99 },
      { name: 'Max 无广告 月付', priceUSD: 15.99 },
      { name: 'Max Ultimate 月付', priceUSD: 19.99 },
    ]
  },
  {
    id: 'apple-music', name: 'Apple Music', company: 'Apple Inc.', category: '影视与音乐流媒体',
    appStoreId: '1108187390',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9a/e5/72/9ae572d7-3ddf-c3f5-2c9b-7130e30e2066/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'Apple 官方音乐流媒体，超一亿首无损音质歌曲，支持空间音频和歌词同步。',
    fallbackPlans: [
      { name: 'Apple Music 学生 月付', priceUSD: 5.99 },
      { name: 'Apple Music 个人 月付', priceUSD: 10.99 },
      { name: 'Apple Music 家庭 月付', priceUSD: 16.99 },
    ]
  },
  {
    id: 'crunchyroll', name: 'Crunchyroll', company: 'Crunchyroll, LLC', category: '影视与音乐流媒体',
    appStoreId: '329913454',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/bb/73/a4/bb73a4cf-1f4e-1a23-81b7-36c8cf0e10d4/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '海外最大的正版动漫流媒体，拥有上千部日本动画的独家同步播放权。',
    fallbackPlans: [
      { name: 'Fan 月付', priceUSD: 7.99 },
      { name: 'Mega Fan 月付', priceUSD: 9.99 },
      { name: 'Ultimate Fan 月付', priceUSD: 14.99 },
    ]
  },

  // ============================
  // 3. 创作与设计编辑
  // ============================
  {
    id: 'canva', name: 'Canva', company: 'Canva Pty Ltd', category: '创作与设计编辑',
    appStoreId: '897446215',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ff/73/aa/ff73aa17-e7dd-e6b5-cf26-0a0d0a9ba823/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球最流行的在线设计工具，提供海量模板，让非设计师也能快速产出专业级视觉内容。',
    fallbackPlans: [
      { name: 'Canva Pro 月付', priceUSD: 14.99 },
      { name: 'Canva Pro 年付', priceUSD: 119.99 },
    ]
  },
  {
    id: 'adobe-lightroom', name: 'Adobe Lightroom', company: 'Adobe Inc.', category: '创作与设计编辑',
    appStoreId: '878783582',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/20/ef/2d/20ef2dbc-2c7f-fc8a-bda9-63fba3797970/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: 'Adobe 专业级照片编辑与调色工具，云端同步、AI 修图、RAW 支持。',
    fallbackPlans: [
      { name: 'Lightroom 月付', priceUSD: 9.99 },
      { name: 'Photography Plan 月付', priceUSD: 9.99 },
    ]
  },
  {
    id: 'capcut', name: 'CapCut 剪映', company: 'Bytedance', category: '创作与设计编辑',
    appStoreId: '1500855883',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/06/97/36/06973681-5c84-9c19-cc80-a8dac5959f93/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '字节跳动旗下视频剪辑神器，提供大量特效、滤镜及 AI 功能，短视频创作首选。',
    fallbackPlans: [
      { name: 'CapCut Pro 月付', priceUSD: 7.99 },
      { name: 'CapCut Pro 年付', priceUSD: 74.99 },
    ]
  },
  {
    id: 'vsco', name: 'VSCO', company: 'Visual Supply Company', category: '创作与设计编辑',
    appStoreId: '588013838',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2b/08/29/2b0829ef-d8f2-0a0d-e9e2-aa5b2b5a1985/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '以胶片风格滤镜闻名的摄影编辑社区，拥有 200+ 专业预设。',
    fallbackPlans: [
      { name: 'VSCO Plus 月付', priceUSD: 7.99 },
      { name: 'VSCO Plus 年付', priceUSD: 29.99 },
      { name: 'VSCO Pro 年付', priceUSD: 59.99 },
    ]
  },
  {
    id: 'picsart', name: 'Picsart', company: 'PicsArt, Inc.', category: '创作与设计编辑',
    appStoreId: '587366035',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/25/43/5b/25435b7e-1d3b-d3be-e3d2-e53f3ada3e66/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '集 AI 修图、视频剪辑、拼贴设计于一体的全能创作平台，月活超 1.5 亿。',
    fallbackPlans: [
      { name: 'Picsart Gold 月付', priceUSD: 13.99 },
      { name: 'Picsart Gold 年付', priceUSD: 55.99 },
    ]
  },

  // ============================
  // 4. 学习与效率笔记
  // ============================
  {
    id: 'notion', name: 'Notion', company: 'Notion Labs', category: '学习与效率笔记',
    appStoreId: '1232780281',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/d7/13/21/d713213b-a3c1-a643-b8cb-62b4144cbcff/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '融合文档、知识库、项目管理和 AI 助手的全能工作空间，被广泛用于团队协作与个人知识管理。',
    fallbackPlans: [
      { name: 'Notion Plus 月付', priceUSD: 12 },
      { name: 'Notion Plus 年付', priceUSD: 96 },
      { name: 'Notion AI 附加 月付', priceUSD: 10 },
    ]
  },
  {
    id: 'microsoft-365', name: 'Microsoft 365', company: 'Microsoft', category: '学习与效率笔记',
    appStoreId: '541164041',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/24/a0/52/24a0525f-0785-7b99-4b8c-ebae4effc01e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'Word/Excel/PPT 全家桶 + 1TB OneDrive 云空间，办公刚需。',
    fallbackPlans: [
      { name: 'Microsoft 365 个人版 月付', priceUSD: 6.99 },
      { name: 'Microsoft 365 个人版 年付', priceUSD: 69.99 },
      { name: 'Microsoft 365 家庭版 年付', priceUSD: 99.99 },
    ]
  },
  {
    id: 'goodnotes', name: 'Goodnotes 6', company: 'Time Base Technology', category: '学习与效率笔记',
    appStoreId: '1444383602',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ed/e8/62/ede862e0-dd56-6aff-ccfe-f51f5b23a8a2/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: 'iPad 手写笔记首选，支持 AI 手写识别、PDF 标注和多设备同步。',
    fallbackPlans: [
      { name: 'Goodnotes 年付', priceUSD: 9.99 },
      { name: 'Goodnotes 买断', priceUSD: 29.99 },
    ]
  },
  {
    id: 'notability', name: 'Notability', company: 'Ginger Labs', category: '学习与效率笔记',
    appStoreId: '360593530',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/47/26/56/472656d1-fb26-a76e-05f1-bb1f4dd30fca/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '同步录音+手写笔记的经典 iPad 应用，课堂笔记和会议记录神器。',
    fallbackPlans: [
      { name: 'Notability Plus 年付', priceUSD: 14.99 },
    ]
  },
  {
    id: 'duolingo', name: 'Duolingo', company: 'Duolingo', category: '学习与效率笔记',
    appStoreId: '570060128',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/d8/56/bf/d856bff5-c674-e5b0-7dfa-a8dd24057834/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '全球最受欢迎的游戏化语言学习平台，支持 40+ 种语言，寓教于乐。',
    fallbackPlans: [
      { name: 'Super Duolingo 月付', priceUSD: 12.99 },
      { name: 'Super Duolingo 年付', priceUSD: 83.99 },
      { name: 'Duolingo Max 月付', priceUSD: 29.99 },
    ]
  },
  {
    id: 'evernote', name: 'Evernote', company: 'Bending Spoons', category: '学习与效率笔记',
    appStoreId: '281796108',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/5e/48/c1/5e48c183-e389-aa85-a34f-97e8f83e54eb/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '老牌笔记应用，强大的网页剪藏和全文搜索功能，适合信息收集与知识归档。',
    fallbackPlans: [
      { name: 'Evernote Personal 月付', priceUSD: 14.99 },
      { name: 'Evernote Personal 年付', priceUSD: 129.99 },
    ]
  },
  {
    id: 'xmind', name: 'Xmind', company: 'Xmind Ltd.', category: '学习与效率笔记',
    appStoreId: '1286983622',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/78/2a/25/782a2544-1c32-e3c3-2e24-6be95bfb3a5c/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '跨平台思维导图工具，支持多种布局和主题风格，适合头脑风暴与项目规划。',
    fallbackPlans: [
      { name: 'Xmind Pro 半年付', priceUSD: 39.99 },
      { name: 'Xmind Pro 年付', priceUSD: 59.99 },
    ]
  },

  // ============================
  // 5. 健康与运动生活
  // ============================
  {
    id: 'strava', name: 'Strava', company: 'Strava, Inc.', category: '健康与运动生活',
    appStoreId: '426826309',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/11/c0/b8/11c0b8b7-6bff-0a18-b6d0-3d85979c55e1/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '跑步与骑行爱好者的社交运动平台，GPS 轨迹记录、训练分析与排行榜。',
    fallbackPlans: [
      { name: 'Strava 月付', priceUSD: 11.99 },
      { name: 'Strava 年付', priceUSD: 79.99 },
    ]
  },
  {
    id: 'headspace', name: 'Headspace', company: 'Headspace Inc.', category: '健康与运动生活',
    appStoreId: '493145008',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b1/e7/61/b1e7613b-31e7-ea2f-9fd8-a3f4dd2fdc05/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球领先的冥想与睡眠应用，提供引导式冥想、专注音乐和睡眠故事。',
    fallbackPlans: [
      { name: 'Headspace 月付', priceUSD: 12.99 },
      { name: 'Headspace 年付', priceUSD: 69.99 },
    ]
  },
  {
    id: 'calm', name: 'Calm', company: 'Calm.com, Inc.', category: '健康与运动生活',
    appStoreId: '571800810',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/79/4d/12/794d12d8-7c25-d2c9-ce23-ed2c9d34c1e5/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '与 Headspace 齐名的冥想健康应用，以优美的自然风景和名人朗读的睡前故事闻名。',
    fallbackPlans: [
      { name: 'Calm Premium 月付', priceUSD: 14.99 },
      { name: 'Calm Premium 年付', priceUSD: 69.99 },
    ]
  },
  {
    id: 'flo', name: 'Flo', company: 'Flo Health Inc.', category: '健康与运动生活',
    appStoreId: '1038369065',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/01/1a/9e/011a9e55-aaf7-aeca-aea1-e62192a0c9f1/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '全球最受欢迎的女性健康与经期追踪应用，提供 AI 健康洞察和助孕/避孕建议。',
    fallbackPlans: [
      { name: 'Flo Premium 月付', priceUSD: 9.99 },
      { name: 'Flo Premium 年付', priceUSD: 49.99 },
    ]
  },

  // ============================
  // 6. 社交网络与约会
  // ============================
  {
    id: 'x', name: 'X (Twitter)', company: 'X Corp.', category: '社交网络与约会',
    appStoreId: '333903271',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/48/17/f9/4817f916-4430-7abe-ca72-97804f823e0e/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球最大的实时社交媒体，Premium 订阅可获蓝标认证、更长推文和 Grok AI 助手。',
    fallbackPlans: [
      { name: 'X Premium Basic 月付', priceUSD: 3 },
      { name: 'X Premium 月付', priceUSD: 8 },
      { name: 'X Premium+ 月付', priceUSD: 16 },
    ]
  },
  {
    id: 'tinder', name: 'Tinder', company: 'Match Group', category: '社交网络与约会',
    appStoreId: '547702041',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/33/82/09/33820952-08fa-5d84-13c9-f2cbe56f3d47/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '全球用户量最大的交友约会应用，以左滑右滑机制革命化了移动社交。',
    fallbackPlans: [
      { name: 'Tinder+ 月付', priceUSD: 9.99 },
      { name: 'Tinder Gold 月付', priceUSD: 24.99 },
      { name: 'Tinder Platinum 月付', priceUSD: 29.99 },
    ]
  },
  {
    id: 'bumble', name: 'Bumble', company: 'Bumble Inc.', category: '社交网络与约会',
    appStoreId: '930441707',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/48/55/c5/4855c5ea-0e5a-b2ff-8e60-aa21a79d6aad/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '女性优先的社交平台，涵盖约会、交友和职场社交，第二大交友应用。',
    fallbackPlans: [
      { name: 'Bumble Premium 周付', priceUSD: 14.99 },
      { name: 'Bumble Premium 月付', priceUSD: 39.99 },
    ]
  },
  {
    id: 'discord', name: 'Discord', company: 'Discord Inc.', category: '社交网络与约会',
    appStoreId: '985746746',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/6c/02/10/6c021037-fe28-f786-e497-5dbdfc498834/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '游戏玩家与社区创作者的语音社交平台，Nitro 提供高清视频、大文件上传和自定义表情。',
    fallbackPlans: [
      { name: 'Nitro Basic 月付', priceUSD: 2.99 },
      { name: 'Nitro 月付', priceUSD: 9.99 },
      { name: 'Nitro 年付', priceUSD: 99.99 },
    ]
  },
  {
    id: 'snapchat', name: 'Snapchat', company: 'Snap Inc.', category: '社交网络与约会',
    appStoreId: '447188370',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/35/a8/d5/35a8d5eb-a7a7-03df-e55c-8e9f5e81f929/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '欧美年轻人最爱的阅后即焚社交应用，Snapchat+ 提供专属功能和优先体验。',
    fallbackPlans: [
      { name: 'Snapchat+ 月付', priceUSD: 3.99 },
      { name: 'Snapchat+ 年付', priceUSD: 29.99 },
    ]
  },
  {
    id: 'telegram', name: 'Telegram', company: 'Telegram FZ-LLC', category: '社交网络与约会',
    appStoreId: '686449807',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/04/6e/33/046e3338-94db-e7b6-2805-e498e0620a79/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '注重隐私与速度的跨平台即时通讯应用，Premium 提供 4GB 文件上传、表情和翻译功能。',
    fallbackPlans: [
      { name: 'Telegram Premium 月付', priceUSD: 4.99 },
      { name: 'Telegram Premium 年付', priceUSD: 35.99 },
    ]
  },

  // ============================
  // 7. 工具与信息安全
  // ============================
  {
    id: 'expressvpn', name: 'ExpressVPN', company: 'Express Technologies', category: '工具与信息安全',
    appStoreId: '886492891',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/af/61/ac/af61acac-7ca6-4f3b-2d8c-f5daa27abcbd/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球知名度最高的 VPN 服务之一，支持 105 个国家/地区、极速连接。',
    fallbackPlans: [
      { name: 'ExpressVPN 月付', priceUSD: 12.95 },
      { name: 'ExpressVPN 半年付', priceUSD: 59.95 },
      { name: 'ExpressVPN 年付', priceUSD: 99.95 },
    ]
  },
  {
    id: 'nordvpn', name: 'NordVPN', company: 'Nord Security', category: '工具与信息安全',
    appStoreId: '905953485',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/e3/58/c4/e358c4c9-5a6e-5ee3-5024-7ba5fec8c5f2/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '全球用户量最大的 VPN 之一，以双重加密和暗网监控功能著称。',
    fallbackPlans: [
      { name: 'NordVPN 月付', priceUSD: 12.99 },
      { name: 'NordVPN 年付', priceUSD: 59.88 },
      { name: 'NordVPN 两年付', priceUSD: 83.76 },
    ]
  },
  {
    id: '1password', name: '1Password', company: 'AgileBits Inc.', category: '工具与信息安全',
    appStoreId: '1511601750',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/aa/3e/0c/aa3e0ccf-c203-8e34-69d8-1789c9d40554/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '企业级密码管理器，安全存储密码、信用卡和敏感文档，支持跨设备无缝同步。',
    fallbackPlans: [
      { name: '1Password 个人 月付', priceUSD: 2.99 },
      { name: '1Password 家庭 月付', priceUSD: 4.99 },
      { name: '1Password 个人 年付', priceUSD: 35.88 },
    ]
  },
  {
    id: 'surge-5', name: 'Surge 5', company: 'Surge Networks', category: '工具与信息安全',
    appStoreId: '1442620678',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple116/v4/82/09/38/82093893-4e40-aa2a-3c3c-4ddc9b7076e3/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: 'iOS/macOS 高级网络调试工具，支持 HTTP 抓包、MitM 和策略分流。',
    fallbackPlans: [
      { name: 'Surge iOS Pro 年付', priceUSD: 14.99 },
    ]
  },
  {
    id: 'loon', name: 'Loon', company: 'Loon Network', category: '工具与信息安全',
    appStoreId: '1373567447',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/c3/42/33/c34233ed-bd63-1edd-970b-3cc0f0d2b52d/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/230x0w.webp',
    description: '与 Surge 齐名的 iOS 网络代理工具，以简洁配置和高性能著称。',
    fallbackPlans: [
      { name: 'Loon Plugin 年付', priceUSD: 4.99 },
    ]
  },

  // ============================
  // 8. 生态与云盘服务
  // ============================
  {
    id: 'apple-one', name: 'Apple One', company: 'Apple Inc.', category: '生态与云盘服务',
    appStoreId: '1508480621',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9a/e5/72/9ae572d7-3ddf-c3f5-2c9b-7130e30e2066/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '苹果全家桶订阅包，整合 Apple Music、TV+、Arcade、iCloud+ 等服务，按人数分三档。',
    fallbackPlans: [
      { name: 'Apple One 个人 月付', priceUSD: 19.95 },
      { name: 'Apple One 家庭 月付', priceUSD: 25.95 },
      { name: 'Apple One 高级 月付', priceUSD: 37.95 },
    ]
  },
  {
    id: 'icloud', name: 'iCloud+', company: 'Apple Inc.', category: '生态与云盘服务',
    appStoreId: '1447513498',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/79/b4/b4/79b4b441-09cd-a400-4039-e2e70ddde803/AppIcon-0-0-1x_U007emarketing-0-5-0-85-220.png/230x0w.webp',
    description: 'Apple 官方云存储服务，支持 iCloud 私密中继、自定邮件域名和 HomeKit 安全视频。',
    fallbackPlans: [
      { name: 'iCloud+ 50GB 月付', priceUSD: 0.99 },
      { name: 'iCloud+ 200GB 月付', priceUSD: 2.99 },
      { name: 'iCloud+ 2TB 月付', priceUSD: 9.99 },
      { name: 'iCloud+ 6TB 月付', priceUSD: 29.99 },
      { name: 'iCloud+ 12TB 月付', priceUSD: 59.99 },
    ]
  },
  {
    id: 'google-one', name: 'Google One', company: 'Google LLC', category: '生态与云盘服务',
    appStoreId: '1486498959',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/18/85/f5/1885f527-bc19-e444-3a26-fa3e6ca58ec0/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: 'Google 云存储+AI Premium，高级版包含 Gemini Advanced 和 2TB 空间。',
    fallbackPlans: [
      { name: 'Google One 100GB 月付', priceUSD: 1.99 },
      { name: 'Google One 2TB 月付', priceUSD: 9.99 },
      { name: 'Google One AI Premium 月付', priceUSD: 19.99 },
    ]
  },
  {
    id: 'dropbox', name: 'Dropbox', company: 'Dropbox, Inc.', category: '生态与云盘服务',
    appStoreId: '327630330',
    icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/65/3e/15/653e157d-3ab5-d8c9-e14e-d40fe4f2a233/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220-0.png/230x0w.webp',
    description: '老牌云同步盘，以可靠的文件同步和版本历史著称，支持跨平台协作。',
    fallbackPlans: [
      { name: 'Dropbox Plus 月付', priceUSD: 11.99 },
      { name: 'Dropbox Plus 年付', priceUSD: 119.88 },
      { name: 'Dropbox Professional 月付', priceUSD: 24.99 },
    ]
  },
]

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

/**
 * 判断是否为消耗型 IAP（充值包、代币等），应过滤掉
 */
function isConsumable(name) {
  const lower = name.toLowerCase()
  // 带数量括号的，如 "Barrel of Gems (1200)"
  if (/\(\d+\)/.test(name)) return true
  // 含消耗型关键词
  if (CONSUMABLE_KEYWORDS.some(k => lower.includes(k))) return true
  return false
}

/**
 * 从 App Store HTML 页面提取 IAP 列表
 * 返回 [{name, price, rawPrice}, ...] 或 null
 *
 * 数据格式来自页面内的 JSON 数据块：
 * {"$kind":"textPair","leadingText":"Super Duolingo","trailingText":"$12.99"}
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

    // 解析 textPair JSON 对象（App Store 页面内嵌格式）
    const regex = /\{"\$kind":"textPair","leadingText":"([^"]+)","trailingText":"([^"]+)"\}/g
    let m
    const rawPairs = []
    while ((m = regex.exec(html)) !== null) {
      rawPairs.push({ name: m[1], priceStr: m[2] })
    }

    if (rawPairs.length === 0) return null

    // 只保留：价格字符串看起来是货币（非 "Free", "4+", 版本号等）
    const pricePattern = /^[\$£€¥₺₹₦₩฿₫₴₱﹩R]|^\d{1,3}[,.\s]\d{2}/
    const filtered = rawPairs
      .filter(p => pricePattern.test(p.priceStr))
      .filter(p => !isConsumable(p.name))

    if (filtered.length === 0) return null

    /**
     * 解析格式化价格字符串 → { val: 数值, currency: 货币代码|null }
     * 处理多种格式：$12.99 · ₺1.234,56 · ₹ 1,999 · 4.999.000đ · Rp 349ribu · 22,99 USD
     */
    function parsePriceString(str) {
      let s = str.trim()
      let currency = null

      // ── 前缀货币符号检测 ──────────────────────────────────────
      const PREFIX = [
        [/^HK\$\s*/i,  'HKD'], [/^NT\$\s*/i,  'TWD'], [/^NZ\$\s*/i, 'NZD'],
        [/^AU?\$\s*/i, 'AUD'], [/^CA?\$\s*/i, 'CAD'], [/^S\$\s*/i,  'SGD'],
        [/^\$\s*/,     'USD'], [/^£\s*/,      'GBP'], [/^€\s*/,     'EUR'],
        [/^₺\s*/,      'TRY'], [/^₹\s*/,      'INR'], [/^₦\s*/,     'NGN'],
        [/^₩\s*/,      'KRW'], [/^฿\s*/,      'THB'], [/^₴\s*/,     'UAH'],
        [/^₱\s*/,      'PHP'], [/^R\$\s*/,    'BRL'], [/^Rp\s*/i,   'IDR'],
        [/^RM\s*/i,    'MYR'], [/^R\s+(?=\d)/,'ZAR'], [/^¥\s*/,     'JPY'],
        [/^﹩\s*/,     'USD'],
      ]
      for (const [re, code] of PREFIX) {
        if (re.test(s)) { currency = code; s = s.replace(re, ''); break }
      }

      // ── 后缀货币单位检测（未被前缀命中时）──────────────────────
      if (!currency) {
        if (/[₫đ]\s*$/.test(s))        { currency = 'VND'; s = s.replace(/[₫đ\s]+$/, '') }
        else if (/\bUSD\s*$/.test(s))   { currency = 'USD'; s = s.replace(/\s*USD\s*$/, '') }
        else if (/\bEUR\s*$/.test(s))   { currency = 'EUR'; s = s.replace(/\s*EUR\s*$/, '') }
        else if (/\bGBP\s*$/.test(s))   { currency = 'GBP'; s = s.replace(/\s*GBP\s*$/, '') }
      }

      s = s.trim()

      // ── 印尼语单位：ribu(千) / juta(百万) ───────────────────────
      const ribu = s.match(/^([\d.,]+)\s*ribu\s*$/i)
      if (ribu) {
        return { val: (parseFloat(ribu[1].replace(/\./g, '').replace(',', '.')) || 0) * 1000, currency: currency || 'IDR' }
      }
      const juta = s.match(/^([\d.,]+)\s*juta\s*$/i)
      if (juta) {
        return { val: (parseFloat(juta[1].replace(/\./g, '').replace(',', '.')) || 0) * 1000000, currency: currency || 'IDR' }
      }

      // ── 去掉末尾非数字字符 ───────────────────────────────────────
      s = s.replace(/[^\d.,]+$/, '').trim()

      let val = 0
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
        // 欧式千位点 + 逗号小数：1.234,56 / 4.999.000
        val = parseFloat(s.replace(/\./g, '').replace(',', '.'))
      } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
        // 英式千位逗号：1,234.56 / 1,234,567
        val = parseFloat(s.replace(/,/g, ''))
      } else if (/^\d[\d ]*,\d{1,2}$/.test(s)) {
        // 空格千位 + 逗号小数：1 234,99 / 22,99
        val = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
      } else {
        val = parseFloat(s.replace(/,/g, '')) || 0
      }

      return { val, currency }
    }

    // 对同名套餐：取所有出现的价格，按价值排序后去重（保留唯一价格点）
    const nameGroups = {}
    for (const p of filtered) {
      if (!nameGroups[p.name]) nameGroups[p.name] = []
      const { val, currency } = parsePriceString(p.priceStr)
      if (val > 0 && !nameGroups[p.name].some(x => Math.abs(x.val - val) < 0.01)) {
        nameGroups[p.name].push({ priceStr: p.priceStr, val, currency })
      }
    }

    // 构建最终 IAP 列表：每个名称按价格升序排列（cheapest first）
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

// ============================================================
// 用 fallback 手动数据生成价格（仅限无 App Store IAP 的应用）
// ============================================================
export function buildFallbackPrices(fallbackPlans) {
  const plans = []
  const prices = {}

  for (const p of fallbackPlans) {
    plans.push(p.name)
    const baseCny = p.priceUSD * CNY_RATES.USD
    const regionPrices = []

    // 为每个目标国家/地区生成估算价格（基于 USD 基准 + 当地汇率换算）
    for (const c of COUNTRIES) {
      const rate = CNY_RATES[c.currency]
      if (!rate) continue

      // 从 CNY 反算当地货币金额
      const localAmount = baseCny / rate
      let originalStr
      if (c.currency === 'CNY') {
        originalStr = `¥${localAmount.toFixed(2)}`
      } else if (localAmount > 1000) {
        originalStr = `${c.currency} ${localAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      } else {
        originalStr = `${c.currency} ${localAmount.toFixed(2)}`
      }

      regionPrices.push({
        region: c.name,
        flag: c.flag,
        original: originalStr,
        cny: parseFloat(baseCny.toFixed(2)),
        estimated: true,
      })
    }

    // 按 CNY 价格排序（对于 fallback 而言所有地区都相同，所以主要看地区名排序）
    regionPrices.sort((a, b) => a.cny - b.cny)
    prices[p.name] = regionPrices
  }
  return { plans, prices }
}

export function getCatalogAppByStoreId(appStoreId) {
  return appList.find(app => String(app.appStoreId) === String(appStoreId)) || null
}

// ============================================================
// 核心：抓取单个 App 的真实多国 IAP 价格
// ============================================================
export async function scrapeApp(app) {
  const QUICK_MODE = process.env.QUICK === '1'
  const targetCountries = QUICK_MODE
    ? COUNTRIES.filter(c => ['us', 'ng', 'tr', 'in', 'gb', 'jp', 'cn'].includes(c.code))
    : COUNTRIES

  // 1. 先抓美区作为 canonical 基准
  console.log(`  → 抓取美区基准...`)
  const usIAPs = await fetchPageIAPs(app.appStoreId, 'us')
  
  // 补充：从 iTunes Lookup 抓取真实高清 Icon 替换掉本地破损/写死的 Icon
  try {
    const itunesUrl = `https://itunes.apple.com/lookup?id=${app.appStoreId}`
    const itunesRes = await fetch(itunesUrl).then(r => r.json())
    if (itunesRes.results && itunesRes.results[0]) {
      app.icon = itunesRes.results[0].artworkUrl512 || itunesRes.results[0].artworkUrl100 || app.icon
    }
  } catch (e) {}

  if (!usIAPs) {
    if (app.fallbackPlans && app.fallbackPlans.length > 0) {
      console.log(`  ⚠️  美区页面无 IAP，使用 fallback 手动估算数据 (Web 订阅)`)
      return buildFallbackPrices(app.fallbackPlans)
    } else {
      console.log(`  ⚠️  美区页面无 IAP 且无 fallback 数据，跳过该应用`)
      return null
    }
  }

  console.log(`  ✓ 美区发现 ${usIAPs.length} 个订阅项`)

  // 2. 建立 canonical plan 结构
  // 同名套餐出现多次时（不同周期），加序号区分：「Super Duolingo」「Super Duolingo (2)」
  const nameCount = {}
  const canonicalPlans = []   // [{key, name, usVal}, ...]

  for (const iap of usIAPs) {
    nameCount[iap.name] = (nameCount[iap.name] || 0) + 1
    const isDup = usIAPs.filter(x => x.name === iap.name).length > 1
    const key = isDup ? `${iap.name} (${iap.priceStr})` : iap.name
    canonicalPlans.push({ key, name: iap.name, usVal: iap.val })
  }

  const plans = canonicalPlans.map(p => p.key)
  const prices = {}
  for (const p of canonicalPlans) {
    const usIAP = usIAPs.find(x => x.name === p.name && Math.abs(x.val - p.usVal) < 0.01)
    const usRate = CNY_RATES[usIAP?.currency] || CNY_RATES.USD
    prices[p.key] = [{
      region: '美国',
      flag: '🇺🇸',
      original: usIAP?.priceStr || `$${p.usVal}`,
      cny: parseFloat((p.usVal * usRate).toFixed(2)),
    }]
  }

  // 3. 遍历其余国家
  const otherCountries = targetCountries.filter(c => c.code !== 'us')
  let found = 0, missing = 0

  // 简单的并发批处理，每次 5 个国家，避免过猛被封
  const concurrency = 5
  for (let i = 0; i < otherCountries.length; i += concurrency) {
    const batch = otherCountries.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(async (c) => {
      // 在同一批次内错开请求，避免瞬间激增
      await sleep(Math.random() * (QUICK_MODE ? 500 : 1000))
      const iaps = await fetchPageIAPs(app.appStoreId, c.code)
      return { c, iaps }
    }))

    for (const { c, iaps } of results) {
      if (!iaps) {
        missing++
        continue
      }

      // 按名称分组，按价格升序
      const countryByName = {}
      for (const iap of iaps) {
        if (!countryByName[iap.name]) countryByName[iap.name] = []
        countryByName[iap.name].push(iap)
      }

      // 匹配：canonical 计划按 name + 价格排序索引 匹配
      let matched = 0
      for (const cp of canonicalPlans) {
        const group = countryByName[cp.name]
        if (!group || group.length === 0) continue

        // 找到在 US 原始列表中该 name 出现的序号（0-based）
        const usGroup = usIAPs.filter(x => x.name === cp.name)
        const posInGroup = usGroup.findIndex(x => Math.abs(x.val - cp.usVal) < 0.01)

        // 对应位置的本地 IAP（如果该国此周期没有，就跳过）
        const localIAP = group[posInGroup] || group[group.length - 1]
        if (!localIAP) continue

        // 汇率：优先用价格字符串中检测到的货币，其次用国家默认货币
        const detectedCurrency = localIAP.currency
        const rate = CNY_RATES[detectedCurrency] || CNY_RATES[c.currency]
        if (!rate) continue

        prices[cp.key].push({
          region: c.name,
          flag: c.flag,
          original: localIAP.priceStr,
          cny: parseFloat((localIAP.val * rate).toFixed(2)),
        })
        matched++
      }

      if (matched > 0) found++
      else missing++
    }
  }

  console.log(`  ✓ 覆盖 ${found + 1}/${targetCountries.length} 个地区（${missing} 个未上架）`)

  // 4. 每个套餐按 CNY 从低到高排序
  for (const key of plans) {
    prices[key].sort((a, b) => a.cny - b.cny)
  }

  return { plans, prices }
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const QUICK_MODE = process.env.QUICK === '1'
  console.log(`\n🌍 Youhu 全球价格抓取器 v2`)
  console.log(`   数据源：App Store 页面 HTML 解析`)
  console.log(`   覆盖地区：${QUICK_MODE ? '7 个（快速模式）' : COUNTRIES.length + ' 个'}`)
  console.log(`   应用总数：${appList.length} 款`)
  if (QUICK_MODE) console.log(`   ⚡ QUICK 模式已启用（仅抓 7 个国家，用于调试）\n`)
  else console.log()

  const finalApps = []

  for (let i = 0; i < appList.length; i++) {
    const app = appList[i]
    console.log(`[${i + 1}/${appList.length}] ${app.name} (id: ${app.appStoreId})`)

    let planData
    try {
      planData = await scrapeApp(app)
      if (!planData) {
        console.log(`  ⏩ 跳过 ${app.name}，无真实多国数据且无 fallback`)
        continue
      }
    } catch (e) {
      console.error(`  ❌ 抓取失败: ${e.message}，尝试 fallback`)
      if (app.fallbackPlans && app.fallbackPlans.length > 0) {
         planData = buildFallbackPrices(app.fallbackPlans)
      } else {
         continue
      }
    }

    finalApps.push({
      id: app.id,
      name: app.name,
      company: app.company,
      category: app.category,
      icon: app.icon,
      description: app.description,
      plansCount: planData.plans.length,
      plans: planData.plans,
      prices: planData.prices,
    })

    // App 间间隔，避免被限流
    if (i < appList.length - 1) await sleep(QUICK_MODE ? 200 : 800)
  }

  const outputPath = path.join(__dirname, 'data', 'apps.json')
  fs.writeFileSync(outputPath, JSON.stringify(finalApps, null, 2), 'utf-8')

  console.log(`\n✅ 完成！数据已写入 ${outputPath}`)
  console.log(`   共 ${finalApps.length} 款应用`)
  console.log(`   共 ${finalApps.reduce((s, a) => s + a.plansCount, 0)} 个套餐\n`)
  
  // 提示用户手动执行灌库（不再自动触发，避免误覆盖线上数据）
  console.log(`\n📋 下一步：请手动执行以下命令同步数据到 SQLite：`)
  console.log(`   node seed.js --force`)
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename

if (isDirectRun) {
  main().catch(e => {
    console.error('❌ 致命错误:', e)
    process.exit(1)
  })
}
