<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { NavigationMenuItem } from '@nuxt/ui'
import ProfileCompletionMeter from '../components/settings/ProfileCompletionMeter.vue'
import { useAttorneyProfile } from '../composables/useAttorneyProfile'

const route = useRoute()
const attorneyProfile = useAttorneyProfile()

const attorneyProfileData = computed(() => attorneyProfile.state.value)

const links = [[{
  label: 'Attorney Profile',
  icon: 'i-lucide-briefcase',
  to: '/settings/attorney-profile',
  exact: true
}], [{
  label: 'Expertise & Jurisdiction',
  icon: 'i-lucide-map-pin',
  to: '/settings/expertise',
  exact: true
}]
// TODO: re-enable with pricing redesign
// , [{
//   label: 'Pricing',
//   icon: 'i-lucide-activity',
//   to: '/settings/capacity',
//   exact: true
// }]
] satisfies NavigationMenuItem[][]

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
