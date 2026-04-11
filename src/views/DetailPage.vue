<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchAppById, fetchApps, fetchConfig } from '../data/api.js'
import ShareCardModal from '../components/ShareCardModal.vue'
import SearchModal from '../components/SearchModal.vue'
import SiteNav from '../components/SiteNav.vue'
import SiteFooter from '../components/SiteFooter.vue'

const route = useRoute()
const router = useRouter()

const appData = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const currentPlan = ref('')
const currentTab = ref('plan') // 'plan' or 'region'
const isShareModalOpen = ref(false)
const isSearchOpen = ref(false)
const allApps = ref([])
const isRefreshing = ref(false)
const serverState = ref({ stale: false, refreshing: false, fetchedAt: 0 })
let refreshPollInterval = null

async function loadApp(isPolled = false) {
  if (!isPolled) {
    isLoading.value = true
    loadError.value = ''
  }
  try {
    const response = await fetchAppById(route.params.id)
    if (response) {
      appData.value = response.data || response // 兼容旧版
      serverState.value = {
        stale: response.stale || false,
        refreshing: response.refreshing || false,
        fetchedAt: response.fetchedAt || 0
      }
    }

    if (appData.value?.id && appData.value.id !== route.params.id) {
      router.replace(`/app/${appData.value.id}`)
    }
    if (appData.value && appData.value.plans?.length > 0 && !currentPlan.value) {
      currentPlan.value = appData.value.plans[0]
    }
    
    // 如果后台在刷新，则静默轮询直到结束
    if (serverState.value.refreshing && !refreshPollInterval) {
      refreshPollInterval = setInterval(async () => {
        await loadApp(true) // polling mode
        if (!serverState.value.refreshing) {
          clearInterval(refreshPollInterval)
          refreshPollInterval = null
        }
      }, 5000)
    }
  } catch (e) {
    if (!isPolled) loadError.value = '加载失败，请检查网络连接'
    console.error('加载应用详情失败:', e)
  } finally {
    if (!isPolled) isLoading.value = false
  }
}

async function refreshData() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  await loadApp()
  setTimeout(() => { isRefreshing.value = false }, 800)
}

// 刷新汇率：重新从后端拉取最新实时汇率并应用到当前页面的价格换算
const isRefreshingRates = ref(false)
async function refreshRates() {
  if (isRefreshingRates.value) return
  isRefreshingRates.value = true
  try {
    const config = await fetchConfig()
    if (config.cnyRates) {
      currencies.value = CURRENCY_META.map(c => ({
        ...c,
        rate: c.code === 'CNY' ? 1 : (1 / (config.cnyRates[c.code] || 1))
      }))
    }
  } catch (e) {
    console.error('刷新汇率失败:', e)
  }
  setTimeout(() => { isRefreshingRates.value = false }, 800)
}

onMounted(async () => {
  loadApp()
  document.addEventListener('click', closeMenuOnOutsideClick)
  try {
    // 并行加载应用列表和全局配置（汇率）
    const [apps, config] = await Promise.all([fetchApps(), fetchConfig()])
    allApps.value = apps
    // 用后端汇率替换默认值：CNY_RATES 是 "1外币=?CNY"，前端 rate 需要 "1CNY=?外币"
    if (config.cnyRates) {
      currencies.value = CURRENCY_META.map(c => ({
        ...c,
        rate: c.code === 'CNY' ? 1 : (1 / (config.cnyRates[c.code] || 1))
      }))
    }
  } catch (e) {
    console.error('详情页初始化失败:', e)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick)
  if (refreshPollInterval) {
    clearInterval(refreshPollInterval)
    refreshPollInterval = null
  }
})

// === 汇率与金钱可视化系统 ===
// 展示用的货币列表元数据（符号、旗帜等不变，汇率来自后端）
const CURRENCY_META = [
  { code: 'CNY', symbol: '¥', name: '人民币(CNY)', flag: '🇨🇳' },
  { code: 'USD', symbol: '$', name: '美元(USD)', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: '欧元(EUR)', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: '英鎊(GBP)', flag: '🇬🇧' },
  { code: 'JPY', symbol: '¥', name: '日元(JPY)', flag: '🇯🇵' },
  { code: 'HKD', symbol: 'HK$', name: '港币(HKD)', flag: '🇭🇰' },
  { code: 'TWD', symbol: 'NT$', name: '新台币(TWD)', flag: '🇹🇼' },
]

