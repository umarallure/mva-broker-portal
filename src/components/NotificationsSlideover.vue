<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { useDashboard } from '../composables/useDashboard'
import { useNotifications } from '../composables/useNotifications'
import { getNotificationsLocation } from '../lib/notifications'
import type { AppNotification } from '../types'
import NotificationItem from './notifications/NotificationItem.vue'

const router = useRouter()
const auth = useAuth()
const { isNotificationsSlideoverOpen } = useDashboard()
const {
  notifications,
  unreadCount,
  fetchInitialNotifications,
  initializeRealtimeListener,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = useNotifications()

const previewNotifications = computed(() => notifications.value.slice(0, 8))
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

  isNotificationsSlideoverOpen.value = false

  if (notification.redirect_url) {
    await router.push(notification.redirect_url)
    return
  }

  await router.push(getNotificationsLocation(notification.id))
}

const openAllNotifications = async () => {
  isNotificationsSlideoverOpen.value = false
  await router.push('/notifications')
}

watch(isNotificationsSlideoverOpen, (open) => {
  if (open) void syncNotifications()
})
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <template #body>
      <div class="notifications-slideover">
        <div class="notifications-slideover__summary">
          <div>
            <p>Recent activity</p>
            <span>{{ notifications.length }} total</span>
          </div>

          <UBadge
            v-if="unreadCount > 0"
            color="primary"
            variant="subtle"
          >
            {{ unreadLabel }}
          </UBadge>
        </div>

        <div class="notifications-slideover__actions">
          <UButton
            icon="i-lucide-bell"
            color="neutral"
            variant="outline"
            size="sm"
            block
            @click="openAllNotifications"
          >
            Open notifications
          </UButton>
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
        </div>

        <div
          v-if="previewNotifications.length"
          class="notifications-slideover__list"
        >
          <NotificationItem
            v-for="notification in previewNotifications"
            :key="notification.id"
            :notification="notification"
            compact
            @select="openNotification"
            @mark-read="markAsRead(notification.id)"
            @delete="deleteNotification(notification.id)"
          />
        </div>

        <div
          v-else
          class="notifications-slideover__empty"
        >
          <UIcon name="i-lucide-bell" class="size-10" />
          <p>No notifications yet.</p>
          <span>New retainers and broker invoices will appear here.</span>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.notifications-slideover {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 0.9rem;
}

.notifications-slideover__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid var(--ap-card-border);
  border-radius: 0.75rem;
  background: var(--ap-card-bg);
  padding: 0.9rem;
}

.notifications-slideover__summary p {
  color: var(--ui-text-highlighted);
  font-size: 0.92rem;
  font-weight: 800;
}

.notifications-slideover__summary span {
  color: var(--ui-text-muted);
  font-size: 0.8rem;
}

.notifications-slideover__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notifications-slideover__actions > :first-child {
  flex: 1;
}

.notifications-slideover__list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.notifications-slideover__empty {
  display: flex;
  min-height: 18rem;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px dashed var(--ap-card-border);
  border-radius: 0.75rem;
  color: var(--ui-text-muted);
  text-align: center;
}

.notifications-slideover__empty p {
  color: var(--ui-text-highlighted);
  font-weight: 800;
}

.notifications-slideover__empty span {
  max-width: 16rem;
  font-size: 0.82rem;
}
</style>
