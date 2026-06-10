import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type NotificationCategory =
  | 'new_lead'
  | 'lead_assigned'
  | 'stage_updated'
  | 'pipeline_changed'
  | 'note_added'
  | 'invoice_created'

export interface AppNotification {
  id: string
  recipient_id: string
  actor_id: string | null
  category: NotificationCategory
  title: string
  description: string | null
  redirect_url: string | null
  is_read: boolean
  created_at: string
  lead_id: string | null
  lead_name: string | null
  invoice_id?: string | null
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}