// 动态汇率：从后端 /api/config 加载，避免硬编码
const currencies = ref(CURRENCY_META.map(c => ({
  ...c,
  rate: c.code === 'CNY' ? 1 : 0.138  // 初始默认值，加载后替换
})))

const targetCurrencyCode = ref('CNY')
const isCurrencyMenuOpen = ref(false)

const currentCurrency = computed(() => currencies.value.find(c => c.code === targetCurrencyCode.value))

function toggleCurrencyMenu(e) {
  e.stopPropagation()
  isCurrencyMenuOpen.value = !isCurrencyMenuOpen.value
}
function setCurrency(code) {
  targetCurrencyCode.value = code
  isCurrencyMenuOpen.value = false
}
function closeMenuOnOutsideClick(e) {
  if (isCurrencyMenuOpen.value) {
    isCurrencyMenuOpen.value = false
  }
}

// 换算核心
function convertPrice(cnyPrice) {
  return (cnyPrice * currentCurrency.value.rate).toFixed(2)
}
function formatPrice(cnyPrice) {
  return `${currentCurrency.value.symbol}${convertPrice(cnyPrice)}`
}

function formatPlanDisplayName(planName) {
  return planName || ''
}

const currentPlanDisplayName = computed(() => formatPlanDisplayName(currentPlan.value))

// === 数据获取系统 (套餐维度) ===
const currentPrices = computed(() => {
  if (!appData.value || !currentPlan.value) return []
  const prices = appData.value.prices[currentPlan.value] || []
  return [...prices].sort((a, b) => {
    const aRank = a.cny > 0 ? a.cny : Number.POSITIVE_INFINITY
    const bRank = b.cny > 0 ? b.cny : Number.POSITIVE_INFINITY
    if (aRank !== bRank) return aRank - bRank
    return a.region.localeCompare(b.region, 'zh-CN')
  })
})

// 有效价格列表（排除 cny=0 的未上架地区，用于最低价/图表等分析）
const validPrices = computed(() => currentPrices.value.filter(p => p.cny > 0))

const lowestPrice = computed(() => {
  if (validPrices.value.length === 0) return null
  return validPrices.value[0]
})

const maxPrice = computed(() => {
  if (validPrices.value.length === 0) return 0
  return Math.max(...validPrices.value.map(p => p.cny))
})

// === 数据获取系统 (地区维度交叉聚合) ===
const regionComparisonData = computed(() => {
  if (!appData.value) return []
  const regionMap = new Map()
  
  for (const planName of appData.value.plans) {
    const prices = appData.value.prices[planName] || []
    for (const price of prices) {
      if (!regionMap.has(price.region)) {
        regionMap.set(price.region, {
          region: price.region,
          flag: price.flag,
          plans: []
        })
      }
      regionMap.get(price.region).plans.push({
        planName,
        original: price.original,
        cny: price.cny
      })
    }
  }
  
  return Array.from(regionMap.values())
})

const regionCodeMap = {
  "尼日利亚": "NG", "埃及": "EG", "阿根廷": "AR", "土耳其": "TR",
  "巴基斯坦": "PK", "孟加拉国": "BD", "印度": "IN", "乌克兰": "UA",
  "越南": "VN", "印度尼西亚": "ID", "菲律宾": "PH", "哥伦比亚": "CO",
  "肯尼亚": "KE", "俄罗斯": "RU", "巴西": "BR", "墨西哥": "MX",
  "泰国": "TH", "马来西亚": "MY", "南非": "ZA", "智利": "CL",
  "美国": "US", "中国大陆": "CN", "中国香港": "HK", "中国台湾": "TW",
  "日本": "JP", "韩国": "KR", "新加坡": "SG", "澳大利亚": "AU",
  "加拿大": "CA", "英国": "UK", "德国": "DE", "法国": "FR",
  "沙特阿拉伯": "SA", "阿联酋": "AE"
}

