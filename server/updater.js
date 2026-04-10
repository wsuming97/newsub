/**
 * ============================================================
 * Youhu 增量价格巡查更新器（Updater）
 * ============================================================
 *
 * 职责：遍历数据库中所有已入库的应用，增量更新其价格数据。
 *       只做 UPDATE / INSERT，绝不做 DELETE — 确保哪怕爬虫全部失败，
 *       用户看到的也是"稍旧但完整"的数据，而不是空白页。
 *
 * 运行方式：
 *   本地测试: cd server && node updater.js
 *   VPS 定时: crontab → 0 3 *​/2 * * docker exec youhu node /app/server/updater.js
 *
 * 数据来源优先级：
 *   1. 苹果 App Store 34 国真实 IAP 价格（scrapeApp）
 *   2. 预设目录中的 fallback 估算（buildFallbackPrices）
 *   3. 抓取失败 → 跳过该应用，保留旧数据不动
 * ============================================================
 */
import { getDb, saveDb, queryAll, queryOne } from './db.js';
import { appList, scrapeApp, buildFallbackPrices, CNY_RATES } from './generate_apps.js';

// ============================================================
// 配置
// ============================================================

// 两次更新间的最短间隔（小时）。低于此间隔的应用会被跳过。
const MIN_UPDATE_INTERVAL_HOURS = 48;

