import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    nav: {
      home: '首页',
      subscription: '订阅'
    },
    hero: {
      badge: '全球 {regions} 个国家/地区实时比价',
      title: '发现全球{highlight}App 订阅',
      highlight: '最低价',
      subtitle: '对比 {apps} 款热门应用在全球各地区的订阅价格，<br/>帮你找到最划算的购买区域，每年节省高达 <strong>60%</strong> 订阅开支。',
      startBtn: '浏览全部应用',
      addBtn: '比价查询'
    },
    stats: {
      apps: '热门应用',
      plans: '订阅套餐',
      regions: '国家地区',
      categories: '应用分类'
    },
    features: {
      title: '为什么选择优惠 Youhu',
      global: '全球比价',
      globalDesc: '覆盖尼日利亚、土耳其、印度等 11 个主流低价区，一眼看清哪里最便宜。',
      save: '省钱利器',
      saveDesc: '同一个订阅，不同地区价格相差最高可达 60%。切换区域即可大幅节省。',
      viz: '清晰可视化',
      vizDesc: '套餐对比 + 地区对比双视图，还有汇率实时换算，数据一目了然。',
      free: '开源免费',
      freeDesc: '完全免费使用，无需注册登录。代码开源，数据透明，社区驱动。'
    },
    howto: {
      title: '如何使用',
      step1Title: '选择应用',
      step1Desc: '在订阅列表中找到你正在使用或想要购买的应用。',
      step2Title: '对比价格',
      step2Desc: '查看该应用在全球各地区的订阅价格，找出最低价区域。',
      step3Title: '省钱订阅',
      step3Desc: '切换 App Store 区域到低价区，用最优惠的价格完成订阅。'
    },
    bottomCta: {
      title: '准备好省钱了吗？',
      desc: '立即查看 {apps} 款热门应用的全球价格对比',
      btn: '浏览全部应用 →'
    },
    footer: {
      legal: '法律',
      privacy: '隐私政策',
      terms: '服务条款',
      disclaimer: '免责声明',
      tools: '工具',
      appList: '应用列表',
      calculator: '定价计算器',
      others: '其他应用',
      wechatMini: '微信小程序版',
      wechatDesc: '扫码体验更便捷的移动端订阅比价与管理。',
      copyright: '© 2026 优惠 Youhu. 保留所有权利',
      footerDisclaimer: '数据仅供参考，实际价格以 App Store 为准。本站与 Apple Inc. 无任何关联。'
    },
    app: {
      categories: '分类',
      plansCount: '{count} 个套餐',
      zeroPlans: '0 个套餐'
    }
  },
  en: {
    nav: {
      home: 'Home',
      subscription: 'Subscriptions'
    },
    hero: {
      badge: 'Real-time prices spanning {regions} countries/regions',
      title: 'Discover the {highlight} App Subscriptions globally',
      highlight: 'Cheapest',
      subtitle: 'Compare subscription prices of {apps} popular apps across different regions worldwide.<br/>Find the most cost-effective region to buy and save up to <strong>60%</strong> annually.',
      startBtn: 'Browse Apps',
      addBtn: 'Search & Compare'
    },
    stats: {
      apps: 'Popular Apps',
      plans: 'Subscription Plans',
      regions: 'Countries & Regions',
      categories: 'Categories'
    },
    features: {
      title: 'Why Choose Youhu',
      global: 'Global Comparison',
      globalDesc: 'Covering 11 major low-price regions like Nigeria, Turkey, and India.',
      save: 'Money Saver',
      saveDesc: 'Prices for the same subscription can vary by up to 60% globally.',
      viz: 'Clear Visualization',
      vizDesc: 'Dual views for plans and regions, plus real-time exchange rates.',
      free: 'Open & Free',
      freeDesc: 'Completely free. Open source, transparent data, community-driven.'
    },
    howto: {
      title: 'How It Works',
      step1Title: 'Select an App',
      step1Desc: 'Find the app you use or want to purchase in the subscription list.',
      step2Title: 'Compare Prices',
      step2Desc: 'Check the subscription prices across different regions globally.',
      step3Title: 'Subscribe & Save',
      step3Desc: 'Switch your App Store region to the cheapest one and subscribe.'
    },
    bottomCta: {
      title: 'Ready to start saving?',
      desc: 'Check the global price comparison for {apps} popular apps now.',
      btn: 'Browse All Apps →'
    },
    footer: {
      legal: 'Legal',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      disclaimer: 'Disclaimer',
      tools: 'Tools',
      appList: 'App List',
      calculator: 'Price Calculator',
      others: 'Other Apps',
      wechatMini: 'WeChat Mini Program',
      wechatDesc: 'Scan to experience mobile-friendly subscription management.',
      copyright: '© 2026 Youhu. All rights reserved.',
      footerDisclaimer: 'Data is for reference only. Actual prices are to be confirmed on App Store. Not affiliated with Apple Inc.'
    },
    app: {
      categories: 'Categories',
      plansCount: '{count} plans',
      zeroPlans: '0 plans'
    }
  }
}

// 尝试从 localStorage 读取用户之前选择的语言
const savedLang = localStorage.getItem('youhu_lang') || 'zh'

const i18n = createI18n({
  legacy: false, // 使用 Composition API
  locale: savedLang,
  fallbackLocale: 'en',
  messages
})

export default i18n
