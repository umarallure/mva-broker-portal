export const LAUNCHED_PORTAL_MARKER_KEY = 'ap_launched_portal_window'
export const LAUNCHED_SUPABASE_STORAGE_KEY = 'ap_launched_supabase_auth'

const isClient = typeof window !== 'undefined'

export const isLaunchBootstrapPath = (pathname?: string | null) => {
  const value = pathname ?? (isClient ? window.location.pathname : '')
  return value.startsWith('/launch-auth')
}

export const isLaunchedPortalWindow = () => {
  if (!isClient) return false
  return isLaunchBootstrapPath(window.location.pathname) || window.sessionStorage.getItem(LAUNCHED_PORTAL_MARKER_KEY) === '1'
}

export const markLaunchedPortalWindow = () => {
  if (!isClient) return
  window.sessionStorage.setItem(LAUNCHED_PORTAL_MARKER_KEY, '1')
}

export const clearLaunchedPortalWindow = () => {
  if (!isClient) return
  window.sessionStorage.removeItem(LAUNCHED_PORTAL_MARKER_KEY)
}
