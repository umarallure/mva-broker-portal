import { createClient } from '@supabase/supabase-js'
import { isManagedSessionWindow, MANAGED_SUPABASE_STORAGE_KEY } from './managedLaunch'
import { isLaunchedPortalWindow, LAUNCHED_SUPABASE_STORAGE_KEY } from './launchedSession'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY')
}

const isClient = typeof window !== 'undefined'
const useManagedStorage = isManagedSessionWindow()
const useLaunchedStorage = isLaunchedPortalWindow()
const useSessionStorage = useManagedStorage || useLaunchedStorage
const storageKey = useManagedStorage
  ? MANAGED_SUPABASE_STORAGE_KEY
  : useLaunchedStorage
    ? LAUNCHED_SUPABASE_STORAGE_KEY
    : undefined

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(isClient
      ? {
          storage: useSessionStorage ? window.sessionStorage : window.localStorage,
          storageKey,
        }
      : {}),
  },
})
