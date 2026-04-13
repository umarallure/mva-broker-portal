export type ManagedLaunchContext = {
  launchId: string
  actorUserId: string | null
  actorEmail: string | null
  actorDisplayName: string | null
  lawyerUserId: string
  lawyerEmail: string | null
  requestedPath: string
  consumedAt: string | null
  expiresAt: string | null
}

export const MANAGED_LAUNCH_CONTEXT_KEY = 'ap_managed_launch_context'
export const MANAGED_SUPABASE_STORAGE_KEY = 'ap_managed_supabase_auth'

const isClient = typeof window !== 'undefined'

export const readManagedLaunchContext = (): ManagedLaunchContext | null => {
  if (!isClient) return null

  const raw = window.sessionStorage.getItem(MANAGED_LAUNCH_CONTEXT_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as ManagedLaunchContext
  } catch {
    window.sessionStorage.removeItem(MANAGED_LAUNCH_CONTEXT_KEY)
    return null
  }
}

export const isManagedCallbackPath = (pathname?: string | null) => {
  const value = pathname ?? (isClient ? window.location.pathname : '')
  return value.startsWith('/managed-auth/')
}

export const isManagedSessionWindow = () => {
  if (!isClient) return false
  return isManagedCallbackPath(window.location.pathname) || Boolean(window.sessionStorage.getItem(MANAGED_LAUNCH_CONTEXT_KEY))
}