const hoveredRegion = ref(null)

// === 价格分布图表算法 (CSS原生) ===
const priceDistribution = computed(() => {
  if (validPrices.value.length === 0 || maxPrice.value === 0) return []
  
  return validPrices.value.map(item => {
    const percentage = (item.cny / maxPrice.value) * 100
    // 智能上色：极品低价为纯绿色系，中等价为天蓝，高溢价为灰色
    let color = '#cbd5e1' 
    if (percentage <= 35) color = '#10b981' // Green
    else if (percentage <= 65) color = '#38bdf8' // Blue
    else color = '#94a3b8' // Slate

    return { ...item, percentage: percentage.toFixed(2), color, code: regionCodeMap[item.region] || item.region.substring(0, 2).toUpperCase() }
  }).slice(0, 10) // 截取前 10 条作为缩略图显示
})

function goBack() {
  router.push('/')
}



</script>

<template>
  <div class="detail-page" v-if="appData">
    <!-- 悬浮胶囊导航 -->
    <!-- 悬浮胶囊导航 -->
    <SiteNav showHomeBtn customClass="detail-header">
      <template #left>
        <button class="tab-btn active">
          <span class="tab-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
          <span class="tab-label">订阅</span>
        </button>
      </template>
      <template #actions>
        <button class="icon-btn" title="Twitter"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg></button>
        <button class="icon-btn" title="Telegram"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.68c.223-.198-.054-.31-.346-.11l-6.4 4.03-2.76-.872c-.6-.184-.613-.604.126-.89l10.82-4.17c.504-.18.96.113.82.887z"/></svg></button>
      </template>
      <template #right>
        <div class="search-bubble" @click="isSearchOpen = true">
          <button class="search-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
        </div>
      </template>
    </SiteNav>

    <div class="swr-banner" v-if="serverState.stale && serverState.refreshing">
      <span>正在静默刷新最新价格... (上次更新: {{ new Date(serverState.fetchedAt).toLocaleString() }})</span>
      <div class="swr-spinner"></div>
    </div>

    <div class="main-content">
      <!-- 顶部：巨幕 App 展板 -->
      <div class="white-card app-hero-panel">
        <div class="hero-layout">
          <img :src="appData.icon" :alt="appData.name" class="hero-icon" />
          <div class="hero-meta">
            <h1 class="hero-title">{{ appData.name }}</h1>
            <div class="hero-tags">
              <span class="company-text">{{ appData.company }}</span>
              <span class="dot-sep">•</span>
              <span class="category-text">{{ appData.category }}</span>
            </div>
            <p class="hero-desc">{{ appData.description }}</p>
          </div>
          <!-- 右边工具按钮 -->
          <div class="hero-tools">
            <button class="circle-icon-btn" title="导出分享卡片" @click="isShareModalOpen = true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="circle-icon-btn" :class="{ spinning: isRefreshing }" title="重新加载" @click="refreshData">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
            </button>
            <button class="circle-icon-btn delete-btn" title="移除应用" @click="handleDelete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 中部：多维对比工具条 -->
      <div class="workbench-bar">
        <div class="tabs-group">
          <button :class="['main-tab', { active: currentTab === 'plan' }]" @click="currentTab = 'plan'">套餐对比</button>
          <button :class="['main-tab', { active: currentTab === 'region' }]" @click="currentTab = 'region'">地区对比</button>
        </div>
        <div class="controls-group">
          <!-- 动态汇率下拉菜单 -->
          <div class="currency-dropdown-wrap">
            <div class="currency-dropdown" @click="toggleCurrencyMenu">
              <span class="flag-emoji">{{ currentCurrency.flag }}</span>
              <span class="cur-text">{{ currentCurrency.code }}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            
            <div class="dropdown-menu" v-if="isCurrencyMenuOpen">
              <div 
                v-for="currency in currencies" 
                :key="currency.code"
                class="dropdown-item"
                :class="{ active: currency.code === currentCurrency.code }"
                @click="setCurrency(currency.code)"
              >
                <span class="flag-emoji">{{ currency.flag }}</span>
                <span>{{ currency.name }}</span>
                <svg v-if="currency.code === currentCurrency.code" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
          </div>
          
          <button class="filter-btn" :class="{ spinning: isRefreshingRates }" title="刷新汇率" @click="refreshRates">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
          </button>
        </div>
      </div>

      <!-- 下部视图 A：套餐对比模式 -->
      <div v-if="currentTab === 'plan'" class="view-plan-compare">
        <!-- 套餐滑块 -->
        <div class="plan-pills-scroll">
          <button
            v-for="plan in appData.plans"
            :key="plan"
            :class="['plan-pill', { active: currentPlan === plan }]"
            @click="currentPlan = plan"
          >
            <span class="plan-name">{{ formatPlanDisplayName(plan) }}</span>
            <span class="plan-badge" v-if="plan.includes('1M')">1M</span>
            <span class="plan-badge" v-else-if="plan.includes('1Y')">1Y</span>
          </button>
        </div>

        <div class="price-data-grid">
          <!-- 左侧表格表单 -->
          <div class="white-card table-panel">
            <div class="table-header">
              <svg class="table-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <h2>{{ currentPlanDisplayName }} 全球价格</h2>
            </div>
            
            <table class="global-price-table">
              <thead>
                <tr>
                  <th width="12%">排名</th>
                  <th width="35%">地区</th>
                  <th width="28%">原价</th>
                  <th width="15%">{{ currentCurrency.code }}</th>
                  <th width="10%">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in currentPrices" :key="index" :class="{ 'row-unlisted': item.cny === 0 }">
                  <td class="rank-col">{{ item.cny > 0 ? (validPrices.findIndex(p => p.region === item.region) + 1 || '-') : '-' }}</td>
                  <td>
                    <div class="region-cell">
                      <span class="flag-emoji">{{ item.flag }}</span>
                      <span class="region-name">{{ item.region }}</span>
                    </div>
                  </td>
                  <td class="original-price">
                    <template v-if="item.cny > 0">{{ item.original }}</template>
                    <span v-else class="badge-unlisted">未上架</span>
                  </td>
                  <!-- 动态输出汇率计算值 -->
                  <td class="cny-price font-bold" :class="{'text-green': item === lowestPrice}">
                    <template v-if="item.cny > 0">{{ formatPrice(item.cny) }}</template>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td>
                    <span v-if="item === lowestPrice" class="badge-lowest green-tag" :style="item.is_estimated ? 'background:#fef08a;color:#854d0e;' : ''">
                      {{ item.is_estimated ? '估算' : '最低' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 右侧小部件 -->
          <div class="summary-stack">
            <!-- 最低价/估算参考价专属卡片 -->
            <div class="mint-card lowest-price-widget" v-if="lowestPrice" :style="lowestPrice.is_estimated ? 'background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%); color: #854d0e;' : ''">
              <div class="widget-top">
                <span class="widget-title" :style="lowestPrice.is_estimated ? 'color: #a16207;' : ''">{{ lowestPrice.is_estimated ? '估算参考价' : '最低价格' }}</span>
                <span class="new-tag" v-if="!lowestPrice.is_estimated">✨ NEW</span>
              </div>
              <div class="huge-price">{{ formatPrice(lowestPrice.cny) }}</div>
              <div class="country-pill-green" :style="lowestPrice.is_estimated ? 'background: #fde047; color: #854d0e;' : ''">
                <span class="flag-emoji">{{ lowestPrice.flag }}</span>
                <span>{{ lowestPrice.region }}</span>
              </div>
              <p class="saving-text" :style="lowestPrice.is_estimated ? 'color: #a16207;' : ''" v-if="lowestPrice.is_estimated">↘ Web端无内购，采用参考汇率</p>
              <p class="saving-text" v-else>↘ 比最高价省多达 {{ ((maxPrice - lowestPrice.cny) / maxPrice * 100).toFixed(0) }}%</p>
            </div>

            <div class="white-card chart-widget">
              <h3 class="chart-title">价格分布</h3>
              <div class="fake-bars">
                <div class="bar-row" v-for="node in priceDistribution" :key="node.region">
                  <span class="lbl font-bold">{{ node.code }}</span>
                  <div class="bar-wrap" @mouseenter="hoveredRegion = node.region" @mouseleave="hoveredRegion = null">
                    <div 
                      class="bar" 
                      :style="{ width: node.percentage + '%', backgroundColor: '#38bdf8' }"
                    ></div>
                    <!-- 悬浮时的弹窗提示 -->
                    <div class="custom-tooltip" v-if="hoveredRegion === node.region">
                      <div class="tooltip-title">{{ node.code }} • {{ node.region }}</div>
                      <div class="tooltip-original">{{ node.original }}</div>
                      <div class="tooltip-cny">{{ convertPrice(node.cny) }} {{ currentCurrency.code }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

       <!-- 下部视图 B：地区对比模式 (基于动态映射生成聚合视图) -->
       <div v-if="currentTab === 'region'" class="view-region-compare">
        <div class="region-filters">
          <button class="region-pill active">🌐 全部地区</button>
          <button class="region-pill" v-for="nation in regionComparisonData" :key="nation.region">
            {{ nation.flag }} {{ nation.region }}
          </button>
        </div>

        <div class="region-cards-grid">
          <div class="white-card region-card" v-for="regionData in regionComparisonData" :key="regionData.region">
            <h3 class="rc-title">
              <span class="flag-emoji">{{ regionData.flag }}</span>
              {{ regionData.region }}
            </h3>
            <div class="rc-plans-list">
              <div class="rc-row" v-for="plan in regionData.plans" :key="plan.planName">
                <span class="rc-plan-name">{{ formatPlanDisplayName(plan.planName) }}</span>
                <div class="rc-price-wrap">
                  <template v-if="plan.cny > 0">
                    <span class="rc-original-price text-muted">{{ plan.original }}</span>
                    <span class="rc-plan-price text-primary">(≈ {{ formatPrice(plan.cny) }})</span>
                  </template>
                  <span v-else class="badge-unlisted">未上架</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <SiteFooter @navigate="(nav) => router.push(nav === 'home' ? '/' : '/')" />

    <!-- 挂载分享卡片组件 -->
    <ShareCardModal 
      :isOpen="isShareModalOpen" 
      :appData="appData" 
      :currentPlan="currentPlan"
      :prices="currentPrices"
      :formatPrice="formatPrice"
      :currencyCode="targetCurrencyCode"
      @close="isShareModalOpen = false" 
    />
  </div>

  <!-- 加载中状态 -->
  <div class="detail-page loading-state" v-else-if="isLoading">
    <div class="main-content">
      <div class="white-card empty-state">
        <div class="loading-spinner-large"></div>
        <p>正在加载应用数据...</p>
      </div>
    </div>
  </div>

  <!-- 加载失败状态 -->
  <div class="detail-page error-state" v-else-if="loadError">
    <div class="main-content">
      <div class="white-card empty-state">
        <p style="color: #dc2626;">⚠️ {{ loadError }}</p>
        <button class="tab-btn" @click="loadApp" style="margin-top: 1rem;">重试</button>
        <button class="tab-btn" @click="goBack" style="margin-top: 0.5rem;">返回首页</button>
      </div>
    </div>
  </div>

  <!-- 未找到状态 -->
  <div class="detail-page not-found" v-else>
    <div class="main-content">
      <div class="white-card empty-state">
        <p>未找到该应用</p>
        <button class="tab-btn" @click="goBack">返回首页</button>
      </div>
    </div>
  </div>

  <SearchModal
    :isOpen="isSearchOpen"
    :apps="allApps"
    @close="isSearchOpen = false"
  />
</template>

<style scoped>
/* SWR (stale-while-revalidate) 顶部提示横幅 */
.swr-banner {
  background: #fef3c7;
  color: #92400e;
  padding: 0.8rem 1.2rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-size: 0.95rem;
  font-weight: 500;
  margin: 7rem auto 0 auto;
  max-width: 1100px;
  border: 1px solid #fde68a;
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
  animation: slideDownFade 0.3s ease-out;
}
@keyframes slideDownFade {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.swr-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(245, 158, 11, 0.3);
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.detail-page {
  padding-top: 5rem;
}
.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 4vw 4rem;
}

/* Navbar Specific Overrides (if any) */
:deep(.detail-header .pill-nav) {
  background: rgba(255, 255, 255, 0.75);
}
.search-bubble { background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid rgba(255,255,255,0.4); cursor: pointer; }
.search-btn { background: transparent; border: none; color: #475569; cursor: pointer; display: flex; }

/* === 基础卡片样式 === */
.white-card {
  background: #ffffff;
  border-radius: 2rem;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  padding: 2.5rem;
}

/* === App 巨幕展板 === */
.app-hero-panel {
  margin-bottom: 2rem;
}
.hero-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}
.hero-icon {
  width: 96px;
  height: 96px;
  border-radius: 24px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  flex-shrink: 0;
}
.hero-meta {
  flex: 1;
}
.hero-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.4rem 0;
}
.hero-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #475569;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  font-weight: 500;
}
.hero-desc {
  color: #64748b;
  font-size: 1rem;
  line-height: 1.6;
  margin: 0;
}
.hero-tools {
  display: flex;
  gap: 0.75rem;
}
.circle-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: transparent;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.circle-icon-btn:hover {
  background: #f8fafc;
  color: #0f172a;
  border-color: #cbd5e1;
}
.circle-icon-btn.spinning svg {
  animation: spin 1s linear infinite;
  color: var(--primary-color, #2563eb);
}
.delete-btn:hover {
  color: #ef4444;
  border-color: #fca5a5;
  background: #fef2f2;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* === 多维对比工作台 Bar === */
.workbench-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e2e8f0;
}
.tabs-group {
  display: flex;
}
.main-tab {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  font-weight: 600;
  color: #64748b;
  padding: 1rem 1.5rem;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
}
.main-tab.active {
  color: #0f172a;
  border-bottom-color: #0f172a;
}
.main-tab:hover:not(.active) {
  color: #475569;
}

.controls-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.5rem;
}

/* 下拉菜单实现 */
.currency-dropdown-wrap {
  position: relative;
}
.currency-dropdown {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  user-select: none;
}
.dropdown-menu {
  position: absolute;
  top: 110%;
  right: 0;
  width: 140px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  padding: 0.5rem;
  z-index: 500;
  display: flex;
  flex-direction: column;
}
.dropdown-item {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #475569;
  font-weight: 500;
  transition: background 0.2s;
}
.dropdown-item:hover {
  background: #f1f5f9;
}
.dropdown-item.active {
  background: #eff6ff;
  color: #2563eb;
}
.check-icon {
  margin-left: auto;
}

.filter-btn {
  background: white;
  border: 1px solid #e2e8f0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #475569;
  cursor: pointer;
}

/* === 套餐对比模式的横排胶囊 === */
.plan-pills-scroll {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  /* 允许惯性滚动，触屏体验更流畅 */
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  /* 右侧淡出遮罩提示还有更多套餐 */
  mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
  padding-right: 40px;
}
.plan-pills-scroll::-webkit-scrollbar { display: none; }
.plan-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.plan-pill:hover { border-color: #cbd5e1; }
.plan-pill.active {
  background: #ffffff;
  border-color: #ffffff;
  box-shadow: 0 4px 15px rgba(0,0,0,0.08);
  color: #0f172a;
}
.plan-badge {
  background: #f1f5f9;
  color: var(--primary-color);
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
  border-radius: 6px;
}

/* === 套餐对比的主数据网格 === */
.price-data-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
}
@media (max-width: 1024px) {
  .price-data-grid { grid-template-columns: 1fr; }
}

.table-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}
.table-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}
.global-price-table {
  width: 100%;
  border-collapse: collapse;
}
.global-price-table th {
  text-align: left;
  padding: 1rem 0;
  border-bottom: 1px solid #e2e8f0;
  color: #64748b;
  font-weight: 500;
  font-size: 0.9rem;
}
.global-price-table td {
  padding: 1.2rem 0;
  border-bottom: 1px solid #f1f5f9;
  color: #475569;
}
.global-price-table tr:last-child td { border-bottom: none; }
.rank-col { color: #94a3b8 !important; font-weight: 500; }
.region-cell { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; color: #0f172a;}
.original-price { color: #94a3b8; font-size: 0.9rem; }
.text-green { color: #059669; }
.green-tag { background: #dcfce7; color: #166534; padding: 0.3rem 0.8rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }

/* 右侧组件栈 */
.summary-stack {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.mint-card {
  background: #f0fdf4; /* 极浅薄荷绿 */
  border-radius: 1.5rem;
  padding: 2rem;
  border: 1px solid #dcfce7;
}
.widget-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.widget-title { color: #166534; font-weight: 700; font-size: 1.1rem; }
.new-tag { background: white; color: #166534; padding: 0.2rem 0.6rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600; box-shadow: 0 2px 4px rgba(22,101,52,0.1); }
.huge-price { font-size: 3rem; font-weight: 800; color: #0f172a; margin-bottom: 1rem; line-height: 1; }
.country-pill-green {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #dcfce7;
  color: #166534;
  padding: 0.4rem 1rem;
  border-radius: 99px;
  font-weight: 600;
  margin-bottom: 1.5rem;
}
.saving-text { color: #059669; font-weight: 600; font-size: 0.95rem; margin: 0; }

/* CSS动态物理绘制比例图 */
.chart-widget { padding: 2rem; border-radius: 1.5rem; }
.chart-title { font-size: 1.1rem; color: #0f172a; margin: 0 0 1.5rem 0; font-weight: 700; }
.fake-bars { display: flex; flex-direction: column; gap: 1.25rem; }
.bar-row { display: flex; align-items: center; gap: 1rem; position: relative; }
.lbl { width: 30px; font-size: 1rem; font-weight: 600; text-align: center; color: #0f172a; }
.bar-wrap { flex: 1; height: 16px; background: #f1f5f9; border-radius: 8px; overflow: visible; position: relative; cursor: pointer; }
.bar { height: 100%; border-radius: 8px; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); }

/* Custom Tooltip */
.custom-tooltip {
  position: absolute;
  top: -65px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  z-index: 10;
  min-width: 140px;
  pointer-events: none;
}
.custom-tooltip::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: white;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}
.tooltip-title { font-weight: 700; font-size: 0.95rem; color: #0f172a; }
.tooltip-original { color: #64748b; font-size: 0.85rem; }
.tooltip-cny { font-weight: 800; font-size: 1.05rem; color: #0f172a; }

/* === 地区对比模式网格 === */
.region-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.region-pill {
  background: transparent;
  border: none;
  font-size: 0.9rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.5rem 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
}
.region-pill:hover { color: #0f172a; }
.region-pill.active {
  background: white;
  color: #0f172a;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  font-weight: 600;
}

.region-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}
@media (max-width: 1200px) { .region-cards-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .region-cards-grid { grid-template-columns: 1fr; } }
.region-card { padding: 1.5rem; border-radius: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);}
.rc-title { margin: 0 0 1.5rem 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; font-weight: 700; color: #0f172a;}
.rc-plans-list { display: flex; flex-direction: column; gap: 1rem; }
.rc-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; }
.rc-plan-name { color: #475569; font-weight: 500; font-size: 0.85rem;}
.rc-price-wrap { display: flex; gap: 0.5rem; align-items: center; }
.rc-original-price { color: #94a3b8; font-size: 0.85rem;}
.rc-plan-price { color: var(--primary-color); font-weight: 600; }

.empty-state { text-align: center; padding: 4rem; color: #64748b; }
.font-bold { font-weight: 600; }

/* 未上架地区样式 */
.row-unlisted { opacity: 0.5; }
.badge-unlisted {
  display: inline-block;
  background: #f1f5f9;
  color: #94a3b8;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}
.text-muted { color: #94a3b8; }

/* 加载旋转器 */
.loading-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}
</style>
