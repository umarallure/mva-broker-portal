<script setup lang="ts">
import { computed } from 'vue'
import { formatTimeAgo } from '@vueuse/core'

import {
  getNotificationMeta,
  getNotificationPreview
} from '../../lib/notifications'
import type { AppNotification } from '../../types'

const props = withDefaults(defineProps<{
  notification: AppNotification
  active?: boolean
  compact?: boolean
}>(), {
  active: false,
  compact: false
})

const emit = defineEmits<{
  select: [notification: AppNotification]
  delete: [notification: AppNotification]
  markRead: [notification: AppNotification]
}>()

const meta = computed(() => getNotificationMeta(props.notification.category))
const preview = computed(() => getNotificationPreview(props.notification))
const relativeTime = computed(() => formatTimeAgo(new Date(props.notification.created_at)))
const absoluteTime = computed(() => {
  try {
    return new Date(props.notification.created_at).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return props.notification.created_at
  }
})

const dropdownItems = computed(() => [[{
  label: props.notification.is_read ? 'Already read' : 'Mark as read',
  icon: props.notification.is_read ? 'i-lucide-check' : 'i-lucide-check-circle',
  disabled: props.notification.is_read,
  onSelect: () => emit('markRead', props.notification)
}], [{
  label: 'Delete',
  icon: 'i-lucide-trash-2',
  color: 'error' as const,
  onSelect: () => emit('delete', props.notification)
}]])
</script>

<template>
  <div
    class="notification-item"
    :class="{
      'notification-item--unread': !notification.is_read,
      'notification-item--active': active,
      'notification-item--compact': compact
    }"
  >
    <button
      type="button"
      class="notification-item__main"
      @click="emit('select', notification)"
    >
      <span
        class="notification-item__icon"
        :style="{ background: meta.iconBg, color: meta.accent }"
      >
        <UIcon :name="meta.icon" class="size-4" />
      </span>

      <span class="notification-item__content">
        <span class="notification-item__meta">
          <span class="notification-item__label">{{ meta.label }}</span>
          <time
            class="notification-item__time"
            :datetime="notification.created_at"
            :title="absoluteTime"
          >
            {{ relativeTime }}
          </time>
        </span>

        <span class="notification-item__title">
          {{ notification.title }}
        </span>

        <span class="notification-item__preview">
          {{ preview }}
        </span>
      </span>
    </button>

    <div
      class="notification-item__actions"
      @click.stop
    >
      <span
        v-if="!notification.is_read"
        class="notification-item__unread"
        aria-label="Unread notification"
      />

      <UTooltip
        v-if="!notification.is_read && !compact"
        text="Mark as read"
      >
        <UButton
          icon="i-lucide-check-circle"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="emit('markRead', notification)"
        />
      </UTooltip>

      <UDropdownMenu
        :items="dropdownItems"
        :content="{ align: 'end' }"
      >
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          size="xs"
        />
      </UDropdownMenu>
    </div>
  </div>
</template>

<style scoped>
.notification-item {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
  border: 1px solid var(--ap-card-border);
  border-radius: 0.75rem;
  background: var(--ap-card-bg);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.notification-item:hover,
.notification-item--active {
  border-color: rgb(var(--ap-accent-rgb) / 0.24);
  background: rgb(var(--ap-accent-rgb) / 0.055);
  box-shadow: 0 8px 18px rgb(var(--ap-accent-rgb) / 0.08);
}

.notification-item--unread {
  border-color: rgb(var(--ap-accent-rgb) / 0.2);
}

.notification-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 0.85rem;
  padding: 1rem;
  text-align: left;
}

.notification-item--compact .notification-item__main {
  padding: 0.85rem;
}

.notification-item__icon {
  display: inline-flex;
  height: 2.25rem;
  width: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.7rem;
}

.notification-item__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
}

.notification-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.notification-item__label {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.notification-item__time {
  flex: 0 0 auto;
  color: var(--ui-text-dimmed);
  font-size: 0.75rem;
}

.notification-item__title {
  overflow: hidden;
  color: var(--ui-text-highlighted);
  font-size: 0.93rem;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-item__preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.notification-item__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 0.75rem 0.75rem 0;
}

.notification-item__unread {
  display: inline-flex;
  height: 0.55rem;
  width: 0.55rem;
  border-radius: 999px;
  background: var(--ap-accent);
  box-shadow: 0 0 0 3px rgb(var(--ap-accent-rgb) / 0.12);
}

@media (max-width: 640px) {
  .notification-item__main {
    padding: 0.85rem;
  }

  .notification-item__meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.1rem;
  }

  .notification-item__title {
    white-space: normal;
  }
}
</style>
