/**
 * 简单的 TTL 内存缓存
 * 用于缓存 App 价格数据和汇率，避免重复请求
 */

class Cache {
  constructor() {
    this.store = new Map()
  }

  /**
   * 获取缓存值，过期则返回 null
   */
  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiry) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  /**
   * 设置缓存值
   * @param {string} key
   * @param {any} data
   * @param {number} ttlMs 过期时间（毫秒）
   */
  set(key, data, ttlMs) {
    this.store.set(key, { data, expiry: Date.now() + ttlMs })
  }

  /**
   * 删除指定 key
   */
  del(key) {
    this.store.delete(key)
  }

  /**
   * 返回所有未过期的 key
   */
  keys() {
    const now = Date.now()
    const result = []
    for (const [key, entry] of this.store) {
      if (now <= entry.expiry) result.push(key)
      else this.store.delete(key)
    }
    return result
  }

  /**
   * 缓存条目数
   */
  get size() {
    return this.keys().length
  }
}

// 全局单例
export const appCache = new Cache()    // app 价格数据，TTL 24h
export const ratesCache = new Cache()  // 汇率数据，TTL 24h

export default Cache
