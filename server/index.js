/**
 * Youhu 后端 API 服务
 * Express + sql.js (SQLite)
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getDb, saveDb, queryAll, queryOne } from './db.js';
import store from 'app-store-scraper';
import { getCatalogAppByStoreId, scrapeApp, COUNTRIES, CNY_RATES } from './generate_apps.js';

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// 管理员 token：保护写接口（POST/DELETE），通过环境变量配置
// 请求时需在 Header 中携带 Authorization: Bearer <token>
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const corsOrigin = process.env.CORS_ORIGIN;

if (IS_PROD && !ADMIN_TOKEN) {
  console.error('❌ 生产环境必须配置 ADMIN_TOKEN，已拒绝启动。');
  process.exit(1);
}

if (IS_PROD && !corsOrigin) {
  console.error('❌ 生产环境必须配置 CORS_ORIGIN，已拒绝启动。');
  process.exit(1);
}

function requireAdmin(req, res, next) {
  // 未配置 token 时跳过鉴权（兼容本地开发）
  if (!ADMIN_TOKEN) return next();
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ success: false, error: '未授权：需要管理员 token' });
  }
  next();
}

// 速率限制：搜索接口 30 次/分钟，写接口 10 次/分钟，读接口 60 次/分钟
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { success: false, error: '搜索请求过于频繁，请稍后再试' } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { success: false, error: '操作过于频繁，请稍后再试' } });
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, error: '请求过于频繁，请稍后再试' } });

// CORS 安全策略：通过 CORS_ORIGIN 环境变量限定允许的来源
// 多个域名用逗号分隔，如 CORS_ORIGIN=https://youhu.example.com,https://www.youhu.example.com
// 开发环境未配置时默认允许 Vite 常用端口，生产环境必须显式配置。
const allowedOrigins = corsOrigin
  ? corsOrigin.split(',').map(s => s.trim()).filter(Boolean)
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8888',
      'http://127.0.0.1:8888',
      'http://localhost:4173',
      'http://127.0.0.1:4173'
    ];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 策略拦截了该请求'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// 等待数据库初始化
let dbReady = false;
getDb().then(() => { dbReady = true; });

// 健康检查：用于容器/VPS 启动后的首要连通性验证，避免只能靠页面人工点测。
app.get('/api/health', async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({
      success: false,
      status: 'starting',
      dbReady: false,
      timestamp: new Date().toISOString()
    });
  }

  await getDb();
  const appCount = queryOne('SELECT COUNT(*) as c FROM apps')?.c ?? 0;
  const planCount = queryOne('SELECT COUNT(*) as c FROM plans')?.c ?? 0;
  const priceCount = queryOne('SELECT COUNT(*) as c FROM prices')?.c ?? 0;

  res.json({
    success: true,
    status: 'ok',
    dbReady: true,
    counts: {
      apps: appCount,
      plans: planCount,
      prices: priceCount
    },
    timestamp: new Date().toISOString()
  });
});

// 中间件：确保数据库已就绪
app.use((req, res, next) => {
  if (!dbReady) return res.status(503).json({ success: false, error: '数据库初始化中...' });
  next();
});

async function deleteAppCascade(appId) {
  const db = await getDb();
  const plans = queryAll('SELECT id FROM plans WHERE app_id = ?', [appId]);
  for (const plan of plans) {
    db.run('DELETE FROM prices WHERE plan_id = ?', [plan.id]);
  }
  db.run('DELETE FROM plans WHERE app_id = ?', [appId]);
  db.run('DELETE FROM apps WHERE id = ?', [appId]);
}

// ============================================================
// GET /api/apps — 获取所有应用列表
// ============================================================
app.get('/api/apps', readLimiter, async (req, res) => {
  await getDb();
  const apps = queryAll(`
    SELECT 
      a.*,
      (SELECT COUNT(*) FROM plans WHERE app_id = a.id) as plansCount
    FROM apps a
    ORDER BY a.category, a.name
  `);
  res.json({ success: true, data: apps });
});

// ============================================================
// GET /api/apps/:id — 获取单个应用详情（含套餐 + 各地区价格）
// ============================================================
app.get('/api/apps/:id', readLimiter, async (req, res) => {
  await getDb();
  const numericId = req.params.id.match(/^id(\d+)$/)?.[1];
  const catalogApp = numericId ? getCatalogAppByStoreId(numericId) : null;
  let resolvedId = req.params.id;

  // 历史 ID 兼容：优先检查标准条目是否存在，仅做读取判断，不修改数据库
  if (catalogApp && catalogApp.id !== req.params.id) {
    const canonicalApp = queryOne('SELECT id FROM apps WHERE id = ?', [catalogApp.id]);
    if (canonicalApp) {
      resolvedId = catalogApp.id;
    }
  }

  const appData = queryOne('SELECT * FROM apps WHERE id = ?', [resolvedId]);

  if (!appData) {
    return res.status(404).json({ success: false, error: '应用未找到' });
  }

  // 获取套餐
  const plans = queryAll('SELECT * FROM plans WHERE app_id = ? ORDER BY price_usd', [resolvedId]);

  // 获取各套餐的价格
  const prices = {};
  const planNames = [];
  for (const plan of plans) {
    planNames.push(plan.name);
    prices[plan.name] = queryAll(
      'SELECT region, flag, original, cny, is_estimated FROM prices WHERE plan_id = ? ORDER BY cny',
      [plan.id]
    ).map(price => ({
      ...price,
      is_estimated: Boolean(price.is_estimated)
    }));
  }

  res.json({
    success: true,
    data: {
      ...appData,
      plansCount: plans.length,
      plans: planNames,
      prices
    }
  });
});

// ============================================================
// GET /api/categories — 获取分类列表
// ============================================================
app.get('/api/categories', async (req, res) => {
  await getDb();
  const categories = queryAll(`
    SELECT category as name, COUNT(*) as count 
    FROM apps GROUP BY category ORDER BY category
  `);
  res.json({ success: true, data: categories });
});

// ============================================================
// GET /api/config — 暴露全局配置（汇率、地区列表）
// 前端应从此接口获取汇率，而非各页面硬编码，确保单一来源
// ============================================================
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: {
      cnyRates: CNY_RATES,
      regions: COUNTRIES.map(c => ({ code: c.code, name: c.name, flag: c.flag, currency: c.currency })),
      regionCount: COUNTRIES.length,
    }
  });
});

// ============================================================
// GET /api/search — 按名字搜索 App Store 应用
// ============================================================
app.get('/api/search', searchLimiter, async (req, res) => {
  const q = req.query.q;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.json({ success: true, data: [] });
  }
  // 限制搜索关键词长度，防止被滥用
  if (q.length > 100) {
    return res.status(400).json({ success: false, error: '搜索关键词过长' });
  }

  try {
    const results = await store.search({
      term: q.trim(),
      num: 10,
      country: 'cn'
    });

    // 精简返回字段，只给前端需要的
    const data = results.map(item => ({
      appId: item.id,           // 纯数字 App ID
      name: item.title,
      icon: item.icon,
      developer: item.developer,
      price: item.price,
      free: item.free,
      genre: item.primaryGenre || item.genres?.[0] || '未分类',
      url: item.url
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('搜索失败:', err.message);
    res.status(500).json({ success: false, error: '搜索失败: ' + err.message });
  }
});

// ============================================================
// POST /api/apps — 添加新应用（统一使用 34 国真实爬取引擎）
// ============================================================
app.post('/api/apps', writeLimiter, requireAdmin, async (req, res) => {
  const db = await getDb();
  let { id } = req.body;

  // 显式类型校验和正则表达式匹配：id 必须是有效的 10 位左右纯数字，或者以 id 开头的字符串
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: '请提供有效的 App ID（字符串）' });
  }
  if (!/^(id)?\d+$/.test(id) || id.length > 20) {
    return res.status(400).json({ success: false, error: 'App ID 格式异常，仅接受数字或 id+数字' });
  }

  const pureId = id.replace(/\D/g, '');
  if (!pureId) {
    return res.status(400).json({ success: false, error: '无法解析纯数字的 App ID' });
  }
  const formattedId = 'id' + pureId;
  const catalogApp = getCatalogAppByStoreId(pureId);
  const targetId = catalogApp?.id || formattedId;

  // 已收录应用统一走标准条目，顺手清掉历史错误数字 ID 记录，避免列表和详情页重复/串脏数据。
  if (catalogApp && formattedId !== targetId && queryOne('SELECT id FROM apps WHERE id = ?', [formattedId])) {
    await deleteAppCascade(formattedId);
    saveDb();
  }

  const existing = queryOne('SELECT id, updated_at FROM apps WHERE id = ?', [targetId]);
  if (existing) {
    let diffHours = 0;
    if (existing.updated_at) {
      const updated = new Date(existing.updated_at + 'Z');
      diffHours = (new Date() - updated) / (1000 * 60 * 60);
    }
    if (diffHours < 48) {
      return res.status(200).json({ success: true, id: targetId, message: '数据处于缓存期内（由于不足两日），直接返回' });
    }
    // 超过过期时间，移除数据库里的老缓存，重新拉取最新数据
    await deleteAppCascade(targetId);
  }

  try {
    // ——————————————————————————————————————————————
    // 获取基本信息（应用名、图标等元数据）
    // ——————————————————————————————————————————————
    let appMeta;
    try {
      appMeta = await store.app({ id: pureId, country: 'cn' });
    } catch (e) {
      appMeta = await store.app({ id: pureId, country: 'us' });
    }

    const name = catalogApp?.name || appMeta.title;
    const company = catalogApp?.company || appMeta.developer;
    const category = catalogApp?.category || appMeta.primaryGenre;
    const description = catalogApp?.description || (appMeta.description ? appMeta.description.substring(0, 150) + '...' : '暂无简介');
    const icon = catalogApp?.icon || appMeta.icon;

    // ——————————————————————————————————————————————
    // 使用统一的 34 国爬取引擎获取真实价格
    // 复用 generate_apps.js 的 scrapeApp，确保产出结构与种子数据完全一致
    // ——————————————————————————————————————————————
    const scrapeInput = catalogApp || {
      id: targetId,
      name,
      company,
      category,
      icon,
      description,
      appStoreId: pureId,
      fallbackPlans: [],
    };

    console.log(`[POST /api/apps] 开始 34 国真实爬取: ${name} (id${pureId})`);
    const planData = await scrapeApp(scrapeInput);

    if (!planData || planData.plans.length === 0) {
      return res.status(404).json({ success: false, error: '未找到该应用的订阅/内购数据，且无 fallback 定义' });
    }

    // ——————————————————————————————————————————————
    // 写入数据库，结构与 seed.js 完全一致
    // ——————————————————————————————————————————————
    db.run(
      'INSERT INTO apps (id, name, company, category, icon, description) VALUES (?, ?, ?, ?, ?, ?)',
      [targetId, name, company, category, icon, description]
    );

    for (const planName of planData.plans) {
      const priceData = planData.prices[planName];
      if (!priceData || priceData.length === 0) continue;

      // 从美国价格记录反推 USD 基准价
      const usPriceEntry = priceData.find(p => p.region === '美国');
      const priceUsd = usPriceEntry ? parseFloat((usPriceEntry.cny / CNY_RATES.USD).toFixed(2)) : 0;

      db.run('INSERT INTO plans (app_id, name, price_usd) VALUES (?, ?, ?)',
        [targetId, planName, priceUsd]
      );

      const planRow = queryOne('SELECT last_insert_rowid() as id');
      const planId = planRow.id;

      for (const price of priceData) {
        db.run('INSERT INTO prices (plan_id, region, flag, original, cny, is_estimated) VALUES (?, ?, ?, ?, ?, ?)',
          [planId, price.region, price.flag, price.original, price.cny, price.estimated ? 1 : 0]
        );
      }
    }

    saveDb();
    console.log(`[POST /api/apps] ✅ ${name} 入库完成，共 ${planData.plans.length} 个套餐`);
    res.status(201).json({ success: true, id: targetId, message: '34 国真实价格抓取成功并入库' });
  } catch (err) {
    console.error(`[POST /api/apps] ❌ 抓取失败:`, err.message);
    res.status(500).json({ success: false, error: '抓取失败: ' + err.message });
  }
});

// ============================================================
// DELETE /api/apps/:id — 删除应用
// ============================================================
app.delete('/api/apps/:id', writeLimiter, requireAdmin, async (req, res) => {
  const appId = req.params.id;
  // 校验 ID 格式
  if (!appId || typeof appId !== 'string' || appId.length > 50) {
    return res.status(400).json({ success: false, error: '无效的应用 ID' });
  }
  // 检查应用是否存在
  const existing = queryOne('SELECT id FROM apps WHERE id = ?', [appId]);
  if (!existing) {
    return res.status(404).json({ success: false, error: '应用不存在' });
  }
  await deleteAppCascade(appId);
  saveDb();
  res.json({ success: true, message: '应用已删除' });
});

// ============================================================
// 启动服务
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Youhu API 服务已启动 → http://0.0.0.0:${PORT}`);
  console.log(`📊 接口: GET /api/apps | GET /api/apps/:id | POST /api/apps | DELETE /api/apps/:id`);
});
