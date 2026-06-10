import { computed, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { AppNotification } from '../types'

const MAX_NOTIFICATIONS = 50
const POLL_INTERVAL_MS = 5000

const _useNotifications = () => {
  const notifications = ref<AppNotification[]>([])
  const lastRealtimeNotification = ref<AppNotification | null>(null)
  const unreadCount = computed(() => notifications.value.filter(notification => !notification.is_read).length)

  let channel: RealtimeChannel | null = null
  let pollTimer: number | null = null
  let latestCreatedAt: string | null = null
  let currentUserId: string | null = null
  let visibilityHandler: (() => void) | null = null
  let isSyncing = false

  const syncLatestCreatedAt = () => {
    latestCreatedAt = notifications.value[0]?.created_at ?? null
  }

  const mergeNotifications = (incoming: AppNotification[]) => {
    if (!incoming.length) return

    const merged = new Map<string, AppNotification>()
    notifications.value.forEach(notification => {
      merged.set(notification.id, notification)
    })
    incoming.forEach(notification => {
      merged.set(notification.id, notification)
    })

    notifications.value = Array.from(merged.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, MAX_NOTIFICATIONS)

    syncLatestCreatedAt()
  }

  const fetchNotifications = async (userId: string, options: { incremental?: boolean } = {}) => {
    if (isSyncing) return
    isSyncing = true

    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_NOTIFICATIONS)

      if (options.incremental && latestCreatedAt) {
        query = query.gte('created_at', latestCreatedAt)
      }

      const { data, error } = await query
      if (error || !data) return

      const rows = data as AppNotification[]
      if (options.incremental) {
        mergeNotifications(rows)
        return
      }

      notifications.value = rows
      syncLatestCreatedAt()
    } finally {
      isSyncing = false
    }
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }

    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  const startPolling = (userId: string) => {
    if (typeof window === 'undefined') return

    stopPolling()

    const syncIfVisible = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      await fetchNotifications(userId, { incremental: true })
    }

    pollTimer = window.setInterval(() => {
      void syncIfVisible()
    }, POLL_INTERVAL_MS)

    if (typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          void syncIfVisible()
        }
      }

      document.addEventListener('visibilitychange', visibilityHandler)
    }
  }

  const fetchInitialNotifications = async (userId: string) => {
    currentUserId = userId
    lastRealtimeNotification.value = null
    await fetchNotifications(userId)
  }

  const initializeRealtimeListener = (userId: string) => {
    if (channel && currentUserId === userId) return

    stopPolling()
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }

    currentUserId = userId
    lastRealtimeNotification.value = null

    channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`
        },
        (payload) => {
          const notification = payload.new as AppNotification
          mergeNotifications([notification])
          lastRealtimeNotification.value = notification
        }
      )
      .subscribe()

    startPolling(userId)
  }

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    if (!error) {
      const notification = notifications.value.find(notification => notification.id === notificationId)
      if (notification) notification.is_read = true
    }
  }

  const markAllAsRead = async () => {
    const unreadIds = notifications.value
      .filter(notification => !notification.is_read)
      .map(notification => notification.id)

    if (!unreadIds.length) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)

    if (!error) {
      notifications.value.forEach(notification => {
        notification.is_read = true
      })
    }
  }

  const deleteNotification = async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)

    if (!error) {
      notifications.value = notifications.value.filter(notification => notification.id !== notificationId)
      syncLatestCreatedAt()
    }
  }

  const cleanup = () => {
    stopPolling()

    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }

    notifications.value = []
    lastRealtimeNotification.value = null
    latestCreatedAt = null
    currentUserId = null
    isSyncing = false
  }

  return {
    notifications,
    unreadCount,
    lastRealtimeNotification,
    fetchInitialNotifications,
    initializeRealtimeListener,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    cleanup
  }
}

export const useNotifications = createSharedComposable(_useNotifications)
