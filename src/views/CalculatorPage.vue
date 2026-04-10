<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { fetchConfig, DEFAULT_CONFIG } from '../data/api.js'
import SiteNav from '../components/SiteNav.vue'
import SiteFooter from '../components/SiteFooter.vue'

const router = useRouter()

const baseCurrencies = [
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'CNY', name: '人民币', symbol: '¥' }
]

// 计算器允许在后端配置缺失时维持可用，但一旦拿到 /api/config 就完全以后端为准。
const FALLBACK_REGIONS = [
  { id: 'us', name: '美国', code: 'USD', flag: '🇺🇸', rateToUSD: 1 },
  { id: 'cn', name: '中国', code: 'CNY', flag: '🇨🇳', rateToUSD: DEFAULT_CONFIG.cnyRates.USD },
  { id: 'ng', name: '尼日利亚', code: 'NGN', flag: '🇳🇬', rateToUSD: 1250 },
  { id: 'tr', name: '土耳其', code: 'TRY', flag: '🇹🇷', rateToUSD: 32 },
  { id: 'in', name: '印度', code: 'INR', flag: '🇮🇳', rateToUSD: 83.5 },
  { id: 'eg', name: '埃及', code: 'EGP', flag: '🇪🇬', rateToUSD: 47.3 },
  { id: 'za', name: '南非', code: 'ZAR', flag: '🇿🇦', rateToUSD: 18.2 },
  { id: 'pk', name: '巴基斯坦', code: 'PKR', flag: '🇵🇰', rateToUSD: 278.5 },
  { id: 'ar', name: '阿根廷', code: 'ARS', flag: '🇦🇷', rateToUSD: 860 },
  { id: 'ph', name: '菲律宾', code: 'PHP', flag: '🇵🇭', rateToUSD: 56.4 },
  { id: 'ua', name: '乌克兰', code: 'UAH', flag: '🇺🇦', rateToUSD: 39.5 }
]

const targetRegions = ref([...FALLBACK_REGIONS])
const basePrice = ref(9.99)
const baseCurrency = ref('USD')

onMounted(async () => {
  const config = await fetchConfig()
  if (!config.cnyRates) return

  const cnyPerUSD = config.cnyRates.USD || DEFAULT_CONFIG.cnyRates.USD
  if (config.regions?.length) {
    targetRegions.value = config.regions.map(region => ({
      id: region.code.toLowerCase(),
      name: region.name,
      code: region.currency,
      flag: region.flag,
      rateToUSD: config.cnyRates[region.currency]
        ? config.cnyRates[region.currency] / cnyPerUSD
        : 1
    }))
    return
  }

  targetRegions.value = FALLBACK_REGIONS.map(region => ({
    ...region,
    rateToUSD: config.cnyRates[region.code]
      ? config.cnyRates[region.code] / cnyPerUSD
      : region.rateToUSD
  }))
})

