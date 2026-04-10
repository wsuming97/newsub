import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径（Docker 部署时通过 Volume 挂载持久化）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'youhu.db');

let db = null;

/**
 * 获取数据库实例（单例模式）
 * 原生 better-sqlite3 引擎
 */
export async function getDb() {
  if (db) return db;

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // 向下兼容补丁：原 sql.js API 有 db.run()
  db.run = function(sql, params = []) {
    return this.prepare(sql).run(params);
  };

  initSchema();
  return db;
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT DEFAULT '',
      category TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_usd REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      region TEXT NOT NULL,
      flag TEXT DEFAULT '',
      original TEXT DEFAULT '',
      cny REAL NOT NULL DEFAULT 0,
      is_estimated INTEGER DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_plans_app_id ON plans(app_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_prices_plan_id ON prices(plan_id)');

  ensureColumn('prices', 'is_estimated', 'INTEGER DEFAULT 0');
}

function ensureColumn(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  const exists = columns.some(column => column.name === columnName);
  if (exists) return;

  try {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('duplicate column name')) {
      throw error;
    }
  }
}

/**
 * 原为写盘方法，原生 SQLite 会自动同步磁盘，无需再手动序列化导出。
 */
export function saveDb() {
  // No-op
}

/**
 * 执行 SELECT 查询并返回对象数组
 */
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(params);
}

/**
 * 执行 SELECT 查询返回单行
 */
export function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(params);
}

export default getDb;
