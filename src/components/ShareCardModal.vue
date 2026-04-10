<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  appData: Object,
  currentPlan: String,
  prices: Array,       // currentPrices (已排序)
  formatPrice: Function,
  currencyCode: String
})

const emit = defineEmits(['close'])

// 卡片 DOM 引用
const cardRef = ref(null)
const isGenerating = ref(false)
const copySuccess = ref('')

// 取前 5 条价格做卡片展示
const topPrices = computed(() => {
  if (!props.prices) return []
  return props.prices.slice(0, 5)
})

const lowestPrice = computed(() => topPrices.value[0] || null)

const remainingCount = computed(() => {
  if (!props.prices) return 0
  return Math.max(0, props.prices.length - 5)
})

const shareText = computed(() => {
  if (!props.appData || !lowestPrice.value) return ''
  if (lowestPrice.value.is_estimated) {
    return `查看 ${props.appData.name} 的全球价格对比！在 ${lowestPrice.value.region} 的参考估价低至 ${props.formatPrice(lowestPrice.value.cny)}。 #Youhu #AppStore比价`
  }
  return `查看 ${props.appData.name} 的全球价格对比！在 ${lowestPrice.value.region} 发现了最低价 ${props.formatPrice(lowestPrice.value.cny)}。 #Youhu #AppStore比价`
})

// 当前页面 URL
const pageUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.href
  }
  return ''
})

// === 操作函数 ===

// 生成 Canvas
async function generateCanvas() {
  if (!cardRef.value) return null
  isGenerating.value = true
  await nextTick()
  try {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(cardRef.value, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      allowTaint: true,
      logging: false
    })
    return canvas
  } catch (e) {
    console.error('生成图片失败:', e)
    return null
  } finally {
    isGenerating.value = false
  }
}

// 下载图片
async function downloadImage() {
  const canvas = await generateCanvas()
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `${props.appData?.id || 'youhu'}-price-card.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  showCopySuccess('图片已下载')
}

// 复制图片到剪贴板
async function copyImage() {
  const canvas = await generateCanvas()
  if (!canvas) return
  try {
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      showCopySuccess('图片已复制')
    }, 'image/png')
  } catch {
    showCopySuccess('复制失败，请使用下载')
  }
}

// 复制链接
async function copyLink() {
  try {
    await navigator.clipboard.writeText(pageUrl.value)
    showCopySuccess('链接已复制')
  } catch {
    showCopySuccess('复制失败')
  }
}

// POST to X
function postToX() {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText.value)}&url=${encodeURIComponent(pageUrl.value)}`
  window.open(url, '_blank')
}

function showCopySuccess(msg) {
  copySuccess.value = msg
  setTimeout(() => { copySuccess.value = '' }, 2000)
}

function closeModal() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal-container">
        <!-- 左侧：卡片预览 -->
        <div class="preview-area">
          <div class="phone-frame">
            <div ref="cardRef" class="share-card">
              <!-- 品牌头部 -->
              <div class="card-brand-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>优惠 Youhu</span>
              </div>

              <!-- App 信息 -->
              <div class="card-app-info">
                <img :src="appData?.icon" :alt="appData?.name" class="card-app-icon" />
                <div class="card-app-name">{{ appData?.name }}</div>
                <div class="card-app-company">{{ appData?.company }}</div>
              </div>

              <!-- 货币标签 -->
              <div class="card-currency-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>全球价格 ({{ currencyCode }})</span>
              </div>

              <!-- 价格排行 -->
              <div class="card-price-list">
                <div v-for="(item, index) in topPrices" :key="item.region" class="card-price-row" :class="{ 'is-lowest': index === 0 }">
                  <span class="card-rank">{{ index + 1 }}</span>
                  <span class="card-flag">{{ item.flag }}</span>
                  <span class="card-region" :class="{ 'bold': index === 0 }">{{ item.region }}</span>
                  <span class="card-price" :class="{ 'highlight': index === 0 }">
                    {{ formatPrice(item.cny) }}
                    <span v-if="index === 0" class="lowest-tag" :style="item.is_estimated ? 'background:#fef08a;color:#854d0e;' : ''">{{ item.is_estimated ? '估算' : '最低' }}</span>
                  </span>
                </div>
              </div>

              <!-- 更多提示 -->
              <div class="card-more" v-if="remainingCount > 0">
                还有 {{ remainingCount }} 个地区价格
              </div>

              <!-- 底部 -->
              <div class="card-footer-area">
                <div class="card-footer-left">
                  <div class="card-footer-title">访问并对比</div>
                  <div class="card-footer-desc">打开优惠查看全球价格走势</div>
                </div>
                <div class="card-qr-placeholder">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/></svg>
                </div>
              </div>

              <div class="card-powered">Powered by youhu</div>
            </div>
          </div>
        </div>

        <!-- 右侧：操作面板 -->
        <div class="action-panel">
          <button class="modal-close-btn" @click="closeModal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <h2 class="panel-title">导出预览</h2>
          <p class="panel-desc">将此应用的价格对比分享给他人。</p>

          <!-- 分享到 X -->
          <div class="share-x-section">
            <div class="share-x-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              <span>分享到 X</span>
            </div>
            <textarea class="share-textarea" readonly :value="shareText"></textarea>
          </div>

          <!-- POST to X 按钮 -->
          <button class="post-x-btn" @click="postToX">
            POST to
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </button>

          <!-- 操作成功提示 -->
          <div class="success-toast" v-if="copySuccess">{{ copySuccess }}</div>

          <!-- 底部三个操作按钮 -->
          <div class="action-buttons">
            <button class="action-btn" @click="copyLink" :disabled="isGenerating">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>复制链接</span>
            </button>
            <button class="action-btn" @click="copyImage" :disabled="isGenerating">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>复制图片</span>
            </button>
            <button class="action-btn" @click="downloadImage" :disabled="isGenerating">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>下载图片</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* === 遮罩层 === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* === 弹窗容器 === */
