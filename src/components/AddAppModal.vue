<script setup>
import { ref, watch } from 'vue'
import { searchApps } from '../data/api.js'

const props = defineProps({
  isOpen: Boolean,
  isScraping: Boolean,
  scrapingApp: Object,
  scrapeError: String
})

const emit = defineEmits(['close', 'select'])

const keyword = ref('')
const results = ref([])
const isSearching = ref(false)
const hasSearched = ref(false)
let searchTimer = null

// 弹窗关闭时重置状态
watch(() => props.isOpen, (val) => {
  if (!val) {
    keyword.value = ''
    results.value = []
    hasSearched.value = false
    isSearching.value = false
  }
})

// 防抖搜索：输入停顿 400ms 后自动发起
function onInput() {
  clearTimeout(searchTimer)
  const q = keyword.value.trim()
  if (!q) {
    results.value = []
    hasSearched.value = false
    return
  }
  searchTimer = setTimeout(() => doSearch(q), 400)
}

async function doSearch(q) {
  isSearching.value = true
  hasSearched.value = true
  try {
    results.value = await searchApps(q)
  } catch (e) {
    results.value = []
  } finally {
    isSearching.value = false
  }
}

// 回车手动触发搜索
function onEnter() {
  clearTimeout(searchTimer)
  const q = keyword.value.trim()
  if (q) doSearch(q)
}

// 点击某个搜索结果
function selectApp(app) {
  emit('select', app)
}
</script>

<template>
  <div class="modal-overlay" v-if="isOpen" @click="emit('close')">
    <div class="modal-content" @click.stop>

      <!-- 头部 -->
      <div class="modal-header">
        <h2 class="modal-title">全球 App 比价查询</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- 搜索输入区 -->
      <div class="modal-body">
        <div class="search-input-wrap">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            v-model="keyword"
            placeholder="输入应用名称搜索，如：微信、Netflix、Spotify"
            @input="onInput"
            @keyup.enter="onEnter"
            autofocus
          />
          <div v-if="isSearching" class="search-spinner"></div>
        </div>

        <!-- 搜索结果列表 -->
        <div class="results-area">
          <!-- 加载中 -->
          <div v-if="isSearching && results.length === 0" class="results-status">
            <div class="loading-dots">
              <span></span><span></span><span></span>
            </div>
            <p>正在从 App Store 搜索...</p>
          </div>

          <!-- 无结果 -->
          <div v-else-if="hasSearched && !isSearching && results.length === 0" class="results-status">
            <p>未找到匹配的应用，请换个关键词试试</p>
          </div>

          <!-- 结果列表 -->
          <div v-else-if="results.length > 0" class="results-list">
            <div
              v-for="app in results"
              :key="app.appId"
              class="result-item"
              @click="selectApp(app)"
            >
              <img :src="app.icon" :alt="app.name" class="app-icon" />
              <div class="app-info">
                <div class="app-name">{{ app.name }}</div>
                <div class="app-meta">
                  <span class="app-developer">{{ app.developer }}</span>
                  <span class="app-genre">{{ app.genre }}</span>
                </div>
              </div>
              <div class="app-price">
                {{ app.free ? '免费' : (app.price > 0 ? '¥' + app.price : '付费') }}
              </div>
            </div>
          </div>

          <!-- 初始提示 -->
          <div v-else class="results-hint">
            <div class="hint-icon">🔍</div>
            <p>输入应用名称，即时搜索全球 App Store</p>
            <p class="hint-sub">选中应用后将自动查询各国跨区差价</p>
          </div>
        </div>

        <!-- 爬取进度遮罩层：选中应用后显示的全屏进度提示 -->
        <div v-if="isScraping" class="scraping-overlay">
          <div class="scraping-card">
            <img v-if="scrapingApp?.icon" :src="scrapingApp.icon" :alt="scrapingApp?.name" class="scraping-icon" />
            <h3 class="scraping-title">{{ scrapingApp?.name || '正在处理' }}</h3>
            <div class="scraping-animation">
              <div class="scraping-bar"><div class="scraping-bar-fill"></div></div>
            </div>
            <p class="scraping-text">🌍 正在爬取 34 个国家/地区的真实价格…</p>
            <p class="scraping-sub">预计需要 30–60 秒，请耐心等待</p>
          </div>
        </div>

        <!-- 爬取失败提示 -->
        <div v-if="scrapeError" class="scrape-error">
          <p>⚠️ {{ scrapeError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: #ffffff;
  width: 90%;
  max-width: 560px;
  border-radius: 20px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 75vh;
  overflow: hidden;
}

@keyframes slideUp {
  from { transform: translateY(20px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem 0.75rem;
  flex-shrink: 0;
}
.modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}
.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  transition: color 0.2s;
}
.close-btn:hover { color: #0f172a; }

.modal-body {
  padding: 0 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 搜索输入框 */
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}
.search-icon {
  position: absolute;
  left: 14px;
  color: #94a3b8;
  pointer-events: none;
}
.search-input-wrap input {
  width: 100%;
  padding: 0.85rem 2.5rem 0.85rem 2.75rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #0f172a;
  box-sizing: border-box;
  outline: none;
  transition: all 0.2s;
  background: #f8fafc;
}
.search-input-wrap input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  background: #fff;
}
.search-input-wrap input::placeholder {
  color: #94a3b8;
}

/* 搜索中旋转指示器 */
.search-spinner {
  position: absolute;
  right: 14px;
  width: 18px;
  height: 18px;
  border: 2px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 结果区域 */
.results-area {
  overflow-y: auto;
  max-height: 50vh;
  min-height: 120px;
}

.results-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: #64748b;
  font-size: 0.9rem;
}

/* 加载点动画 */
.loading-dots {
  display: flex;
  gap: 6px;
  margin-bottom: 0.75rem;
}
.loading-dots span {
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border-radius: 50%;
  animation: dotPulse 1.2s ease-in-out infinite;
}
.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.1); }
}

