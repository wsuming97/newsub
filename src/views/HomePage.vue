<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchConfig, fetchApps, RECOMMENDED_APPS } from '../data/api.js'
import SearchModal from '../components/SearchModal.vue'
import SiteFooter from '../components/SiteFooter.vue'
import SiteNav from '../components/SiteNav.vue'

const router = useRouter()
const currentNav = ref('home')
const isSearchOpen = ref(false)
const isLoading = ref(true)
const regionCount = ref(34)
const brokenLocalIcons = ref(new Set())

const navItems = [
  { key: 'home', labelKey: 'nav.home', icon: 'home' },
  { key: 'subscription', labelKey: 'nav.subscription', icon: 'grid' },
]

import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

// 多语言切换
const currentLang = ref(locale.value)
const languages = [
  { code: 'zh', label: '简体中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]
const showLangMenu = ref(false)

function switchLanguage(code) {
  currentLang.value = code
  locale.value = code
  localStorage.setItem('youhu_lang', code)
  showLangMenu.value = false
}

const loadError = ref('')

/**
 * 首页在冷启动阶段不再直接把“空 icon 的推荐列表”裸展示给用户，
 * 而是先显示骨架屏，等 /api/apps 首次返回后再渲染真实列表。
 * 这样可以把“全是占位符头像”的第一印象改成更稳定的加载态。
 */
async function loadHomeData(isRetry = false) {
  if (!isRetry) {
    isLoading.value = true
  }
  loadError.value = ''

  try {
    const config = await fetchConfig()
    if (config.regionCount) regionCount.value = config.regionCount

    const data = await fetchApps()
    if (data && data.length > 0) {
      apps.value = mergeAppsWithSeed(data)
    } else if (!apps.value.length) {
      apps.value = [...RECOMMENDED_APPS]
    }
  } catch (error) {
    console.error('首页加载失败:', error)
    loadError.value = '首页数据加载失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const LOCAL_ICON_ALIASES = {
  'ChatGPT': 'chatgpt',
  'Claude': 'claude',
  'Grok': 'grok',
  'Telegram': 'telegram',
  'X': 'x',
  'Discord': 'discord',
  'Snapchat': 'snapchat',
  'Spotify': 'spotify',
  'YouTube': 'youtube',
  'Netflix': 'netflix',
  'Disney+': 'disney-plus',
  'Notion': 'notion',
  'Figma': 'google-gemini',
  'Dropbox': 'dropbox',
  'GoodNotes': 'goodnotes',
  'Canva': 'canva',
  'Calm': 'calm',
  'Strava': 'strava',
  'Headspace': 'headspace',
  'Duolingo': 'duolingo',
  'NordVPN': 'nordvpn',
  'ExpressVPN': 'expressvpn',
  '1Password': '1password',
  'iCloud+': 'icloud',
  'Google Gemini': 'google-gemini',
  'GitHub Copilot': 'github-copilot',
}

function resolveLocalIconSlug(name) {
  if (!name) return ''
  if (LOCAL_ICON_ALIASES[name]) return LOCAL_ICON_ALIASES[name]

  return name
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getAppIcon(app) {
  if (app?.icon) return app.icon

  const slug = resolveLocalIconSlug(app?.name)
  if (!slug || brokenLocalIcons.value.has(slug)) return ''
  return `/icons/${slug}.webp`
}

function markLocalIconBroken(app) {
  const slug = resolveLocalIconSlug(app?.name)
  if (!slug) return
  const next = new Set(brokenLocalIcons.value)
  next.add(slug)
  brokenLocalIcons.value = next
}

function goToDetail(appStoreId) {
  // 注意：在模板里有些地方传的是 app.id，有些传的是 appStoreId
  // 原生 API 里是 id，但我们的数据结构改成了 appStoreId
  router.push(`/app/${appStoreId}`)
}

// 用户从搜索结果中选中某个应用 → 直接跳转详情页（实时抓取）
function handleSearchSelect(app) {
  isSearchOpen.value = false
  router.push(`/app/${app.appStoreId || app.id}`)
}

const apps = ref([...RECOMMENDED_APPS])

function mergeAppsWithSeed(incomingApps = []) {
  const merged = new Map(
    RECOMMENDED_APPS.map(app => [app.appStoreId || app.id, { ...app }])
  )

  for (const app of incomingApps) {
    const key = app.appStoreId || app.id
    merged.set(key, {
      ...(merged.get(key) || {}),
      ...app,
    })
  }

  return Array.from(merged.values())
}

const groupedApps = computed(() => {
  const catMap = {}
  for (const app of apps.value) {
    if (!catMap[app.category]) catMap[app.category] = []
    catMap[app.category].push(app)
  }
  return Object.entries(catMap).map(([name, apps]) => ({ name, apps }))
})

// 随便截取部分推荐的，当作主打应用（Featured）
const featuredApps = computed(() => {
  return apps.value.slice(0, 12)
})

// 统计数据
const stats = computed(() => {
  const plans = apps.value.reduce((acc, a) => acc + (a.plansCount || 0), 0)
  return {
    apps: apps.value.length,
    plans: plans, // 现在可以展示了
    regions: regionCount.value,
    categories: new Set(apps.value.map(a => a.category)).size
  }
})

let pollingInterval = null

onMounted(async () => {
  await loadHomeData()
  
  // 开始轮询：每隔 5 秒刷新一次应用列表（为了让后台预热完的 plansCount 和图标能在前台更新）
  pollingInterval = setInterval(async () => {
    try {
      const freshData = await fetchApps()
      if (freshData && freshData.length > 0) {
        apps.value = mergeAppsWithSeed(freshData)
      }
    } catch (error) {
      console.error('首页轮询刷新失败:', error)
    }
  }, 5000)
})

onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval)
})
</script>

<template>
  <div class="home-page">
    <!-- 顶部悬浮导航 -->
    <SiteNav customClass="home-header">
      <template #left>
        <button
          v-for="item in navItems"
          :key="item.key"
          :class="['tab-btn', { active: currentNav === item.key }]"
          @click="currentNav = item.key"
        >
          <span class="tab-icon">
            <svg v-if="item.icon === 'home'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <svg v-else-if="item.icon === 'grid'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </span>
          <span class="tab-label">{{ $t(item.labelKey) }}</span>
        </button>
      </template>

      <template #actions>
        <button class="icon-btn" title="Twitter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
        </button>
        <button class="icon-btn" title="Telegram">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.68c.223-.198-.054-.31-.346-.11l-6.4 4.03-2.76-.872c-.6-.184-.613-.604.126-.89l10.82-4.17c.504-.18.96.113.82.887z"/></svg>
        </button>
      </template>

      <template #right>
        <div class="search-bubble" @click="isSearchOpen = true">
          <button class="search-btn" title="搜索 (Ctrl+K)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      </template>
    </SiteNav>

    <SearchModal
      :isOpen="isSearchOpen"
      :apps="apps"
      @close="isSearchOpen = false"
    />

    <!-- 加载错误提示 -->
    <div v-if="loadError" class="load-error-banner">
      <div class="error-card">
        <p>⚠️ {{ loadError }}</p>
        <button class="retry-btn" @click="loadHomeData(true)">重试</button>
      </div>
    </div>

    <!-- ========================================= -->
    <!-- 视图 A：落地页（首页 Tab）                  -->
    <!-- ========================================= -->
    <div v-if="currentNav === 'home'" class="landing-page">
      
      <!-- Hero 主视觉区 -->
      <section class="hero-section">
        <div class="hero-glow"></div>
        <div class="hero-content">
          <div class="hero-badge">
            <span class="badge-dot"></span>
            <span>{{ $t('hero.badge', { regions: stats.regions }) }}</span>
          </div>
          <h1 class="hero-title" v-html="$t('hero.title', { highlight: `<span class='gradient-text'>${$t('hero.highlight')}</span>` })">
          </h1>
          <p class="hero-subtitle" v-html="$t('hero.subtitle', { apps: stats.apps })">
          </p>
          <div class="hero-actions">
            <button class="cta-primary" @click="isSearchOpen = true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              搜索全网应用
            </button>
            <button class="cta-secondary" @click="currentNav = 'subscription'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              {{ $t('hero.startBtn') }}
            </button>
          </div>
        </div>
      </section>

      <!-- 数据统计条 -->
      <section class="stats-bar" v-if="!isLoading">
        <div class="stat-item">
          <span class="stat-number">{{ stats.apps }}</span>
          <span class="stat-label">{{ $t('stats.apps') }}</span>
        </div>
        <div class="stat-divider" v-if="stats.plans > 0"></div>
        <div class="stat-item" v-if="stats.plans > 0">
          <span class="stat-number">{{ stats.plans }}</span>
          <span class="stat-label">{{ $t('stats.plans') }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-number">{{ stats.regions }}</span>
          <span class="stat-label">{{ $t('stats.regions') }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-number">{{ stats.categories }}</span>
          <span class="stat-label">{{ $t('stats.categories') }}</span>
        </div>
      </section>

      <!-- 骨架屏占位：统计条 -->
      <section class="stats-bar skeleton-stats" v-if="isLoading">
        <div class="skeleton-shimmer" style="width: 100%; height: 100%; position: absolute; top:0; left:0; border-radius: 2rem;"></div>
      </section>

      <!-- 热门应用精选 -->
      <section class="featured-section" v-if="!isLoading && featuredApps.length">
        <div class="section-header">
          <h2 class="section-title">🔥 热门应用</h2>
          <button class="see-all-btn" @click="currentNav = 'subscription'">查看全部 →</button>
        </div>
        <div class="featured-grid">
          <div
            v-for="app in featuredApps"
            :key="app.appStoreId"
            class="featured-card"
            @click="goToDetail(app.appStoreId)"
          >
            <div class="fc-top">
              <img v-if="getAppIcon(app)" :src="getAppIcon(app)" :alt="app.name" class="fc-icon" @error="markLocalIconBroken(app)" />
              <div v-else class="fc-icon fc-icon-placeholder" :style="{ background: `hsl(${(app.name || '').charCodeAt(0) * 37 % 360}, 55%, 55%)` }">{{ (app.name || '?')[0] }}</div>
              <div class="fc-meta">
                <h3 class="fc-name">{{ app.name }}</h3>
                <span class="fc-company">{{ app.company || 'App Store' }}</span>
              </div>
            </div>
            <p class="fc-desc">{{ app.description || '点击查看实时全球价格对比...' }}</p>
            <div class="fc-bottom">
              <span class="fc-category">{{ app.category }}</span>
              <span class="fc-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 骨架屏占位：热门应用 -->
      <section class="featured-section" v-if="isLoading">
        <div class="section-header">
          <div class="skeleton-shimmer" style="width: 150px; height: 30px; border-radius: 8px;"></div>
        </div>
        <div class="featured-grid">
          <div class="featured-card" v-for="i in 3" :key="i" style="position: relative; height: 160px; overflow: hidden;">
            <div class="skeleton-shimmer" style="width: 100%; height: 100%; position: absolute; top:0; left:0;"></div>
          </div>
        </div>
      </section>

      <section class="features-section">
        <h2 class="section-title">{{ $t('features.title') }}</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon-wrap green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <h3>{{ $t('features.global') }}</h3>
            <p>{{ $t('features.globalDesc') }}</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon-wrap blue">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <circle cx="12" cy="12" r="2"></circle>
                <path d="M6 12h.01M18 12h.01"></path>
              </svg>
            </div>
            <h3>{{ $t('features.save') }}</h3>
            <p>{{ $t('features.saveDesc') }}</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon-wrap purple">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
                <line x1="2" y1="20" x2="22" y2="20"></line>
              </svg>
            </div>
            <h3>{{ $t('features.viz') }}</h3>
            <p>{{ $t('features.vizDesc') }}</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon-wrap orange">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <h3>{{ $t('features.free') }}</h3>
            <p>{{ $t('features.freeDesc') }}</p>
          </div>
        </div>
      </section>

      <!-- 使用方法 -->
      <section class="howto-section">
        <h2 class="section-title">{{ $t('howto.title') }}</h2>
        <div class="steps-row">
          <div class="step-card">
            <div class="step-number">1</div>
            <h3>{{ $t('howto.step1Title') }}</h3>
            <p>{{ $t('howto.step1Desc') }}</p>
          </div>
          <div class="step-connector">
            <svg width="40" height="2"><line x1="0" y1="1" x2="40" y2="1" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4,4"/></svg>
          </div>
          <div class="step-card">
            <div class="step-number">2</div>
            <h3>{{ $t('howto.step2Title') }}</h3>
            <p>{{ $t('howto.step2Desc') }}</p>
          </div>
          <div class="step-connector">
            <svg width="40" height="2"><line x1="0" y1="1" x2="40" y2="1" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4,4"/></svg>
          </div>
          <div class="step-card">
            <div class="step-number">3</div>
            <h3>{{ $t('howto.step3Title') }}</h3>
            <p>{{ $t('howto.step3Desc') }}</p>
          </div>
        </div>
      </section>

      <!-- 底部 CTA -->
      <section class="bottom-cta">
        <div class="cta-card">
          <h2>{{ $t('bottomCta.title') }}</h2>
          <p>{{ $t('bottomCta.desc', { apps: stats.apps }) }}</p>
          <button class="cta-primary large" @click="currentNav = 'subscription'">
            {{ $t('bottomCta.btn') }}
          </button>
        </div>
      </section>

    </div>

    <!-- ========================================= -->
    <!-- 视图 B：订阅列表（订阅 Tab）               -->
    <!-- ========================================= -->
    <div v-if="currentNav === 'subscription'" class="main-content">
      <!-- 骨架屏占位：分类列表 -->
      <div v-if="isLoading">
        <div v-for="i in 2" :key="i" class="category-section">
          <div class="skeleton-shimmer" style="width: 200px; height: 30px; border-radius: 8px; margin-bottom: 1.5rem;"></div>
          <div class="app-grid">
            <div v-for="j in 4" :key="j" class="app-card" style="height: 180px; position: relative; overflow: hidden;">
              <div class="skeleton-shimmer" style="width: 100%; height: 100%; position: absolute; top:0; left:0;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 实际列表内容 -->
      <div v-else>
        <div v-for="group in groupedApps" :key="group.name" class="category-section">
          <h2 class="category-title">{{ group.name }}</h2>
          <div class="app-grid">
          <div
            v-for="app in group.apps"
            :key="app.appStoreId"
            class="app-card"
            @click="goToDetail(app.appStoreId)"
          >
            <div class="card-body">
              <div class="card-header">
                <img v-if="getAppIcon(app)" :src="getAppIcon(app)" :alt="app.name" class="card-icon" @error="markLocalIconBroken(app)" />
                <div v-else class="card-icon card-icon-placeholder" :style="{ background: `hsl(${(app.name || '').charCodeAt(0) * 37 % 360}, 55%, 55%)` }">{{ (app.name || '?')[0] }}</div>
                <div class="card-meta">
                  <h3 class="card-name">{{ app.name }}</h3>
                  <p class="card-company">{{ app.company }}</p>
                </div>
                <div class="card-action-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
              <p class="card-desc">{{ app.description }}</p>
            </div>
            <div class="card-footer">
              <span class="category-pill">{{ app.category }}</span>
              <span class="plan-count" v-if="app.plansCount > 0">{{ $t('app.plansCount', { count: app.plansCount }) }}</span>
              <span class="plan-count plan-count-zero" v-else>{{ $t('app.zeroPlans') }}</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
    <!-- 统一底部页脚 -->
    <SiteFooter @navigate="nav => currentNav = nav" />
  </div>
</template>

<style scoped>
.home-page {
  padding-top: 5rem;
}

/* 骨架屏动画 */
.skeleton-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton-stats {
  position: relative;
  min-height: 120px;
  overflow: hidden;
  padding: 0;
}

/* ============================================ */
/* 右侧悬浮按钮样式（只保留特定页面级样式）     */
/* ============================================ */
.search-bubble { background: rgba(220, 252, 231, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid rgba(255,255,255,0.4); cursor: pointer; }
.add-bubble { background: #2563eb; border: 1px solid #3b82f6; cursor: pointer; transition: all 0.2s; }
.add-bubble .search-btn { color: white; }
.add-bubble:hover { background: #1d4ed8; transform: scale(1.05); }
.search-btn { background: transparent; border: none; color: #475569; cursor: pointer; display: flex; }

/* ============================================ */
/* 落地页样式                                    */
/* ============================================ */

.landing-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 4vw 2rem;
}

/* --- Hero --- */
.hero-section {
  position: relative;
  text-align: center;
  padding: 5rem 2rem 4rem;
  overflow: hidden;
}
.hero-glow {
  position: absolute;
  top: -5rem;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 400px;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.12) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
.hero-content {
  position: relative;
  z-index: 1;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.15);
  border-radius: 999px;
  padding: 0.4rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #2563eb;
  margin-bottom: 2rem;
}
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse-dot 2s infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.5); }
}
.hero-title {
  font-size: 3.5rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
  margin: 0 0 1.5rem;
  letter-spacing: -0.02em;
}
.gradient-text {
  background: linear-gradient(135deg, #2563eb, #7c3aed, #ec4899);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-subtitle {
  font-size: 1.2rem;
  color: #64748b;
  line-height: 1.8;
  margin: 0 auto 2.5rem;
  max-width: 600px;
}
.hero-subtitle strong {
  color: #059669;
  font-weight: 700;
}
.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}
.cta-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white;
  border: none;
  padding: 0.9rem 2rem;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
  font-family: inherit;
}
.cta-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(37, 99, 235, 0.4);
}
.cta-primary.large {
  padding: 1.1rem 2.5rem;
  font-size: 1.15rem;
  border-radius: 16px;
}
.cta-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  background: white;
  color: #334155;
  border: 1.5px solid #e2e8f0;
  padding: 0.9rem 2rem;
  border-radius: 14px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}
