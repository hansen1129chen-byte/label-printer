import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn, getUser } from '../utils/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { guest: true } },
  { path: '/', redirect: '/orders' },
  { path: '/orders', name: 'Orders', component: () => import('../views/Orders.vue') },
  { path: '/orders/new', name: 'NewOrder', component: () => import('../views/OrderForm.vue') },
  { path: '/orders/:id/edit', name: 'EditOrder', component: () => import('../views/OrderForm.vue') },
  { path: '/shipping', name: 'Shipping', component: () => import('../views/Shipping.vue') },
  { path: '/gigl', name: 'GiglShipments', component: () => import('../views/GiglShipments.vue') },
  { path: '/products', name: 'Products', component: () => import('../views/Products.vue') },
  { path: '/config', name: 'Config', component: () => import('../views/Config.vue'), meta: { admin: true } },
  { path: '/stats', name: 'Stats', component: () => import('../views/Stats.vue'), meta: { admin: true } },
  { path: '/accounts', name: 'Accounts', component: () => import('../views/Accounts.vue'), meta: { admin: true } },
  { path: '/profile', name: 'Profile', component: () => import('../views/Profile.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const loggedIn = isLoggedIn()
  const user = getUser()
  if (to.meta.guest && loggedIn) return next('/orders')
  if (!loggedIn && !to.meta.guest) return next('/login')
  if (to.meta.admin && user?.role !== 'admin') return next('/orders')
  next()
})

export default router