/* 结果列表 */
.results-list {
  display: flex;
  flex-direction: column;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.result-item:hover {
  background: #f1f5f9;
}
.result-item:active {
  transform: scale(0.99);
}

.app-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  flex-shrink: 0;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.app-info {
  flex: 1;
  min-width: 0;
}
.app-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 2px;
}
.app-developer {
  font-size: 0.8rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-genre {
  font-size: 0.7rem;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.app-price {
  font-size: 0.85rem;
  font-weight: 600;
  color: #10b981;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 初始提示 */
.results-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.5rem 1rem;
  text-align: center;
}
.hint-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
}
.results-hint p {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
}
.hint-sub {
  margin-top: 0.35rem !important;
  font-size: 0.8rem !important;
  color: #94a3b8 !important;
}

/* 爬取进度遮罩层 */
.scraping-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 20px;
}
.scraping-card {
  text-align: center;
  padding: 2rem;
}
.scraping-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  margin-bottom: 1rem;
  animation: scrapePulse 2s ease-in-out infinite;
}
@keyframes scrapePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.scraping-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 1.25rem;
}
.scraping-animation {
  margin-bottom: 1.25rem;
}
.scraping-bar {
  width: 200px;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
  margin: 0 auto;
}
.scraping-bar-fill {
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  border-radius: 3px;
  animation: scrapeProgress 2s ease-in-out infinite;
}
@keyframes scrapeProgress {
  0% { transform: translateX(-100%); width: 40%; }
  50% { transform: translateX(150%); width: 60%; }
  100% { transform: translateX(-100%); width: 40%; }
}
.scraping-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: #334155;
  margin: 0 0 0.35rem;
}
.scraping-sub {
  font-size: 0.8rem;
  color: #94a3b8;
  margin: 0;
}

/* 爬取失败提示 */
.scrape-error {
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  margin-top: 0.5rem;
}
.scrape-error p {
  margin: 0;
  font-size: 0.85rem;
  color: #dc2626;
  font-weight: 500;
}
</style>
