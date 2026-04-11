import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)

/**
 * 当前项目里的 SQLite 不是“业务真值库”，而是持久化缓存层：
 * - 真值仍然来自实时抓取 App Store / 实时汇率接口
 * - SQLite 只负责把抓取结果稳妥落盘，替换掉以前的 JSON 全量序列化文件
 *
 * 设计目标：
 * 1. 单机 VPS 易部署
 * 2. 容器重启后缓存可恢复
 * 3. 保留内存热缓存 + SWR + In-Flight 的现有行为
 * 4. 升级时尽量平滑接管旧 app_cache.json / rates_cache.json
 */

const DATA_DIR = process.env.CACHE_DIR
  ? path.resolve(process.env.CACHE_DIR)
  : path.resolve(CURRENT_DIR, '..', 'data')

const DB_PATH = process.env.CACHE_DB_PATH
  ? path.resolve(process.env.CACHE_DB_PATH)
  : path.join(DATA_DIR, 'cache.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS cache_entries (
    namespace TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expiry INTEGER NOT NULL,
    stale_tolerance_ms INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, cache_key)
  );

  CREATE INDEX IF NOT EXISTS idx_cache_entries_expiry
    ON cache_entries(namespace, expiry);

  CREATE INDEX IF NOT EXISTS idx_cache_entries_updated_at
    ON cache_entries(namespace, updated_at);
`)

const selectNamespaceStmt = db.prepare(`
  SELECT cache_key, payload_json, fetched_at, expiry, stale_tolerance_ms
  FROM cache_entries
  WHERE namespace = ?
`)

const countNamespaceStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM cache_entries
  WHERE namespace = ?
`)

const upsertStmt = db.prepare(`
  INSERT INTO cache_entries (
    namespace,
    cache_key,
    payload_json,
    fetched_at,
    expiry,
    stale_tolerance_ms,
    updated_at
  ) VALUES (
    @namespace,
    @cache_key,
    @payload_json,
    @fetched_at,
    @expiry,
    @stale_tolerance_ms,
    @updated_at
  )
  ON CONFLICT(namespace, cache_key) DO UPDATE SET
    payload_json = excluded.payload_json,
    fetched_at = excluded.fetched_at,
    expiry = excluded.expiry,
    stale_tolerance_ms = excluded.stale_tolerance_ms,
    updated_at = excluded.updated_at
`)

const deleteStmt = db.prepare(`
  DELETE FROM cache_entries
  WHERE namespace = ? AND cache_key = ?
`)

const pruneExpiredStmt = db.prepare(`
  DELETE FROM cache_entries
  WHERE namespace = ?
    AND (expiry + stale_tolerance_ms) < ?
`)

const upsertManyTx = db.transaction((rows) => {
  for (const row of rows) {
    upsertStmt.run(row)
  }
})

const deleteManyTx = db.transaction((rows) => {
  for (const row of rows) {
    deleteStmt.run(row.namespace, row.cacheKey)
  }
})

export function getCacheDbPath() {
  return DB_PATH
}

export function getCacheDataDir() {
  return DATA_DIR
}

export function countNamespaceEntries(namespace) {
  return countNamespaceStmt.get(namespace)?.total ?? 0
}

export function loadNamespaceEntries(namespace) {
  return selectNamespaceStmt.all(namespace)
}

export function upsertNamespaceEntries(namespace, entries) {
  if (!entries.length) return

  const now = Date.now()
  const rows = entries.map(entry => ({
    namespace,
    cache_key: entry.key,
    payload_json: JSON.stringify(entry.data),
    fetched_at: entry.fetchedAt,
    expiry: entry.expiry,
    stale_tolerance_ms: entry.staleToleranceMs,
    updated_at: now,
  }))

  upsertManyTx(rows)
}

export function deleteNamespaceEntries(namespace, keys) {
  if (!keys.length) return

  deleteManyTx(keys.map(key => ({
    namespace,
    cacheKey: key,
  })))
}

export function pruneExpiredNamespaceEntries(namespace, now = Date.now()) {
  return pruneExpiredStmt.run(namespace, now).changes
}

export default db
