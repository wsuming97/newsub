import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomePage
  },
  {
    path: '/app/:id',
    name: 'AppDetail',
    component: () => import('../views/DetailPage.vue')
  },
  {
    path: '/calculator',
    name: 'Calculator',
    component: () => import('../views/CalculatorPage.vue')
  },
  {
    path: '/legal/:tab?',
    name: 'Legal',
    component: () => import('../views/LegalPage.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