// App 之间的请求间隔（毫秒），避免被苹果限流
const DELAY_BETWEEN_APPS_MS = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// 核心：增量更新单个应用的价格
// ============================================================
async function updateAppPrices(appRow, catalogApp) {
  const db = await getDb();
  const appId = appRow.id;

  // 1. 准备爬取输入
  const scrapeInput = catalogApp || {
    id: appId,
    name: appRow.name,
    company: appRow.company,
    category: appRow.category,
    icon: appRow.icon,
    description: appRow.description,
    appStoreId: appId.startsWith('id') ? appId.replace('id', '') : null,
    fallbackPlans: [],
  };

  // 对于没有 appStoreId 的应用（如用户手动搜索添加的），跳过
  if (!scrapeInput.appStoreId && (!catalogApp?.fallbackPlans?.length)) {
    return { status: 'skipped', reason: '无 appStoreId 且无 fallback' };
  }

  // 2. 爬取最新价格
  let planData;
  try {
    planData = await scrapeApp(scrapeInput);
  } catch (e) {
    return { status: 'error', reason: e.message };
  }

  if (!planData || planData.plans.length === 0) {
    return { status: 'skipped', reason: '爬取结果为空（可能下架或区域限制）' };
  }

  // 3. 获取数据库中现有的套餐
  const existingPlans = queryAll('SELECT * FROM plans WHERE app_id = ?', [appId]);
  const existingPlanMap = {};
  for (const p of existingPlans) {
    existingPlanMap[p.name] = p;
  }

  let updatedPrices = 0;
  let insertedPrices = 0;
  let insertedPlans = 0;

  // 4. 逐套餐处理
  for (const planName of planData.plans) {
    const priceData = planData.prices[planName];
    if (!priceData || priceData.length === 0) continue;

    let planId;
    const existingPlan = existingPlanMap[planName];

    if (existingPlan) {
      // 套餐已存在 → 更新 USD 基准价
      planId = existingPlan.id;
      const usPriceEntry = priceData.find(p => p.region === '美国');
      if (usPriceEntry) {
        const newPriceUsd = parseFloat((usPriceEntry.cny / CNY_RATES.USD).toFixed(2));
        if (Math.abs(newPriceUsd - existingPlan.price_usd) > 0.01) {
          db.run('UPDATE plans SET price_usd = ? WHERE id = ?', [newPriceUsd, planId]);
        }
      }
    } else {
      // 新增套餐（苹果可能新上了一个订阅档位）
      const usPriceEntry = priceData.find(p => p.region === '美国');
      const priceUsd = usPriceEntry ? parseFloat((usPriceEntry.cny / CNY_RATES.USD).toFixed(2)) : 0;
      db.run('INSERT INTO plans (app_id, name, price_usd) VALUES (?, ?, ?)', [appId, planName, priceUsd]);
      const row = queryOne('SELECT last_insert_rowid() as id');
      planId = row.id;
      insertedPlans++;
    }

    // 5. 逐地区更新价格
    const existingPrices = queryAll('SELECT * FROM prices WHERE plan_id = ?', [planId]);
    const existingPriceMap = {};
    for (const ep of existingPrices) {
      existingPriceMap[ep.region] = ep;
    }

    for (const price of priceData) {
      const isEstimated = price.estimated ? 1 : 0;
      const existing = existingPriceMap[price.region];

      if (existing) {
        // 价格已存在 → 检查是否有变化，有则 UPDATE
        const cnyChanged = Math.abs(existing.cny - price.cny) > 0.01;
        const originalChanged = existing.original !== price.original;
        if (cnyChanged || originalChanged) {
          db.run(
            'UPDATE prices SET original = ?, cny = ?, flag = ?, is_estimated = ? WHERE id = ?',
            [price.original, price.cny, price.flag, isEstimated, existing.id]
          );
          updatedPrices++;
        }
      } else {
        // 新地区 → INSERT
        db.run(
          'INSERT INTO prices (plan_id, region, flag, original, cny, is_estimated) VALUES (?, ?, ?, ?, ?, ?)',
          [planId, price.region, price.flag, price.original, price.cny, isEstimated]
        );
        insertedPrices++;
      }
    }
  }

  // 6. 更新应用的 updated_at 时间戳
  db.run('UPDATE apps SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [appId]);

  return {
    status: 'ok',
    updatedPrices,
    insertedPrices,
    insertedPlans,
  };
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log(`\n🔄 Youhu 增量价格巡查更新器`);
  console.log(`   时间: ${new Date().toISOString()}`);
  console.log(`   策略: 只 UPDATE/INSERT，绝不 DELETE`);
  console.log(`   间隔: 跳过 ${MIN_UPDATE_INTERVAL_HOURS}h 内已更新的应用\n`);

  await getDb();

  // 建立 appList 的快速查找索引（id → catalogApp）
  const catalogById = {};
  const catalogByStoreId = {};
  for (const app of appList) {
    catalogById[app.id] = app;
    if (app.appStoreId) catalogByStoreId[app.appStoreId] = app;
  }

  // 读取数据库中全部应用
  const allApps = queryAll('SELECT * FROM apps ORDER BY updated_at ASC');
  console.log(`📋 数据库中共 ${allApps.length} 款应用\n`);

  let updated = 0, skipped = 0, errored = 0;

  for (let i = 0; i < allApps.length; i++) {
    const appRow = allApps[i];

    // 检查更新间隔
    if (appRow.updated_at) {
      const lastUpdate = new Date(appRow.updated_at + 'Z');
      const hoursSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      if (hoursSince < MIN_UPDATE_INTERVAL_HOURS) {
        console.log(`  ⏭️  [${i + 1}/${allApps.length}] ${appRow.name} — 跳过（${hoursSince.toFixed(1)}h 前已更新）`);
        skipped++;
        continue;
      }
    }

    // 匹配预设目录
    let catalogApp = catalogById[appRow.id];
    // 如果没有直接匹配，尝试通过 App Store ID 匹配
    if (!catalogApp && appRow.id.startsWith('id')) {
      const storeId = appRow.id.replace('id', '');
      catalogApp = catalogByStoreId[storeId];
    }

    console.log(`  🔄 [${i + 1}/${allApps.length}] ${appRow.name}...`);

    const result = await updateAppPrices(appRow, catalogApp);

    if (result.status === 'ok') {
      console.log(`     ✅ 完成 — 更新 ${result.updatedPrices} 条价格，新增 ${result.insertedPrices} 条价格，新增 ${result.insertedPlans} 个套餐`);
      updated++;
    } else if (result.status === 'skipped') {
      console.log(`     ⏭️  跳过 — ${result.reason}`);
      skipped++;
    } else {
      console.log(`     ❌ 失败 — ${result.reason}`);
      errored++;
    }

    // 间隔节流
    if (i < allApps.length - 1) {
      await sleep(DELAY_BETWEEN_APPS_MS);
    }
  }

  // 持久化（better-sqlite3 会自动同步，此处为语义明确调用）
  saveDb();

  console.log(`\n📊 巡查完成！`);
  console.log(`   ✅ 成功更新: ${updated} 款`);
  console.log(`   ⏭️  跳过: ${skipped} 款`);
  console.log(`   ❌ 失败: ${errored} 款`);
  console.log(`   时间: ${new Date().toISOString()}\n`);
}

main().catch(e => {
  console.error('❌ 更新器致命错误:', e);
  process.exit(1);
});
