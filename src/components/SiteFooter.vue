<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const router = useRouter()
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

const emit = defineEmits(['navigate'])
</script>

<template>
  <footer class="site-footer-full">
    <div class="footer-columns">
      <!-- 法律 -->
      <div class="footer-col">
        <h4>{{ $t('footer.legal') }}</h4>
        <ul>
          <li><a href="#" @click.prevent="router.push('/legal/privacy')">{{ $t('footer.privacy') }}</a></li>
          <li><a href="#" @click.prevent="router.push('/legal/terms')">{{ $t('footer.terms') }}</a></li>
          <li><a href="#" @click.prevent="router.push('/legal/disclaimer')">{{ $t('footer.disclaimer') }}</a></li>
        </ul>
      </div>
      <!-- 工具 -->
      <div class="footer-col">
        <h4>{{ $t('footer.tools') }}</h4>
        <ul>
          <li><a href="#" @click.prevent="emit('navigate', 'subscription')">{{ $t('footer.appList') }}</a></li>
          <li><a href="#" @click.prevent="router.push('/calculator')">{{ $t('footer.calculator') }}</a></li>
          <li>
            <div class="lang-switch" @click.stop="showLangMenu = !showLangMenu">
              <span>{{ languages.find(l => l.code === currentLang)?.flag }} {{ $t('nav.home') === 'Home' ? 'Switch Language' : '切换语言' }}</span>
              <div v-if="showLangMenu" class="lang-dropdown">
                <button
                  v-for="lang in languages"
                  :key="lang.code"
                  :class="['lang-option', { active: currentLang === lang.code }]"
                  @click.stop="switchLanguage(lang.code)"
                >
                  <span>{{ lang.flag }}</span>
                  <span>{{ lang.label }}</span>
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <!-- 其他应用 (小程序) -->
      <div class="footer-col">
        <h4>{{ $t('footer.others') }}</h4>
        <div class="mini-program-box">
          <div class="mp-placeholder">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01M7 12h10M12 7v10"></path>
            </svg>
          </div>
          <div class="mp-info">
            <h5>{{ $t('footer.wechatMini') }}</h5>
            <p>{{ $t('footer.wechatDesc') }}</p>
          </div>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <p>{{ $t('footer.copyright') }}</p>
      <p class="footer-disclaimer">{{ $t('footer.footerDisclaimer') }}</p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer-full {
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 4vw 2rem;
}
.footer-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.footer-col h4 {
  font-size: 0.95rem;
  font-weight: 700;
  color: #334155;
  margin: 0 0 1.25rem;
}
.footer-col ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.footer-col li a,
.footer-col li .lang-switch > span {
  font-size: 0.88rem;
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
  cursor: pointer;
}
.footer-col li a:hover,
.footer-col li .lang-switch > span:hover {
  color: #2563eb;
}

/* 小程序推荐位 */
.mini-program-box {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  background: #f8fafc;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.mp-placeholder {
  width: 60px;
  height: 60px;
  background: #fff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
}
.mp-info h5 {
  margin: 0 0 0.25rem 0;
  font-size: 0.9rem;
  color: #0f172a;
}
.mp-info p {
  margin: 0;
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
}
.footer-bottom {
  padding-top: 1.5rem;
  text-align: center;
}
.footer-bottom p {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0;
}
.footer-disclaimer {
  margin-top: 0.4rem !important;
  font-size: 0.75rem !important;
  color: #cbd5e1 !important;
}

/* 语言切换下拉 */
.lang-switch {
  position: relative;
  cursor: pointer;
}
.lang-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  border: 1px solid #e2e8f0;
  padding: 0.5rem;
  min-width: 160px;
  z-index: 50;
  margin-bottom: 0.5rem;
}
.lang-option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 0.88rem;
  color: #334155;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.lang-option:hover { background: #f1f5f9; }
.lang-option.active { background: #eff6ff; color: #2563eb; font-weight: 600; }

@media (max-width: 640px) {
  .footer-columns { grid-template-columns: repeat(2, 1fr); }
}
</style>
