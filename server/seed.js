/**
 * 种子数据导入脚本
 * 从已生成的 apps.json 读取数据并批量写入 SQLite
 * 
 * 用法: cd server && node seed.js
 */
import { getDb, saveDb, queryOne, queryAll } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取生成的 JSON 数据
function loadAppsFromGenerated() {
  const jsonPath = path.join(__dirname, 'data', 'apps.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`找不到数据文件: ${jsonPath}。请先运行 node generate_apps.js 生成数据。`);
  }
  const content = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(content);
}

async function seed() {
  const db = await getDb();
  const apps = loadAppsFromGenerated();

  console.log(`📦 开始导入 ${apps.length} 款应用到数据库...\n`);

  // 安全检查：防止误执行覆盖现有应用的套餐与价格
  // 使用 --force 跳过确认：node seed.js --force
  const isForce = process.argv.includes('--force');
  const existingCount = queryOne('SELECT COUNT(*) as c FROM apps')?.c ?? 0;
  if (existingCount > 0 && !isForce) {
    console.warn(`⚠️  数据库中已有 ${existingCount} 款应用，执行 seed 将覆盖同 ID 应用的套餐与价格。`);
    console.warn(`   如果确定要继续，请使用: node seed.js --force`);
    console.warn(`   等待 5 秒后自动取消...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log(`❌ 已自动取消。请使用 --force 参数确认执行。`);
    process.exit(0);
  }

  console.log(`\n⏳ 增量更新数据，未在 JSON 中的应用不受影响...`);
  // 不再全表 DELETE，保留人工添加或未被覆盖的数据

  for (const app of apps) {
    // 1. 删除此 app 的旧套餐和价格，以便后面重新插入
    const existingPlans = queryAll('SELECT id FROM plans WHERE app_id = ?', [app.id]);
    if (existingPlans.length > 0) {
      const planIds = existingPlans.map(row => row.id);
      db.run(`DELETE FROM prices WHERE plan_id IN (${planIds.join(',')})`);
    }
    db.run('DELETE FROM plans WHERE app_id = ?', [app.id]);

    // 2. 插入或更新应用 (UPSERT)
    db.run(`
      INSERT INTO apps (id, name, company, category, icon, description) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        company=excluded.company,
        category=excluded.category,
        icon=excluded.icon,
        description=excluded.description
    `, [app.id, app.name, app.company, app.category, app.icon, app.description]);

    // 3. 重新插入最新的套餐 + 价格
    for (const planName of app.plans) {
      const priceData = app.prices[planName];
      if (!priceData || priceData.length === 0) continue;

      // 反推 USD 价格
      const usPriceEntry = priceData.find(p => p.region === '美国');
      const priceUsd = usPriceEntry ? parseFloat((usPriceEntry.cny / 7.24).toFixed(2)) : 0;

      db.run('INSERT INTO plans (app_id, name, price_usd) VALUES (?, ?, ?)',
        [app.id, planName, priceUsd]
      );

      const planRow = queryOne('SELECT last_insert_rowid() as id');
      const planId = planRow.id;

      for (const price of priceData) {
        db.run('INSERT INTO prices (plan_id, region, flag, original, cny, is_estimated) VALUES (?, ?, ?, ?, ?, ?)',
          [planId, price.region, price.flag, price.original, price.cny, price.estimated ? 1 : 0]
        );
      }
    }

    console.log(`  ✅ ${app.name} — ${app.plans.length} 个套餐`);
  }

  // 持久化
  saveDb();

  // 统计
  const appCount = queryOne('SELECT COUNT(*) as c FROM apps').c;
  const planCount = queryOne('SELECT COUNT(*) as c FROM plans').c;
  const priceCount = queryOne('SELECT COUNT(*) as c FROM prices').c;
  console.log(`\n🎉 导入完成！`);
  console.log(`   应用: ${appCount} 款`);
  console.log(`   套餐: ${planCount} 个`);
  console.log(`   价格记录: ${priceCount} 条`);
}

seed().catch(console.error);
