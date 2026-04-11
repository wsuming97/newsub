import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  countNamespaceEntries,
  deleteNamespaceEntries,
  getCacheDataDir,
  getCacheDbPath,
  loadNamespaceEntries,
  pruneExpiredNamespaceEntries,
  upsertNamespaceEntries,
} from './db.js'

const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)
const DATA_DIR = getCacheDataDir()
const DB_PATH = getCacheDbPath()

/**
 * 缓存类仍然保留原来的核心职责：
 * 1. 内存热缓存，保证命中时毫秒级返回
 * 2. SWR 语义，过期后仍可短期返回旧值
 * 3. In-Flight 去重，防止同一 App 并发重复抓取
 *
 * 与旧版最大的区别是：
 * - 持久化层不再写 app_cache.json / rates_cache.json
 * - 改为写 SQLite cache.db
 *
 * 这样可以避免：
 * - 每次写入都全量序列化整个 Map
 * - 缓存量一大 JSON 文件越来越重
 * - 重建容器后只能依赖单个巨大 JSON 文件恢复
 */
class Cache {
  constructor(options = {}) {
    this.namespace = options.namespace
    this.store = new Map()
    this.inFlight = new Map()
    this.staleToleranceMs = options.staleToleranceMs || 7 * 24 * 60 * 60 * 1000
    this.legacyJsonPath = options.legacyJsonPath || null
    this.pendingUpserts = new Map()
    this.pendingDeletes = new Set()
    this.flushTimeout = null

    if (!this.namespace) {
      throw new Error('Cache 初始化失败：缺少 namespace')
    }

    this.loadFromPersistentStore()
  }

  loadFromPersistentStore() {
    const now = Date.now()
    const rows = loadNamespaceEntries(this.namespace)

    for (const row of rows) {
      try {
        const staleToleranceMs = row.stale_tolerance_ms || this.staleToleranceMs
        if (now > row.expiry + staleToleranceMs) {
          continue
        }

        this.store.set(row.cache_key, {
          data: JSON.parse(row.payload_json),
          fetchedAt: row.fetched_at,
          expiry: row.expiry,
          staleToleranceMs,
        })
      } catch (error) {
        console.error(`❌ [缓存] 解析 ${this.namespace}:${row.cache_key} 失败:`, error.message)
      }
    }

    const pruned = pruneExpiredNamespaceEntries(this.namespace, now)
    if (pruned > 0) {
      console.log(`🧹 [缓存] 已清理 ${this.namespace} 中 ${pruned} 条彻底过期记录`)
    }

    if (this.store.size > 0) {
      console.log(`✅ [缓存] 从 SQLite 恢复 ${this.namespace} ${this.store.size} 条记录 (${path.basename(DB_PATH)})`)
      return
    }

    // 只有当 SQLite 里该命名空间还是空的，才尝试一次性接管旧 JSON 缓存。
    // 这样可以让线上升级尽量平滑，不要求用户手工先删 JSON。
    if (countNamespaceEntries(this.namespace) === 0 && this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
      this.migrateLegacyJson()
    }
  }

  migrateLegacyJson() {
    try {
      const raw = fs.readFileSync(this.legacyJsonPath, 'utf8')
      const legacyEntries = JSON.parse(raw)
      if (!Array.isArray(legacyEntries)) return

      const now = Date.now()
      const importedEntries = []

      for (const entry of legacyEntries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue

        const [key, payload] = entry
        if (!payload || typeof payload !== 'object') continue

        const fetchedAt = payload.fetchedAt || now
        const expiry = payload.expiry || now
        const staleToleranceMs = payload.staleToleranceMs || this.staleToleranceMs

        if (now > expiry + staleToleranceMs) {
          continue
        }

        const normalized = {
          data: payload.data,
          fetchedAt,
          expiry,
          staleToleranceMs,
        }

        this.store.set(key, normalized)
        importedEntries.push({
          key,
          data: normalized.data,
          fetchedAt,
          expiry,
          staleToleranceMs,
        })
      }

      upsertNamespaceEntries(this.namespace, importedEntries)

      if (importedEntries.length > 0) {
        console.log(`✅ [缓存] 已从旧 JSON 迁移 ${this.namespace} ${importedEntries.length} 条记录 -> ${path.basename(DB_PATH)}`)
      }
    } catch (error) {
      console.error(`❌ [缓存] 迁移旧 JSON 失败 (${this.namespace}):`, error.message)
    }
  }

