<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useNotifications } from '../../composables/useNotifications'
import {
  INBOX_NOTIFICATION_QUERY_KEY,
  getNotificationMeta,
  notificationCategoryOrder
} from '../../lib/notifications'
import type { AppNotification, NotificationCategory } from '../../types'
import NotificationItem from './NotificationItem.vue'

type NotificationFilter = 'all' | 'unread' | NotificationCategory

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const {
  notifications,
  unreadCount,
  fetchInitialNotifications,
  initializeRealtimeListener,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = useNotifications()

const query = ref('')
const filter = ref<NotificationFilter>('all')

const activeNotificationId = computed(() => {
  const value = route.query[INBOX_NOTIFICATION_QUERY_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : null
})

const filterItems = computed(() => [
  { label: 'All notifications', value: 'all' },
  { label: 'Unread only', value: 'unread' },
  ...notificationCategoryOrder.map(category => ({
    label: getNotificationMeta(category).label,
    value: category
  }))
])

const filteredNotifications = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return notifications.value.filter((notification) => {
    if (filter.value === 'unread' && notification.is_read) return false
    if (filter.value !== 'all' && filter.value !== 'unread' && notification.category !== filter.value) return false
    if (!needle) return true

    const haystack = [
      notification.title,
      notification.description ?? '',
      notification.lead_name ?? '',
      getNotificationMeta(notification.category).label
    ].join(' ').toLowerCase()

    return haystack.includes(needle)
  })
})

const emptyTitle = computed(() => {
  if (query.value.trim() || filter.value !== 'all') return 'No matching notifications'
  return 'No notifications yet'
})

const emptyDescription = computed(() => {
  if (query.value.trim() || filter.value !== 'all') return 'Adjust the search or filter to see more notifications.'
  return 'New retainers and broker invoices will appear here when they are sent to your team.'
})

const unreadLabel = computed(() => unreadCount.value > 99 ? '99+' : String(unreadCount.value))

const syncNotifications = async () => {
  await auth.init()
  const userId = auth.state.value.user?.id
  if (!userId) return

  await fetchInitialNotifications(userId)
  initializeRealtimeListener(userId)
}

const openNotification = async (notification: AppNotification) => {
  if (!notification.is_read) {
    await markAsRead(notification.id)
  }

  if (notification.redirect_url) {
    await router.push(notification.redirect_url)
    return
  }

  await router.push({
    path: '/notifications',
    query: { [INBOX_NOTIFICATION_QUERY_KEY]: notification.id }
  })
}

const scrollActiveIntoView = async () => {
  const id = activeNotificationId.value
  if (!id || typeof document === 'undefined') return

  await nextTick()
  document.getElementById(`notification-${id}`)?.scrollIntoView({
    block: 'center',
    behavior: 'smooth'
  })
}

onMounted(() => {
  void syncNotifications()
  void scrollActiveIntoView()
})

watch(
  () => auth.state.value.user?.id,
  () => { void syncNotifications() }
)

watch(
  [activeNotificationId, filteredNotifications],
  () => { void scrollActiveIntoView() }
)
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge
            v-if="unreadCount > 0"
            color="primary"
            variant="subtle"
          >
            {{ unreadLabel }} unread
          </UBadge>
          <UButton
            v-if="unreadCount > 0"
            icon="i-lucide-check-check"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="markAllAsRead"
          >
            Mark all read
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="notifications-page">
        <section class="notifications-toolbar ap-fade-in">
          <div class="notifications-toolbar__copy">
            <p class="notifications-toolbar__eyebrow">
              Broker activity
            </p>
            <h2>
              Team notifications
            </h2>
            <p>
              Track new retainers and broker invoices as they arrive.
            </p>
          </div>

          <div class="notifications-toolbar__controls">
            <UInput
              v-model="query"
              icon="i-lucide-search"
              size="sm"
              placeholder="Search notifications..."
              class="min-w-0 sm:w-72"
            />

            <USelect
              v-model="filter"
              :items="filterItems"
              value-key="value"
              label-key="label"
              size="sm"
              class="w-full sm:w-56"
            />
          </div>
        </section>

        <section class="notifications-summary ap-fade-in ap-delay-2">
          <div>
            <span>{{ notifications.length }}</span>
            <p>Total</p>
          </div>
          <div>
            <span>{{ unreadCount }}</span>
            <p>Unread</p>
          </div>
          <div>
            <span>{{ filteredNotifications.length }}</span>
            <p>Showing</p>
          </div>
        </section>

        <section class="notifications-list ap-fade-in ap-delay-3">
          <NotificationItem
            v-for="notification in filteredNotifications"
            :id="`notification-${notification.id}`"
            :key="notification.id"
            :notification="notification"
            :active="activeNotificationId === notification.id"
            @select="openNotification"
            @mark-read="markAsRead(notification.id)"
            @delete="deleteNotification(notification.id)"
          />

          <div
            v-if="!filteredNotifications.length"
            class="notifications-empty"
          >
            <UIcon name="i-lucide-bell" class="size-10" />
            <h3>{{ emptyTitle }}</h3>
            <p>{{ emptyDescription }}</p>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.notifications-page {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding: 1rem;
}

.notifications-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--ap-card-border);
  border-radius: 0.75rem;
  background: var(--ap-card-bg);
  padding: 1rem;
}

.notifications-toolbar__copy {
  min-width: 0;
}

.notifications-toolbar__eyebrow {
  color: var(--ap-accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.notifications-toolbar h2 {
  margin-top: 0.15rem;
  color: var(--ui-text-highlighted);
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.2;
}

.notifications-toolbar p:not(.notifications-toolbar__eyebrow) {
  margin-top: 0.25rem;
  color: var(--ui-text-muted);
  font-size: 0.88rem;
}

.notifications-toolbar__controls {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
}

.notifications-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.notifications-summary > div {
  border: 1px solid var(--ap-card-border);
  border-radius: 0.75rem;
  background: var(--ap-card-bg);
  padding: 0.9rem 1rem;
}

.notifications-summary span {
  color: var(--ui-text-highlighted);
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
}

.notifications-summary p {
  margin-top: 0.25rem;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.notifications-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 2rem;
}

.notifications-empty {
  display: flex;
  min-height: 18rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  border: 1px dashed var(--ap-card-border);
  border-radius: 0.75rem;
  color: var(--ui-text-muted);
  text-align: center;
}

.notifications-empty h3 {
  color: var(--ui-text-highlighted);
  font-size: 1rem;
  font-weight: 800;
}

.notifications-empty p {
  max-width: 26rem;
  color: var(--ui-text-muted);
  font-size: 0.88rem;
}

@media (max-width: 768px) {
  .notifications-page {
    padding: 0.75rem;
  }

  .notifications-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .notifications-toolbar__controls {
    justify-content: stretch;
  }

  .notifications-summary {
    grid-template-columns: 1fr;
  }
}
</style>
