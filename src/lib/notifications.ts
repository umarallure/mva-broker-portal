import type { AppNotification, NotificationCategory } from '../types'

export type NotificationMeta = {
  label: string
  icon: string
  accent: string
  iconBg: string
}

export const INBOX_NOTIFICATION_QUERY_KEY = 'notificationId'

const FALLBACK_PREVIEW: Record<NotificationCategory, string> = {
  new_lead: 'A new retainer is ready in My Cases.',
  lead_assigned: 'A lead assignment changed.',
  stage_updated: 'A lead moved to a new status.',
  pipeline_changed: 'A lead moved to a different pipeline.',
  note_added: 'A new note was added to a lead.',
  invoice_created: 'A broker invoice is ready for review.'
}

const META: Record<NotificationCategory, NotificationMeta> = {
  new_lead: {
    label: 'New Retainer',
    icon: 'i-lucide-briefcase-business',
    accent: 'var(--ap-accent)',
    iconBg: 'color-mix(in srgb, var(--ap-accent) 14%, transparent)'
  },
  lead_assigned: {
    label: 'Lead Assigned',
    icon: 'i-lucide-user-plus',
    accent: '#0d9488',
    iconBg: 'rgba(13, 148, 136, 0.12)'
  },
  stage_updated: {
    label: 'Stage Updated',
    icon: 'i-lucide-trending-up',
    accent: '#2563eb',
    iconBg: 'rgba(37, 99, 235, 0.12)'
  },
  pipeline_changed: {
    label: 'Pipeline Changed',
    icon: 'i-lucide-arrow-left-right',
    accent: '#7c3aed',
    iconBg: 'rgba(124, 58, 237, 0.12)'
  },
  note_added: {
    label: 'Note Added',
    icon: 'i-lucide-message-square',
    accent: '#ca8a04',
    iconBg: 'rgba(202, 138, 4, 0.14)'
  },
  invoice_created: {
    label: 'Invoice Created',
    icon: 'i-lucide-receipt',
    accent: '#16a34a',
    iconBg: 'rgba(22, 163, 74, 0.12)'
  }
}

const normalize = (value: string | null | undefined) => {
  const text = value?.trim() ?? ''
  return text.length ? text : null
}

export const notificationCategoryOrder: NotificationCategory[] = [
  'new_lead',
  'invoice_created',
  'lead_assigned',
  'stage_updated',
  'note_added',
  'pipeline_changed'
]

export const getNotificationMeta = (category: NotificationCategory) =>
  META[category] ?? META.note_added

export const getNotificationPreview = (
  notification: Pick<AppNotification, 'category' | 'description'>
) => normalize(notification.description) ?? FALLBACK_PREVIEW[notification.category]

export const getNotificationMessage = (
  notification: Pick<AppNotification, 'category' | 'title' | 'description' | 'lead_name'>
) => {
  const leadName = normalize(notification.lead_name)
  const preview = getNotificationPreview(notification)

  if (notification.category === 'new_lead' && leadName) {
    return `${leadName} is ready in My Cases.`
  }

  if (notification.category === 'invoice_created') {
    return preview
  }

  return preview
}

export const getNotificationsLocation = (notificationId?: string | null) => {
  const id = normalize(notificationId)
  if (!id) return { path: '/notifications' }

  return {
    path: '/notifications',
    query: {
      [INBOX_NOTIFICATION_QUERY_KEY]: id
    }
  }
}
