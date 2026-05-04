<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import type { NavigationMenuItem } from '@nuxt/ui'

import ProfileCompletionMeter from '../components/settings/ProfileCompletionMeter.vue'
import { useAuth } from '../composables/useAuth'
import {
  useBrokerProfile,
  BROKER_PROFILE_REQUIRED_FIELDS,
  BROKER_PROFILE_OPTIONAL_FIELDS,
  isBrokerProfileFieldFilled,
  type BrokerProfileState
} from '../composables/useBrokerProfile'

const route = useRoute()
const auth = useAuth()
const brokerProfile = useBrokerProfile()

const userId = computed(() => auth.state.value.user?.id ?? '')
const isBroker = computed(() => auth.state.value.profile?.role === 'broker')

const brokerProfileData = computed(
  () => brokerProfile.state.value as unknown as Partial<BrokerProfileState>
)

const requiredFilled = computed(() =>
  BROKER_PROFILE_REQUIRED_FIELDS
    .filter(field => isBrokerProfileFieldFilled(brokerProfileData.value, field))
    .length
)

const optionalFilled = computed(() =>
  BROKER_PROFILE_OPTIONAL_FIELDS
    .filter(field => isBrokerProfileFieldFilled(brokerProfileData.value, field))
    .length
)

const completionPercentage = computed(() => brokerProfile.completionPercentage.value)

onMounted(async () => {
  await auth.init()
  if (isBroker.value && userId.value) {
    await brokerProfile.loadProfile(userId.value)
  }
})

const links = computed<NavigationMenuItem[][]>(() => [
  [{
    label: 'Broker Profile',
    icon: 'i-lucide-briefcase',
    to: '/settings/broker-profile',
    exact: true
  }],
  [{
    label: 'Team Profile',
    icon: 'i-lucide-users-round',
    to: '/settings/team-profile',
    exact: true
  }]
])

const showCompletionMeter = computed(() =>
  isBroker.value && route.path.startsWith('/settings/')
)
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
      <div class="flex w-full flex-col gap-6">
        <ProfileCompletionMeter
          v-if="showCompletionMeter"
          :percentage="completionPercentage"
          :required-filled="requiredFilled"
          :required-total="BROKER_PROFILE_REQUIRED_FIELDS.length"
          :optional-filled="optionalFilled"
          :optional-total="BROKER_PROFILE_OPTIONAL_FIELDS.length"
        />
        <RouterView />
      </div>
    </template>
  </UDashboardPanel>
</template>
