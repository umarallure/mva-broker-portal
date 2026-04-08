<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStorage } from '@vueuse/core'
import type { NavigationMenuItem } from '@nuxt/ui'

import { useAuth } from './composables/useAuth'

type HubSpotWindow = Window & typeof globalThis & {
  HubSpotConversations?: {
    widget?: {
      load?: () => void
      remove?: () => void
    }
    on?: (event: string, callback: () => void) => void
  }
  hsConversationsOnReady?: Array<() => void>
}

const toast = useToast()
const route = useRoute()
const auth = useAuth()

const open = ref(false)
const sidebarCollapsed = ref(false)
const chatOpen = ref(false)
let collapsedBeforeGuide = false

const isPublicPage = computed(() =>
  ['/login', '/', '/get-started'].includes(route.path) ||
  route.path.endsWith('/pdf')
)

function withHubSpotReady(callback: () => void) {
  if (typeof window === 'undefined') return

  const w = window as HubSpotWindow

  if (w.HubSpotConversations?.widget) {
    callback()
    return
  }

  w.hsConversationsOnReady = w.hsConversationsOnReady || []
  w.hsConversationsOnReady.push(callback)
}

function loadHubSpotWidget() {
  withHubSpotReady(() => {
    const widget = (window as HubSpotWindow).HubSpotConversations?.widget
    if (!widget) return

    if (isPublicPage.value) {
      chatOpen.value = false
      widget.remove?.()
    } else {
      widget.load?.()
    }
  })
}

function toggleChat() {
  chatOpen.value = !chatOpen.value
}

onMounted(() => {
  auth.init().catch(() => {})
  loadHubSpotWidget()
})

watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    loadHubSpotWidget()
  }
)

const role = computed(() => auth.state.value.profile?.role)
const isAdmin = computed(() => role.value === 'super_admin' || role.value === 'admin')
const isSuperAdmin = computed(() => role.value === 'super_admin')
const isAccounts = computed(() => role.value === 'accounts')
const isAdminOrAccounts = computed(() => isAdmin.value || isAccounts.value)

const links = computed(() => [[
  // Pages hidden from accounts role
  ...(!isAccounts.value ? [{
    label: 'Dashboard',
    icon: 'i-lucide-house',
    to: '/dashboard',
    onSelect: () => { open.value = false }
  }, {
    label: 'Order Map',
    icon: 'i-lucide-map',
    to: '/intake-map',
    onSelect: () => { open.value = false }
  }, {
    label: 'My Cases',
    icon: 'i-lucide-briefcase',
    to: '/retainers',
    onSelect: () => { open.value = false }
  }, {
    label: 'Fulfillment',
    icon: 'i-lucide-package',
    to: '/fulfillment',
    onSelect: () => { open.value = false }
  }] : []),

  // Invoicing — visible to all roles that can log in (lawyer sees lawyer only via route guard)
  {
    label: 'Invoicing',
    icon: 'i-lucide-receipt',
    to: '/invoicing/lawyer',
    onSelect: () => { open.value = false }
  },

  // Publisher Invoicing — admin, super_admin, accounts
  ...(isAdminOrAccounts.value ? [{
    label: 'Publisher Invoicing',
    icon: 'i-lucide-store',
    to: '/invoicing/publisher',
    onSelect: () => { open.value = false }
  }] : []),

  // Product Portal — visible to all non-accounts roles
  ...(!isAccounts.value ? [{
    label: 'Product Offering',
    icon: 'i-lucide-tag',
    to: '/product-portal',
    onSelect: () => { open.value = false }
  }, {
    label: 'Product Guide',
    icon: 'i-lucide-book-open',
    to: '/product-guide',
    onSelect: () => { open.value = false }
  }] : []),

  // Retainer Settlements — admin, super_admin, accounts
  ...(isAdminOrAccounts.value ? [{
    label: 'Retainer Settlements',
    icon: 'i-lucide-landmark',
    to: '/retainer-settlements',
    onSelect: () => { open.value = false }
  }] : []),

  // Super admin only
  ...(isSuperAdmin.value ? [{
    label: 'Users',
    icon: 'i-lucide-users',
    to: '/users',
    onSelect: () => { open.value = false }
  }, {
    label: 'Centers',
    icon: 'i-lucide-building-2',
    to: '/centers',
    onSelect: () => { open.value = false }
  }] : []),

  // Settings — accounts sees General only; others see all sub-pages
  {
    label: 'Settings',
    to: '/settings',
    icon: 'i-lucide-settings',
    defaultOpen: route.path.startsWith('/settings'),
    type: 'trigger',
    children: [
      ...(!isAccounts.value ? [{
        label: 'Attorney Profile',
        to: '/settings/attorney-profile',
        exact: true,
        onSelect: () => { open.value = false }
      }, {
        label: 'Expertise & Jurisdiction',
        to: '/settings/expertise',
        exact: true,
        onSelect: () => { open.value = false }
      }, {
        label: 'Team Profile',
        to: '/settings/team-profile',
        exact: true,
        onSelect: () => { open.value = false }
      }, {
        label: 'Retainer Contract Document',
        to: '/settings/retainer-contract-document',
        exact: true,
        onSelect: () => { open.value = false }
      }] : [])
      // TODO: re-enable with pricing redesign
      // , {
      //   label: 'Pricing',
      //   to: '/settings/capacity',
      //   exact: true,
      //   onSelect: () => { open.value = false }
      // }
    ]
  }
]] satisfies NavigationMenuItem[][])

