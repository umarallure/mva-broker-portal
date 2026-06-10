import './assets/css/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import type { BrokerSection } from './lib/broker-access'

const app = createApp(App)

// Pages still imported by super_admin tooling are kept registered; they are
// hidden from the broker-only nav in App.vue.
const router = createRouter({
  routes: [
    // '/' lands on the login page, which is now the public entry point.
    { path: '/', redirect: '/login', meta: { public: true } },
    { path: '/home', redirect: '/login', meta: { public: true } },
    { path: '/get-started', component: () => import('./pages/get-started.vue') },
    { path: '/login', component: () => import('./pages/login.vue'), meta: { public: true } },
    { path: '/privacy-policy', component: () => import('./pages/privacy-policy.vue'), meta: { public: true } },
    { path: '/terms', component: () => import('./pages/terms.vue'), meta: { public: true } },
    { path: '/launch-auth', component: () => import('./pages/launch-auth.vue'), meta: { public: true } },
    { path: '/managed-auth/callback', component: () => import('./pages/managed-auth-callback.vue'), meta: { public: true } },
    // Dashboard is intentionally hidden for now. Keep this route here to
    // re-enable later without touching page code.
    { path: '/dashboard', component: () => import('./pages/dashboard.vue'), meta: { brokerSection: 'dashboard' } },
    { path: '/notifications', component: () => import('./pages/notifications.vue') },
    {
      path: '/inbox',
      redirect: to => ({
        path: '/notifications',
        query: {
          ...to.query,
          ...(typeof to.query.id === 'string' && !to.query.notificationId
            ? { notificationId: to.query.id }
            : {})
        }
      })
    },
    { path: '/intake-map', component: () => import('./pages/intake-map.vue'), meta: { brokerSection: 'order_map' } },
    { path: '/orders/:id', component: () => import('./pages/orders-details.vue'), meta: { brokerSection: 'order_map' } },
    { path: '/retainers', component: () => import('./pages/retainers.vue'), meta: { brokerSection: 'cases' } },
    { path: '/retainers/:id', component: () => import('./pages/retainers-details.vue'), meta: { brokerSections: ['cases', 'invoicing'] } },
    { path: '/task-management', component: () => import('./pages/task-management.vue'), meta: { brokerSection: 'task_assignment' } },
    { path: '/retainer-settlements', component: () => import('./pages/retainer-settlements.vue'), meta: { requiresSuperAdmin: true } },
    { path: '/invoicing', redirect: '/invoicing/broker' },
    { path: '/invoicing/lawyer', redirect: '/invoicing/broker' },
    { path: '/invoicing/broker', component: () => import('./pages/invoicing.vue'), meta: { brokerSection: 'invoicing' } },
    { path: '/invoicing/publisher', redirect: '/invoicing/broker' },
    { path: '/invoicing/create', component: () => import('./pages/invoicing-create.vue'), meta: { brokerSection: 'invoicing', requiresAdmin: true } },
    { path: '/invoicing/edit/:id', component: () => import('./pages/invoicing-create.vue'), meta: { brokerSection: 'invoicing', requiresAdmin: true } },
    { path: '/invoicing/:id/pdf', component: () => import('./pages/invoice-pdf.vue'), meta: { public: true } },
    { path: '/attorneys', component: () => import('./pages/attorneys.vue'), meta: { brokerSection: 'attorneys' } },
    { path: '/attorneys/:id', component: () => import('./pages/attorneys-details.vue'), meta: { brokerSection: 'attorneys' } },
    // Common help page available to all logged-in broker users; edit controls are gated in-page to admin/super_admin.
    { path: '/product-guide', component: () => import('./pages/product-guide.vue') },
    { path: '/users', component: () => import('./pages/users.vue'), meta: { requiresSuperAdmin: true } },
    { path: '/centers', component: () => import('./pages/centers.vue'), meta: { requiresSuperAdmin: true } },
    {
      path: '/settings',
      component: () => import('./pages/settings.vue'),
      meta: { brokerSection: 'settings' },
      children: [
        { path: '', redirect: '/settings/broker-profile' },
        { path: 'broker-profile', component: () => import('./pages/settings/broker-profile.vue') },
        // Hidden but kept for later re-enable.
        { path: 'attorney-profile', component: () => import('./pages/settings/attorney-profile.vue'), meta: { requiresSuperAdmin: true } },
        { path: 'team-profile', component: () => import('./pages/settings/team-profile.vue') },
        { path: 'expertise', component: () => import('./pages/settings/expertise.vue'), meta: { requiresSuperAdmin: true } },
        { path: 'retainer-contract-document', component: () => import('./pages/settings/retainer-contract-document.vue'), meta: { requiresSuperAdmin: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/not-found.vue') }
  ],
  history: createWebHistory()
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  await auth.init()

  const isPublic = Boolean(to.meta.public)
  const isLoggedIn = Boolean(auth.state.value.user)
  const requiresSuperAdmin = Boolean(to.meta.requiresSuperAdmin)
  const requiresAdmin = Boolean(to.meta.requiresAdmin)
  const role = auth.state.value.profile?.role
  const isSuperAdmin = role === 'super_admin'
  const isAdmin = role === 'admin'
  const isBroker = role === 'broker'
  const isBrokerMember = role === 'broker_member'
  const isRoleAllowed = isSuperAdmin || isAdmin || ((isBroker || isBrokerMember) && Boolean(auth.state.value.brokerContext))
  const brokerSections = Array.isArray(to.meta.brokerSections)
    ? to.meta.brokerSections as BrokerSection[]
    : to.meta.brokerSection
      ? [to.meta.brokerSection as BrokerSection]
      : []
  const defaultPath = auth.getDefaultPath()

  if (to.path === '/login' && isLoggedIn) {
    return { path: defaultPath }
  }

  if (isPublic) return true

  if (isLoggedIn && !isRoleAllowed) {
    await auth.signOut()
    return { path: '/login', query: { reason: 'role_blocked' } }
  }

  if (requiresSuperAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (!isSuperAdmin) {
      return { path: defaultPath }
    }
    return true
  }

  if (requiresAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (!isSuperAdmin && !isAdmin) {
      return { path: defaultPath }
    }
    return true
  }

  if (isLoggedIn && brokerSections.length && !brokerSections.some(section => auth.hasBrokerSection(section))) {
    return { path: defaultPath }
  }

  if (isLoggedIn) return true

  return { path: '/login', query: { redirect: to.fullPath } }
})

app.use(router)

app.use(ui)

void router.isReady()
  .catch((error) => {
    console.error('[router] initial navigation failed', error)
  })
  .finally(() => {
    app.mount('#app')
  })