const calculatedPrices = computed(() => {
  const price = parseFloat(basePrice.value)
  if (Number.isNaN(price) || price <= 0) return []

  const cnyRateToUsd = targetRegions.value.find(region => region.code === 'CNY')?.rateToUSD || DEFAULT_CONFIG.cnyRates.USD
  const priceInUSD = baseCurrency.value === 'USD' ? price : price / cnyRateToUsd

  return targetRegions.value.map(region => {
    const rawLocalPrice = priceInUSD * region.rateToUSD

    // 这里保留一个可解释的“智能定价”近似算法，只负责演示不同地区的尾数策略和购买力折扣。
    let smartPrice = 0
    if (rawLocalPrice < 10) {
      smartPrice = Math.floor(rawLocalPrice) + 0.99
    } else if (rawLocalPrice < 100) {
      smartPrice = Math.round(rawLocalPrice)
      if (smartPrice % 10 !== 9 && smartPrice % 10 !== 0) {
        smartPrice = Math.floor(rawLocalPrice / 10) * 10 + 9.99
      }
    } else {
      smartPrice = Math.floor(rawLocalPrice / 10) * 10 + 9
    }

    if (region.code === 'CNY') smartPrice = Math.round(rawLocalPrice)
    if (region.code === 'INR') smartPrice = Math.floor(rawLocalPrice / 100) * 100 + 99
    if (region.code === 'NGN') smartPrice = Math.floor(rawLocalPrice / 100) * 100 + 900
    if (region.code === 'TRY') smartPrice = Math.floor(rawLocalPrice / 10) * 10 + 9.99
    if (region.code === 'USD') smartPrice = priceInUSD

    const isLowCostRegion = ['NGN', 'TRY', 'INR', 'EGP', 'ARS', 'PKR', 'UAH'].includes(region.code)
    if (isLowCostRegion && baseCurrency.value === 'USD') {
      smartPrice = smartPrice * 0.6
      if (smartPrice > 100) smartPrice = Math.floor(smartPrice / 10) * 10 + 9
      if (smartPrice > 1000) smartPrice = Math.floor(smartPrice / 100) * 100 + 90
    }

    return {
      ...region,
      rawPrice: rawLocalPrice.toFixed(2),
      smartPrice: smartPrice.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }),
      savings: region.code !== 'USD' && rawLocalPrice > smartPrice
        ? Math.round((rawLocalPrice - smartPrice) / rawLocalPrice * 100)
        : 0
    }
  }).sort((a, b) => {
    if (a.id === 'us') return -1
    if (b.id === 'us') return 1
    if (a.id === 'cn') return -1
    if (b.id === 'cn') return 1

    return (
      parseFloat(a.smartPrice.replace(/,/g, '')) / a.rateToUSD
    ) - (
      parseFloat(b.smartPrice.replace(/,/g, '')) / b.rateToUSD
    )
  })
})

function formatCurrency(num, code) {
  let locale = 'en-US'
  if (code === 'CNY') locale = 'zh-CN'
  if (code === 'TRY') locale = 'tr-TR'
  if (code === 'INR') locale = 'en-IN'
  if (code === 'ARS') locale = 'es-AR'

  return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(num)
}
</script>

<template>
  <div class="calculator-page">
    <SiteNav :showHomeBtn="true" customClass="calc-header-nav">
      <template #left>
        <button class="tab-btn active">
          <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
              <line x1="7" y1="4" x2="7" y2="20" />
            </svg>
          </span>
          {{ $t('footer.calculator') }}
        </button>
      </template>
    </SiteNav>

    <div class="calc-container">
      <div class="calc-header">
        <h1>App 定价计算器 <span class="badge">Pro</span></h1>
        <p>基于全球购买力平价与 App Store 常见尾数策略，快速估算一个订阅在不同地区的参考定价。</p>
      </div>

      <div class="calc-layout">
        <div class="calc-sidebar">
          <div class="input-card">
            <h3>基础设定</h3>

            <div class="input-group">
              <label>基准价格</label>
              <div class="currency-input-wrapper">
                <span class="currency-symbol">{{ baseCurrencies.find(currency => currency.code === baseCurrency)?.symbol }}</span>
                <input v-model="basePrice" type="number" min="0" step="0.01" class="price-input" />
              </div>
            </div>

            <div class="input-group">
              <label>基准币种</label>
              <div class="currency-selector">
                <button
                  v-for="currency in baseCurrencies"
                  :key="currency.code"
                  :class="['currency-btn', { active: baseCurrency === currency.code }]"
                  @click="baseCurrency = currency.code"
                >
                  {{ currency.code }}
                </button>
              </div>
            </div>

            <div class="info-alert">
              <span class="icon">ℹ️</span>
              <p>这里是辅助估算工具，不代表真实 App Store 最终结算价。真实价格请以实际商店页和税费规则为准。</p>
            </div>
          </div>
        </div>

        <div class="calc-results">
          <div class="results-header">
            <h3>全球多地区参考定价</h3>
            <span class="update-time">汇率基于当前后端配置</span>
          </div>

          <div class="results-grid">
            <div v-for="item in calculatedPrices" :key="item.id" class="result-card">
              <div class="rc-header">
                <div class="rc-flag">{{ item.flag }}</div>
                <div class="rc-name">
                  <h4>{{ item.name }}</h4>
                  <span>{{ item.code }}</span>
                </div>
              </div>

              <div class="rc-prices">
                <div class="price-intelligent">
                  <span class="label">智能定价</span>
                  <div class="amt">{{ formatCurrency(parseFloat(item.smartPrice.replace(/,/g, '')), item.code) }}</div>
                </div>
                <div class="price-raw">
                  <span class="label">汇率直换</span>
                  <div class="amt-raw">{{ item.rawPrice }}</div>
                </div>
              </div>

              <div v-if="item.savings > 0" class="saving-tag">
                购买力折扣 -{{ item.savings }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SiteFooter @navigate="nav => router.push(nav === 'home' ? '/' : '/')" />
  </div>
</template>

<style scoped>
.calculator-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 30%, #f0fdf4 100%);
  padding-top: 6rem;
  padding-bottom: 4rem;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

:deep(.calc-header-nav .pill-nav) {
  background: rgba(255, 255, 255, 0.7);
}

:deep(.calc-header-nav .tab-btn.active) {
  color: #2563eb;
}

.calc-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.calc-header {
  text-align: center;
  margin-bottom: 3rem;
}

.calc-header h1 {
  font-size: 2.5rem;
  color: #0f172a;
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.badge {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-size: 0.9rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-weight: 700;
}

.calc-header p {
  color: #64748b;
  font-size: 1.1rem;
  max-width: 680px;
  margin: 0 auto;
  line-height: 1.6;
}

.calc-layout {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
}

@media (max-width: 900px) {
  .calc-layout {
    flex-direction: column;
  }
}

.calc-sidebar {
  flex: 0 0 320px;
  width: 100%;
  position: sticky;
  top: 6rem;
}

.input-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.05);
}