watch(() => route.path, (to, from) => {
  if (to === '/product-guide' && from !== '/product-guide') {
    collapsedBeforeGuide = sidebarCollapsed.value
    sidebarCollapsed.value = true
  } else if (from === '/product-guide' && to !== '/product-guide') {
    sidebarCollapsed.value = collapsedBeforeGuide
  }
})

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.value.flat()
}])

const cookie = useStorage('cookie-consent', 'pending')
if (cookie.value !== 'accepted') {
  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
}
</script>

<template>
  <Suspense>
    <UApp>
      <template v-if="isPublicPage">
        <RouterView />
      </template>

      <UDashboardGroup
        v-else
        unit="rem"
        storage="local"
      >
        <UDashboardSidebar
          id="default"
          v-model:open="open"
          v-model:collapsed="sidebarCollapsed"
          collapsible
          resizable
          class="bg-elevated/25"
          :ui="{ header: 'px-0', footer: 'lg:border-t lg:border-default' }"
        >
          <template #header="{ collapsed }">
            <TeamsMenu :collapsed="collapsed" />
          </template>

          <template #default="{ collapsed }">
            <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[0]"
              orientation="vertical"
              tooltip
              popover
            />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[1]"
              orientation="vertical"
              tooltip
              class="mt-auto"
            />

            <button
              class="w-full flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors cursor-pointer bg-primary text-white hover:bg-primary/90"
              :class="collapsed ? 'p-2' : 'px-2.5 py-2'"
              @click="toggleChat"
            >
              <UIcon name="i-lucide-message-circle" class="size-5 shrink-0" />
              <span v-if="!collapsed" class="truncate">Chat With Us</span>
            </button>
          </template>

          <template #footer="{ collapsed }">
            <UserMenu :collapsed="collapsed" />
          </template>
        </UDashboardSidebar>

        <UDashboardSearch :groups="groups" />

        <RouterView />

        <NotificationsSlideover />

        <!-- HubSpot inline-embed container — positioned by toggleChat() -->
        <div
          class="fixed z-50 rounded-lg shadow-xl"
          :class="chatOpen ? 'bottom-16 left-[280px]' : '-left-full'"
          style="width: 376px; height: 500px;"
        >
          <button
            class="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded-full bg-black/40 hover:bg-black/60 text-white cursor-pointer transition-colors"
            @click="toggleChat"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
          <div
            id="hs-chat-embed"
            class="w-full h-full overflow-hidden rounded-lg"
          />
        </div>
      </UDashboardGroup>
    </UApp>
  </Suspense>
</template>
