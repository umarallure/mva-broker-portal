<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { NavigationMenuItem } from '@nuxt/ui'
import ProfileCompletionMeter from '../components/settings/ProfileCompletionMeter.vue'
import { useAuth } from '../composables/useAuth'
import { useAttorneyProfile, type AttorneyProfileState } from '../composables/useAttorneyProfile'

const route = useRoute()
const auth = useAuth()
const attorneyProfile = useAttorneyProfile()

const attorneyProfileData = computed(() => attorneyProfile.state.value as unknown as Partial<AttorneyProfileState>)
const isAccounts = computed(() => auth.state.value.profile?.role === 'accounts')

const links = computed(() => {
  const items: NavigationMenuItem[][] = [[{
    label: 'Attorney Profile',
    icon: 'i-lucide-briefcase',
    to: '/settings/attorney-profile',
    exact: true
  }]]

  items.push([{
    label: 'Expertise & Jurisdiction',
    icon: 'i-lucide-map-pin',
    to: '/settings/expertise',
    exact: true
  }])

  if (!isAccounts.value) {
    items.push([{
      label: 'Team Profile',
      icon: 'i-lucide-users-round',
      to: '/settings/team-profile',
      exact: true
    }])
  }

  items.push([{
    label: 'Retainer Contract Document',
    icon: 'i-lucide-file-text',
    to: '/settings/retainer-contract-document',
    exact: true
  }])

  // TODO: re-enable with pricing redesign
  // items.push([{
  //   label: 'Pricing',
  //   icon: 'i-lucide-activity',
  //   to: '/settings/capacity',
  //   exact: true
  // }])

  return items
})

const showCompletionMeter = computed(() => {
  return route.path.startsWith('/settings/')
})
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <ProfileCompletionMeter v-if="showCompletionMeter" :profile-data="attorneyProfileData" />
        <RouterView />
      </div>
    </template>
  </UDashboardPanel>
</template>