.modal-container {
  display: flex;
  background: #ffffff;
  border-radius: 24px;
  overflow: hidden;
  max-width: 820px;
  width: 95vw;
  max-height: 90vh;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@media (max-width: 768px) {
  .modal-container { flex-direction: column; max-height: 95vh; overflow-y: auto; }
}

/* === 左侧预览区 === */
.preview-area {
  background: linear-gradient(135deg, #f8fafc, #e2e8f0);
  padding: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 320px;
}

/* === 手机卡片外框 === */
.phone-frame {
  width: 260px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.12);
}

/* === 分享卡片本体 === */
.share-card {
  background: #ffffff;
  width: 260px;
  padding: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.card-brand-header {
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
}

.card-app-info {
  text-align: center;
  padding: 20px 20px 12px;
}
.card-app-icon {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  margin-bottom: 10px;
}
.card-app-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 3px;
}
.card-app-company {
  font-size: 12px;
  color: #94a3b8;
}

.card-currency-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  margin-bottom: 12px;
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
}

/* === 价格排行 === */
.card-price-list {
  padding: 0 16px;
}
.card-price-row {
  display: flex;
  align-items: center;
  padding: 8px 4px;
  border-bottom: 1px solid #f8fafc;
  gap: 8px;
}
.card-price-row.is-lowest {
  background: linear-gradient(90deg, #dcfce7, #f0fdf4);
  border-radius: 8px;
  border-bottom: none;
  margin-bottom: 2px;
}
.card-rank {
  width: 18px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-align: center;
}
.card-price-row.is-lowest .card-rank {
  color: #166534;
}
.card-flag {
  font-size: 16px;
  line-height: 1;
}
.card-region {
  flex: 1;
  font-size: 13px;
  color: #475569;
}
.card-region.bold {
  font-weight: 700;
  color: #0f172a;
}
.card-price {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
}
.card-price.highlight {
  color: #059669;
  font-weight: 800;
}
.lowest-tag {
  background: #dcfce7;
  color: #166534;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.card-more {
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  padding: 10px 0 6px;
}

/* === 卡片底部 === */
.card-footer-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  margin-top: 8px;
  border-top: 1px solid #f1f5f9;
}
.card-footer-title {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 2px;
}
.card-footer-desc {
  font-size: 10px;
  color: #94a3b8;
}
.card-qr-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  border-radius: 8px;
}

.card-powered {
  text-align: center;
  font-size: 9px;
  color: #cbd5e1;
  padding: 4px 0 12px;
}

/* === 右侧操作面板 === */
.action-panel {
  flex: 1;
  padding: 2rem;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 300px;
}

.modal-close-btn {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.modal-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.panel-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.5rem;
}
.panel-desc {
  color: #64748b;
  font-size: 0.95rem;
  margin: 0 0 1.5rem;
}

/* === 分享到 X === */
.share-x-section {
  margin-bottom: 1rem;
}
.share-x-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #0f172a;
  margin-bottom: 0.5rem;
}
.share-textarea {
  width: 100%;
  height: 80px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #475569;
  line-height: 1.5;
  resize: none;
  background: #f8fafc;
  font-family: inherit;
}

.post-x-btn {
  width: 100%;
  padding: 0.85rem;
  background: #0f172a;
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s;
  margin-bottom: 1rem;
}
.post-x-btn:hover {
  background: #1e293b;
}

/* === 成功提示 === */
.success-toast {
  text-align: center;
  color: #059669;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.5rem 0;
  animation: fadeIn 0.2s;
}

/* === 底部操作按钮组 === */
.action-buttons {
  display: flex;
  gap: 0.75rem;
  margin-top: auto;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 1rem 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #0f172a;
}
.action-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
