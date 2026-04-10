import fs from 'fs'
import path from 'path'

/**
 * 带有持久化、SWR (Stale-While-Revalidate) 及并发锁的缓存类
 */
class Cache {
  constructor(options = {}) {
    this.store = new Map()
    this.inFlight = new Map()
    this.persistPath = options.persistPath || null
    // 即使过期了，多久以内仍允许返回旧值 (默认 7 天)
    this.staleToleranceMs = options.staleToleranceMs || 7 * 24 * 60 * 60 * 1000

    if (this.persistPath) {
      this.loadFromDisk()
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf8')
        const arr = JSON.parse(raw)
        const now = Date.now()
        for (const [key, entry] of arr) {
          // 只恢复彻底还没死透的，哪怕是stale的也可以留着
          if (now <= entry.expiry + this.staleToleranceMs) {
            this.store.set(key, entry)
          }
        }
        console.log(`✅ [缓存] 从 ${path.basename(this.persistPath)} 成功恢复了 ${this.store.size} 条记录`)
      }
    } catch (e) {
      console.error(`❌ [缓存] 读取 ${this.persistPath} 失败:`, e.message)
    }
  }

  scheduleSave() {
    if (!this.persistPath) return
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => {
      try {
        const dirname = path.dirname(this.persistPath)
        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, { recursive: true })
        }
        const dataToSave = Array.from(this.store.entries())
        // 原子写入：先写临时文件再重命名，防止写到一半断电损坏 JSON
        const tempPath = `${this.persistPath}.tmp`
        fs.writeFileSync(tempPath, JSON.stringify(dataToSave), 'utf8')
        fs.renameSync(tempPath, this.persistPath)
      } catch (e) {
        console.error('❌ [缓存] 保存到磁盘失败:', e.message)
      }
    }, 2000) // 防抖 2 秒
  }

  /**
   * 获取缓存。
   * 返回格式: { data, stale: boolean, fetchedAt } 或 null
   */
  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now <= entry.expiry) {
      return { data: entry.data, stale: false, fetchedAt: entry.fetchedAt }
    } else if (now <= entry.expiry + this.staleToleranceMs) {
      return { data: entry.data, stale: true, fetchedAt: entry.fetchedAt }
    } else {
      this.store.delete(key)
      this.scheduleSave()
      return null
    }
  }

  /**
   * 返回内部直接对象（不包含 stale 判断），用于内部预热等罗列功能
   */
  getRaw(key) {
    return this.store.get(key)?.data
  }

  set(key, data, ttlMs) {
    this.store.set(key, { 
      data, 
      expiry: Date.now() + ttlMs,
      fetchedAt: Date.now()
    })
    this.scheduleSave()
  }

  del(key) {
    this.store.delete(key)
    this.scheduleSave()
  }

  keys() {
    const now = Date.now()
    const result = []
    for (const [key, entry] of this.store) {
      if (now <= entry.expiry + this.staleToleranceMs) {
        result.push(key)
      } else {
        this.store.delete(key)
      }
    }
    return result
  }

  get size() {
    return this.store.size
  }

  // ===================================
  // 并发请求去重锁 (In-Flight Dedup)
  // ===================================
  getInFlight(key) { return this.inFlight.get(key) }
  setInFlight(key, promise) { this.inFlight.set(key, promise) }
  clearInFlight(key) { this.inFlight.delete(key) }
}

const DATA_DIR = path.join(process.cwd(), 'data')

export const appCache = new Cache({ 
  persistPath: path.join(DATA_DIR, 'app_cache.json'),
  staleToleranceMs: 7 * 24 * 60 * 60 * 1000 // 过期后 7 天仍可作为旧值返回
})

export const ratesCache = new Cache({
  persistPath: path.join(DATA_DIR, 'rates_cache.json'),
  staleToleranceMs: 12 * 60 * 60 * 1000 
})

export default Cache
