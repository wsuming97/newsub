<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { searchApps, RECOMMENDED_APPS } from '../data/api.js'

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])
const router = useRouter()

const query = ref('')
const inputRef = ref(null)
const activeIndex = ref(0)

const results = ref([])
const isSearching = ref(false)

// 空搜索显示热门
const isShowingDefault = ref(true)

let searchTimeout = null

// 监听弹窗打开，自动聚焦并重置
watch(() => props.isOpen, async (val) => {
  if (val) {
    query.value = ''
    activeIndex.value = 0
    results.value = RECOMMENDED_APPS.slice(0, 8)
    isShowingDefault.value = true
    await nextTick()
    inputRef.value?.focus()
  }
})

// 监听输入，防抖请求 API
watch(query, (newVal) => {
  activeIndex.value = 0
  const q = newVal.trim()
  
  if (!q) {
    results.value = RECOMMENDED_APPS.slice(0, 8)
    isShowingDefault.value = true
    isSearching.value = false
    clearTimeout(searchTimeout)
    return
  }

  isShowingDefault.value = false
  isSearching.value = true

  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    try {
      const res = await searchApps(q)
      // 如果此时 query 已经变了，就忽略这次结果
      if (query.value.trim() === q) {
        results.value = res.slice(0, 12)
      }
    } catch (e) {
      console.error('搜索出错:', e)
    } finally {
      if (query.value.trim() === q) {
        isSearching.value = false
      }
    }
  }, 300) // 300ms 防抖
})

// 键盘导航
function handleKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (results.value[activeIndex.value]) {
      selectApp(results.value[activeIndex.value])
    }
  } else if (e.key === 'Escape') {
    closeModal()
  }
}

function selectApp(app) {
  // 原生搜索结果里是 appStoreId，推荐列表里也是 appStoreId
  const targetId = app.appStoreId || app.id
  router.push(`/app/${targetId}`)
  closeModal()
}

function closeModal() {
  emit('close')
}

// 全局快捷键 Ctrl+K / Cmd+K
function globalKeyHandler(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (props.isOpen) {
      closeModal()
    } else {
      emit('close') // 这里需要父组件监听并打开
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', globalKeyHandler)
})
onUnmounted(() => {
  document.removeEventListener('keydown', globalKeyHandler)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="search-overlay" @click.self="closeModal">
      <div class="search-container" @keydown="handleKeydown">
        <!-- 搜索输入区 -->
        <div class="search-input-area">
          <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="search-input"
            placeholder="搜索应用名称、开发商或分类..."
            autocomplete="off"
          />
          <kbd class="esc-key" @click="closeModal">ESC</kbd>
        </div>

        <!-- 分割线 -->
        <div class="search-divider"></div>

        <!-- 结果区域 -->
        <div class="search-results">
          <div v-if="isSearching" class="results-hint" style="justify-content: center; padding: 2rem;">
            <svg class="spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line>
            </svg>
            <span style="color: #3b82f6; margin-left: 8px;">正在搜索 App Store...</span>
          </div>
          <template v-else>
            <div v-if="isShowingDefault" class="results-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span>热门应用</span>
            </div>
            <div v-else-if="results.length === 0" class="no-results">
              <span>没有找到匹配的应用</span>
            </div>
            <div v-else class="results-hint">
              <span>找到 {{ results.length }} 个结果</span>
            </div>

            <div class="results-list">
              <button
                v-for="(app, index) in results"
                :key="app.appStoreId || app.id"
                :class="['result-item', { active: index === activeIndex }]"
                @click="selectApp(app)"
                @mouseenter="activeIndex = index"
              >
                <img v-if="app.icon" :src="app.icon" :alt="app.name" class="result-icon" @error="$event.target.style.display='none'" />
                <div v-else class="result-icon result-icon-placeholder" :style="{ background: `hsl(${(app.name || '').charCodeAt(0) * 37 % 360}, 55%, 55%)` }">
                  {{ (app.name || '?')[0] }}
                </div>
                <div class="result-meta">
                  <span class="result-name">{{ app.name }}</span>
                  <span class="result-company">{{ app.developer || app.company || 'App Store' }}</span>
                </div>
                <span class="result-category">{{ app.genre || app.category || '应用' }}</span>
                <svg class="result-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </template>
        </div>

        <!-- 底部提示 -->
        <div class="search-footer">
          <div class="footer-hint">
            <kbd>↑</kbd><kbd>↓</kbd> 导航
            <kbd>↵</kbd> 选择
            <kbd>ESC</kbd> 关闭
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  100% { transform: rotate(360deg); }
}

.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.search-container {
  background: #ffffff;
  border-radius: 20px;
  width: 95vw;
  max-width: 620px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideDown {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* === 搜索输入区 === */
.search-input-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
}
.search-icon {
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 1.1rem;
  font-weight: 500;
  color: #0f172a;
  background: transparent;
  font-family: inherit;
}
.search-input::placeholder {
  color: #94a3b8;
  font-weight: 400;
}
.esc-key {
  flex-shrink: 0;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
}
.esc-key:hover {
  background: #e2e8f0;
}

/* === 分割线 === */
.search-divider {
  height: 1px;
  background: #f1f5f9;
}

/* === 结果区域 === */
.search-results {
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
}
.results-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: #94a3b8;
}
.no-results {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.95rem;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: none;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
  width: 100%;
  text-align: left;
  font-family: inherit;
}
.result-item:hover,
.result-item.active {
  background: #f8fafc;
}
.result-item.active {
  background: #f0f9ff;
}

.result-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.result-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
}

.result-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.result-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-company {
  font-size: 0.8rem;
  color: #94a3b8;
}

.result-category {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.result-arrow {
  flex-shrink: 0;
  color: #cbd5e1;
  transition: color 0.15s;
}
.result-item.active .result-arrow {
  color: #2563eb;
}

/* === 底部提示 === */
.search-footer {
  border-top: 1px solid #f1f5f9;
  padding: 0.6rem 1.25rem;
  display: flex;
  justify-content: flex-end;
}
.footer-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: #94a3b8;
}
.footer-hint kbd {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  font-family: inherit;
}

/* === 滚动条美化 === */
.search-results::-webkit-scrollbar {
  width: 6px;
}
.search-results::-webkit-scrollbar-track {
  background: transparent;
}
.search-results::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 3px;
}
</style>