.cta-secondary:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: #f8fafc;
}

/* --- Stats Bar --- */
.stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2.5rem;
  background: white;
  border-radius: 2rem;
  padding: 2rem 3rem;
  margin: 0 0 4rem;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}
.stat-number {
  font-size: 2.5rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}
.stat-label {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 500;
}
.stat-divider {
  width: 1px;
  height: 40px;
  background: #e2e8f0;
}

/* --- Section shared --- */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 2rem;
}
.see-all-btn {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.2s;
}
.see-all-btn:hover { opacity: 0.7; }

/* --- Featured Grid --- */
.featured-section {
  margin-bottom: 4rem;
}
.featured-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}
@media (max-width: 1024px) { .featured-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .featured-grid { grid-template-columns: 1fr; } }

.featured-card {
  background: white;
  border-radius: 1.5rem;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
}
.featured-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 30px rgba(0,0,0,0.08);
}
.fc-top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.fc-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.fc-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
}
.fc-meta { flex: 1; min-width: 0; }
.fc-name { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-company { font-size: 0.8rem; color: #94a3b8; margin: 0.15rem 0 0; }
.fc-plans-badge {
  flex-shrink: 0;
  background: #dcfce7;
  color: #166534;
  padding: 0.25rem 0.7rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
}
.fc-desc {
  font-size: 0.88rem;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 1rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.fc-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
}
.fc-category {
  font-size: 0.75rem;
  color: #475569;
  font-weight: 500;
  background: #f1f5f9;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
}
.fc-arrow { color: #cbd5e1; transition: color 0.2s; }
.featured-card:hover .fc-arrow { color: #2563eb; }

/* --- Features --- */
.features-section {
  margin-bottom: 4rem;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}
@media (max-width: 1024px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .features-grid { grid-template-columns: 1fr; } }

.feature-card {
  background: white;
  border-radius: 1.5rem;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  transition: transform 0.3s;
}
.feature-card:hover { transform: translateY(-2px); }
.feature-card h3 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 1rem 0 0.5rem; }
.feature-card p { font-size: 0.9rem; color: #64748b; line-height: 1.6; margin: 0; }
.feature-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.feature-icon-wrap svg { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.feature-card:hover .feature-icon-wrap svg { transform: scale(1.15) rotate(-5deg); }
.feature-icon-wrap.green { background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #166534; }
.feature-icon-wrap.blue { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1e3a8a; }
.feature-icon-wrap.purple { background: linear-gradient(135deg, #ede9fe, #ddd6fe); color: #4c1d95; }
.feature-icon-wrap.orange { background: linear-gradient(135deg, #ffedd5, #fed7aa); color: #9a3412; }

/* --- How to Use --- */
.howto-section {
  margin-bottom: 4rem;
}
.steps-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}
.step-card {
  background: white;
  border-radius: 1.5rem;
  padding: 2rem;
  text-align: center;
  flex: 1;
  max-width: 280px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
}
.step-card h3 { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 1rem 0 0.5rem; }
.step-card p { font-size: 0.88rem; color: #64748b; line-height: 1.6; margin: 0; }
.step-number {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: white;
  font-size: 1.2rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-connector {
  display: flex;
  align-items: center;
  padding-top: 2.5rem;
}
@media (max-width: 768px) {
  .steps-row { flex-direction: column; align-items: center; gap: 1rem; }
  .step-connector { transform: rotate(90deg); padding: 0; }
}

/* --- Bottom CTA --- */
.bottom-cta {
  margin-bottom: 3rem;
}
.cta-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border-radius: 2rem;
  padding: 4rem 2rem;
  text-align: center;
}
.cta-card h2 {
  font-size: 2rem;
  font-weight: 800;
  color: white;
  margin: 0 0 0.75rem;
}
.cta-card p {
  color: #94a3b8;
  font-size: 1.1rem;
  margin: 0 0 2rem;
}
@media (max-width: 640px) {
  .hero-title { font-size: 2.2rem; }
  .hero-subtitle { font-size: 1rem; }
  .stats-bar { flex-wrap: wrap; gap: 1.5rem; padding: 1.5rem; }
  .stat-divider { display: none; }
  .hide-mobile { display: none; }
}

/* ============================================ */
/* 订阅列表页样式（保留原有）                     */
/* ============================================ */
.main-content { max-width: 1800px; margin: 0 auto; padding: 2rem 4vw 4rem; }
.category-section { margin-bottom: 4rem; }
.category-title { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 1.5rem; display: flex; align-items: center; }
.category-title::before { content: ''; display: inline-block; width: 4px; height: 20px; background: var(--primary-color); border-radius: 99px; margin-right: 0.75rem; }
.app-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
@media (max-width: 768px) { .app-grid { grid-template-columns: minmax(0, 1fr); } }
@media (min-width: 1100px) { .app-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1440px) { .app-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.app-card { background: #ffffff; border-radius: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.02); padding: 2rem; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.app-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
.card-body { min-width: 0; }
.card-header { display: flex; align-items: center; gap: 1rem; width: 100%; }
.card-icon { flex-shrink: 0; width: 72px; height: 72px; border-radius: 18px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card-icon-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
}
.card-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.card-name { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0 0 0.3rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-company { font-size: 0.85rem; color: #64748b; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-action-icon { flex-shrink: 0; color: #cbd5e1; transition: color 0.2s; }
.app-card:hover .card-action-icon { color: #94a3b8; }
.card-desc { font-size: 0.95rem; color: #475569; line-height: 1.6; margin: 1.25rem 0 0 0; height: 3.1em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-footer { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-width: 0; }
.category-pill { background: #f1f5f9; color: #334155; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; }
.plan-count { font-size: 0.85rem; font-weight: 600; color: #2563eb; flex-shrink: 0; white-space: nowrap; }
.plan-count-zero { color: #94a3b8; }

/* 加载错误提示 */
.load-error-banner {
  max-width: 600px;
  margin: 6rem auto 2rem;
  padding: 0 1rem;
}
.error-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 16px;
  padding: 1.5rem 2rem;
  text-align: center;
}
.error-card p {
  margin: 0 0 1rem;
  color: #dc2626;
  font-weight: 600;
}
.retry-btn {
  background: #dc2626;
  color: white;
  border: none;
  padding: 0.5rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.retry-btn:hover { background: #b91c1c; }
</style>