.input-card h3 {
  margin: 0 0 1.5rem;
  font-size: 1.25rem;
  color: #1e293b;
}

.input-group {
  margin-bottom: 1.5rem;
}

.input-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.5rem;
}

.currency-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-symbol {
  position: absolute;
  left: 1rem;
  color: #64748b;
  font-weight: 600;
  font-size: 1.1rem;
}

.price-input {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  font-size: 1.1rem;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  color: #0f172a;
  font-weight: 600;
  transition: border-color 0.2s;
  outline: none;
}

.price-input:focus {
  border-color: #3b82f6;
}

.currency-selector {
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
}

.currency-btn {
  flex: 1;
  padding: 0.5rem;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.currency-btn.active {
  background: white;
  color: #2563eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.info-alert {
  background: #eff6ff;
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  gap: 0.75rem;
  margin-top: 2rem;
}

.info-alert .icon {
  font-size: 1.2rem;
}

.info-alert p {
  margin: 0;
  font-size: 0.8rem;
  color: #1e3a8a;
  line-height: 1.5;
}

.calc-results {
  flex: 1;
  width: 100%;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 1.5rem;
  padding: 0 0.5rem;
  gap: 1rem;
}

.results-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.update-time {
  font-size: 0.85rem;
  color: #94a3b8;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.result-card {
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
}

.rc-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.rc-flag {
  font-size: 1.8rem;
  line-height: 1;
}

.rc-name h4 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}

.rc-name span {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 600;
}

.rc-prices {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 0.5rem;
  gap: 1rem;
}

.label {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.price-intelligent .amt {
  font-size: 1.5rem;
  font-weight: 800;
  color: #10b981;
}

.price-raw {
  text-align: right;
}

.price-raw .amt-raw {
  font-size: 0.9rem;
  color: #94a3b8;
  text-decoration: line-through;
}

.saving-tag {
  position: absolute;
  top: 1rem;
  right: -1.5rem;
  background: #fef08a;
  color: #854d0e;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 1.5rem;
  transform: rotate(45deg);
}

@media (max-width: 640px) {
  .results-grid {
    grid-template-columns: 1fr;
  }

  .calc-container {
    padding: 0 1rem;
  }

  .calc-header h1 {
    font-size: 2rem;
  }

  .results-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