  scheduleFlush() {
    if (this.flushTimeout) clearTimeout(this.flushTimeout)

    this.flushTimeout = setTimeout(() => {
      this.flushNow()
    }, 1000)
  }

  flushNow() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout)
      this.flushTimeout = null
    }

    if (this.pendingUpserts.size === 0 && this.pendingDeletes.size === 0) {
      return
    }

    try {
      const upserts = Array.from(this.pendingUpserts.values())
      const deletes = Array.from(this.pendingDeletes)

      this.pendingUpserts.clear()
      this.pendingDeletes.clear()

      upsertNamespaceEntries(this.namespace, upserts)
      deleteNamespaceEntries(this.namespace, deletes)
    } catch (error) {
      console.error(`❌ [缓存] 刷新到 SQLite 失败 (${this.namespace}):`, error.message)
    }
  }

  queueUpsert(key, entry) {
    this.pendingDeletes.delete(key)
    this.pendingUpserts.set(key, {
      key,
      data: entry.data,
      fetchedAt: entry.fetchedAt,
      expiry: entry.expiry,
      staleToleranceMs: entry.staleToleranceMs || this.staleToleranceMs,
    })
    this.scheduleFlush()
  }

  queueDelete(key) {
    this.pendingUpserts.delete(key)
    this.pendingDeletes.add(key)
    this.scheduleFlush()
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null

    const now = Date.now()
    const staleToleranceMs = entry.staleToleranceMs || this.staleToleranceMs

    if (now <= entry.expiry) {
      return {
        data: entry.data,
        stale: false,
        fetchedAt: entry.fetchedAt,
      }
    }

    if (now <= entry.expiry + staleToleranceMs) {
      return {
        data: entry.data,
        stale: true,
        fetchedAt: entry.fetchedAt,
      }
    }

    this.store.delete(key)
    this.queueDelete(key)
    return null
  }

  getRaw(key) {
    return this.store.get(key)?.data
  }

  set(key, data, ttlMs) {
    const entry = {
      data,
      expiry: Date.now() + ttlMs,
      fetchedAt: Date.now(),
      staleToleranceMs: this.staleToleranceMs,
    }

    this.store.set(key, entry)
    this.queueUpsert(key, entry)
  }

  del(key) {
    this.store.delete(key)
    this.queueDelete(key)
  }

  keys() {
    const now = Date.now()
    const result = []

    for (const [key, entry] of this.store) {
      const staleToleranceMs = entry.staleToleranceMs || this.staleToleranceMs

      if (now <= entry.expiry + staleToleranceMs) {
        result.push(key)
        continue
      }

      this.store.delete(key)
      this.queueDelete(key)
    }

    return result
  }

  get size() {
    return this.store.size
  }

  getInFlight(key) {
    return this.inFlight.get(key)
  }

  setInFlight(key, promise) {
    this.inFlight.set(key, promise)
  }

  clearInFlight(key) {
    this.inFlight.delete(key)
  }
}

const appLegacyJsonPath = path.join(DATA_DIR, 'app_cache.json')
const ratesLegacyJsonPath = path.join(DATA_DIR, 'rates_cache.json')

export const appCache = new Cache({
  namespace: 'apps',
  staleToleranceMs: 7 * 24 * 60 * 60 * 1000,
  legacyJsonPath: appLegacyJsonPath,
})

export const ratesCache = new Cache({
  namespace: 'rates',
  staleToleranceMs: 12 * 60 * 60 * 1000,
  legacyJsonPath: ratesLegacyJsonPath,
})

function flushAllCaches() {
  appCache.flushNow()
  ratesCache.flushNow()
}

process.once('beforeExit', flushAllCaches)
process.once('exit', flushAllCaches)

export { DATA_DIR, DB_PATH }
export default Cache
