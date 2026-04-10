<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  // 定义预设的返回首页按钮与分隔线
  showHomeBtn: { type: Boolean, default: false },
  // 组件附加样式类
  customClass: { type: String, default: '' },
  // 简易页面标题（如果设置，就会在左侧显示粗体文字）
  pageTitle: { type: String, default: '' }
})

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <header class="floating-header" :class="customClass">
    <nav class="pill-nav">
      
      <!-- [左侧] 标签与导航区 -->
      <div class="nav-tabs">
        <button v-if="showHomeBtn" class="tab-btn home-back-btn" @click="goHome">
          <span class="tab-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span class="tab-label">{{ $t('nav.home', '首页') }}</span>
        </button>

        <slot name="left"></slot>

        <!-- 简单的页面标题 -->
        <template v-if="pageTitle">
          <div v-if="showHomeBtn || $slots.left" class="nav-divider"></div>
          <span class="page-name">{{ pageTitle }}</span>
        </template>
      </div>

      <!-- 中间可能的分隔区，如果有图标 actions -->
      <div v-if="$slots.actions" class="nav-divider"></div>

      <!-- [右侧] 图标链接区，如 Twitter/Telegram -->
      <div v-if="$slots.actions" class="nav-actions">
        <slot name="actions"></slot>
      </div>

    </nav>
    
    <!-- 最外侧、与 pill-nav 平级的右边动作区（搜索、全网查价圈等） -->
    <div v-if="$slots.right" class="header-right-actions">
      <slot name="right"></slot>
    </div>
  </header>
</template>

<style scoped>
/* 悬浮导航基础布局 */
.floating-header {
  position: fixed;
  top: 1rem;
  left: 0;
  width: 100%;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

/* 胶囊主干 */
.pill-nav {
  display: flex;
  align-items: center;
  /* Home 页面用的毛玻璃风格，可被组件覆盖 */
  background: rgba(220, 252, 231, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 999px;
  padding: 0.35rem 1rem;
  box-shadow: 0 4px 15px rgba(0,0,0,0.03);
  border: 1px solid rgba(255,255,255,0.4);
}

.nav-tabs {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.nav-divider {
  width: 1px;
  height: 20px;
  background: rgba(0,0,0,0.1);
  margin: 0 0.75rem;
}

.nav-actions {
  display: flex;
  gap: 0.75rem;
}

.header-right-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

/* 常用按钮样式 - 共用样式，无需写在各页面中 */
:deep(.tab-btn) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 0.5rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
  white-space: nowrap;
}

:deep(.tab-btn:hover) {
  color: #0f172a;
}

:deep(.tab-btn.active) {
  background: #ffffff;
  color: var(--primary-color, #16a34a);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  font-weight: 600;
}

/* 对于仅仅是“返回首页”的按钮，在非主页稍微凸显样式 */
.home-back-btn {
  background: white !important;
  color: #166534 !important;
  box-shadow: 0 2px 5px rgba(0,0,0,0.02) !important;
  font-weight: 600 !important;
  padding: 0.4rem 1rem !important;
}
.home-back-btn:hover {
  background: #f0fdf4 !important;
}

:deep(.tab-icon) {
  display: inline-flex;
  font-size: 1.1rem;
}

:deep(.icon-btn) {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: 50%;
  transition: color 0.2s;
}

:deep(.icon-btn:hover) {
  color: #0f172a;
}

.page-name {
  font-weight: 700;
  color: #0f172a;
  padding: 0 0.5rem;
}
</style>
