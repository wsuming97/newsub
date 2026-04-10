<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SiteNav from '../components/SiteNav.vue'
import SiteFooter from '../components/SiteFooter.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

// 'privacy' | 'terms' | 'disclaimer'
const activeTab = ref('privacy')

onMounted(() => {
  if (route.params.tab) {
    activeTab.value = route.params.tab
  }
})

function setTab(tab) {
  activeTab.value = tab
  router.replace(`/legal/${tab}`)
}

function goBack() {
  router.push('/')
}

const pageTitle = computed(() => {
  if (activeTab.value === 'privacy') return t('footer.privacy', '隐私政策')
  if (activeTab.value === 'terms') return t('footer.terms', '服务条款')
  if (activeTab.value === 'disclaimer') return t('footer.disclaimer', '免责声明')
  return t('footer.legal', '法律声明')
})
</script>

<template>
  <div class="legal-page">
    <SiteNav :showHomeBtn="true" :pageTitle="$t('footer.legal', '法律声明')" customClass="legal-header-nav" />

    <main class="legal-content">
      <div class="white-card layout-box">
        <aside class="sidebar">
          <button :class="['tab-link', { active: activeTab === 'privacy' }]" @click="setTab('privacy')">
            {{ $t('footer.privacy', '隐私政策') }}
          </button>
          <button :class="['tab-link', { active: activeTab === 'terms' }]" @click="setTab('terms')">
            {{ $t('footer.terms', '服务条款') }}
          </button>
          <button :class="['tab-link', { active: activeTab === 'disclaimer' }]" @click="setTab('disclaimer')">
            {{ $t('footer.disclaimer', '免责声明') }}
          </button>
        </aside>

        <section class="document-area">
          <h1 class="doc-title">{{ pageTitle }}</h1>
          <div class="doc-body prose">
            
            <!-- 隐私政策 -->
            <div v-if="activeTab === 'privacy'">
              <p>生效日期：2026年01月01日</p>
              <h3>1. 信息收集</h3>
              <p>我们提供的核心服务为“应用内购买与订阅价格”的公开数据查询，我们 <strong>不强制要求</strong> 用户进行注册，也不主动收集您的个人隐私身份信息（PII）。在您使用本平台时，为了向您提供多语言以及偏好设置，我们会通过浏览器的 <code>localStorage</code> 存储一些轻量的非敏感数据。</p>
              <h3>2. 数据分析</h3>
              <p>为了优化平台访问速度和改善页面设计，本网站可能会使用常规的访问分析工具（如 Google Analytics、Cloudflare 分析服务等）。这些工具收集的信息均为脱敏摘要数据。</p>
              <h3>3. 与第三方的链接</h3>
              <p>Youhu 包含指向外部应用商店（如 Apple App Store、Google Play）及其他第三方服务平台的链接。我们对这些外部站点的隐私保护措施及内容概不负责。在您访问或使用它们的服务时，请遵守其相应的隐私条款。</p>
            </div>

            <!-- 服务条款 -->
            <div v-else-if="activeTab === 'terms'">
              <p>最新修订：2026年01月01日</p>
              <h3>1. 接受条款</h3>
              <p>访问或使用 Youhu（全球 App 订阅比价平台），即表示您同意本《服务条款》。若您不同意以下任意条款，请停止使用本站服务。</p>
              <h3>2. 服务性质</h3>
              <p>Youhu 是一个旨在提供全球主流 App 在不同国家和地区定价汇率对比的信息聚合平台。平台致力于保证及时更新，但我们<strong>无法保证</strong>所有应用程序的价格绝对精确。产品售价受汇率波动、地区税收、订阅期调整的影响，实际价格请以各大区官方商店最终结算页为准。</p>
              <h3>3. 知识产权</h3>
              <p>平台中所展示的各种第三方 App 图标、应用名称均属其原权利人（软件开发商）所有。Youhu 仅作合理的信息展示，不存在侵犯其商标和版权的主观故意。</p>
            </div>

            <!-- 免责声明 -->
            <div v-else-if="activeTab === 'disclaimer'">
              <h3>1. 数据准确性声明</h3>
              <p>Youhu 所展示的订阅价格、功能特性以及智能折算结果均经过换算和计算。虽然我们力求数据的准确性与时效性，但<strong>本网站声明不对任何因使用我们的数据产生的直接或间接经济损失承担法律责任</strong>。</p>
              <h3>2. 购买决策说明</h3>
              <p>Youhu 提供所谓的“购买力平价推荐”旨在给用户提供参考。请注意，跨区购买订阅产品往往涉及平台服务商的条款风控限制（如 Apple 的礼品卡封号风险、跨区 IP 检测等）。本网站只是为您省钱提供信息指引，<strong>并不鼓励或怂恿任何违反所在地相关平台规定的跨区代购行为</strong>。因跨区消费导致账号被封禁或遭受资金损失，由使用者自行承担。</p>
            </div>

          </div>
        </section>
      </div>
    </main>
    <SiteFooter @navigate="nav => router.push(nav === 'home' ? '/' : '/')" />
  </div>
</template>

<style scoped>
.legal-page {
  padding-top: 6rem;
  padding-bottom: 4rem;
  background-color: var(--bg-color, #f8fafc);
  min-height: 100vh;
}

/* Navbar Specific Overrides (if any) */
:deep(.legal-header-nav .pill-nav) {
  background: rgba(220, 252, 231, 0.8);
}

.legal-content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 1rem;
}
.layout-box {
  display: flex;
  gap: 2rem;
  background: white;
  border-radius: 1.5rem;
  padding: 2.5rem;
  box-shadow: 0 4px 25px rgba(0,0,0,0.02);
}
@media (max-width: 768px) {
  .layout-box { flex-direction: column; padding: 1.5rem; }
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 180px;
}
.tab-link {
  text-align: left;
  background: transparent;
  border: none;
  font-size: 1.05rem;
  font-weight: 500;
  color: #64748b;
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab-link:hover { background: #f1f5f9; color: #0f172a; }
.tab-link.active {
  background: #f0fdf4;
  color: #166534;
  font-weight: 700;
}

.document-area {
  flex: 1;
}
.doc-title {
  font-size: 2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 1.5rem 0;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 1rem;
}
.doc-body {
  color: #334155;
  line-height: 1.8;
}
.doc-body h3 {
  font-size: 1.2rem;
  color: #0f172a;
  font-weight: 700;
  margin: 2rem 0 1rem;
}
.doc-body p {
  margin-bottom: 1rem;
}
.doc-body code {
  background: #f1f5f9;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9em;
}
</style>
