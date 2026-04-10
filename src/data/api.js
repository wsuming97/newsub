/**
 * 应用数据服务层
 * 开发环境/生产环境：从 API 接口动态获取数据
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const DEFAULT_CONFIG = Object.freeze({
  cnyRates: { USD: 7.24, CNY: 1 },
  regions: [],
  regionCount: 34
});

// ============================================================
// 应用列表缓存（避免重复请求）
// ============================================================
let appsCache = null;

// ============================================================
// 全局配置缓存（汇率、地区列表等）— 来自后端单一来源
// ============================================================
let configCache = null;

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildApiError(response, fallbackMessage, payload) {
  const error = new Error(payload?.error || fallbackMessage);
  error.status = response.status;
  error.payload = payload;
  return error;
}

/**
 * 获取全局配置（汇率表、地区列表）
 * 前端所有汇率换算应通过此接口获取，不再各页面硬编码
 * @returns {Promise<Object>} { cnyRates, regions, regionCount }
 */
export async function fetchConfig() {
  if (configCache) return configCache;
  try {
    const res = await fetch(`${API_BASE}/config`);
    const json = await parseJsonSafely(res);
    if (!res.ok) throw buildApiError(res, 'Config fetch failed', json);
    if (json.success) {
      configCache = json.data;
      return configCache;
    }
  } catch (e) {
    console.error('获取全局配置失败:', e);
  }
  // 降级：返回最小可用默认值，保证页面不白屏
  return DEFAULT_CONFIG;
}

/**
 * 获取所有应用列表
 * @returns {Promise<Array>} 应用数组
 */
export async function fetchApps(forceRefresh = false) {
  if (appsCache && !forceRefresh) return appsCache;

  const res = await fetch(`${API_BASE}/apps`);
  const json = await parseJsonSafely(res);
  if (!res.ok) throw buildApiError(res, 'API fetch failed', json);
  
  if (json.success) {
    appsCache = json.data;
    return appsCache;
  }
  return [];
}

/**
 * 根据 ID 获取单个应用详情（含套餐和价格）
 * @param {string} id 应用 ID
 * @returns {Promise<Object|null>} 应用详情
 */
export async function fetchAppById(id) {
  const res = await fetch(`${API_BASE}/apps/${id}`);
  const json = await parseJsonSafely(res);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw buildApiError(res, '获取应用详情失败', json);
  }
  if (json?.success) return json.data;
  throw new Error(json?.error || '获取应用详情失败');
}

/**
 * 添加新应用到数据库（或命中缓存直接返回 ID）
 * @param {Object} appData 应用数据
 * @returns {Promise<Object>} API 响应
 */
export async function addApp(appData) {
  const res = await fetch(`${API_BASE}/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appData)
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) throw buildApiError(res, '入库失败', json);
  return json;
}

/**
 * 按名字搜索 App Store 应用
 * @param {string} query 搜索关键词
 * @returns {Promise<Array>} 搜索结果数组
 */
export async function searchApps(query) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = await parseJsonSafely(res);
    return json.success ? json.data : [];
  } catch (e) {
    console.error('搜索应用失败:', e);
    return [];
  }
}

/**
 * 删除应用记录
 */
export async function deleteApp(id) {
  const res = await fetch(`${API_BASE}/apps/${id}`, { method: 'DELETE' });
  const json = await parseJsonSafely(res);
  appsCache = null; // 清除缓存
  if (!res.ok) throw buildApiError(res, '删除应用失败', json);
  return json;
}
