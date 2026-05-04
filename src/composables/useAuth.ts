import { ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { clearLaunchedPortalWindow } from '../lib/launchedSession'
import { useManagedLaunch } from './useManagedLaunch'

export type AppRole = 'super_admin' | 'admin' | 'lawyer' | 'agent' | 'accounts' | 'broker'

export type AppUserProfile = {
  user_id: string
  email: string
  display_name: string | null
  role: AppRole | null
  center_id: string | null
  account_status: string | null
} | null

type AuthState = {
  ready: boolean
  loading: boolean
  user: User | null
  session: Session | null
  profile: AppUserProfile
}

const _useAuth = () => {
  const managedLaunch = useManagedLaunch()
  const state = ref<AuthState>({
    ready: false,
    loading: true,
    user: null,
    session: null,
    profile: null
  })

  const loadProfile = async () => {
    if (!state.value.user) {
      state.value.profile = null
      console.info('[auth] no user found, clearing profile')
      return
    }

    console.info('[auth] loading profile for user', state.value.user.id)

    const { data, error } = await supabase
      .from('app_users')
      .select('user_id,email,display_name,role,center_id,account_status')
      .eq('user_id', state.value.user.id)
      .maybeSingle()

    if (error) {
      console.warn('[auth] failed to load profile', error.message)
      state.value.profile = null
      return
    }

    state.value.profile = (data as AppUserProfile) ?? null
    console.info('[auth] profile loaded', state.value.profile)
  }

  const init = async () => {
    if (state.value.ready) return

    state.value.loading = true
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    state.value.session = data.session
    state.value.user = data.session?.user ?? null
    await loadProfile()
    state.value.ready = true
    state.value.loading = false

    supabase.auth.onAuthStateChange((_event, session) => {
      state.value.session = session
      state.value.user = session?.user ?? null
      loadProfile().catch(() => {
        state.value.profile = null
      })
      state.value.ready = true
      state.value.loading = false
    })
  }

  const signInWithPassword = async (email: string, password: string) => {
    state.value.loading = true
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    state.value.loading = false

    if (error) throw error

    state.value.session = data.session
    state.value.user = data.user
    await loadProfile()
    state.value.ready = true
  }

  const signOut = async () => {
    state.value.loading = true
    const { error } = await supabase.auth.signOut()
    state.value.loading = false
    // Always clear local state even if the server call fails
    // (e.g. 403 when session token is already expired in production)
    state.value.session = null
    state.value.user = null
    state.value.profile = null
    clearLaunchedPortalWindow()
    managedLaunch.clearContext()
    if (error) console.warn('[auth] signOut server error (local session cleared):', error.message)
  }

  return {
    state: readonly(state),
    managedLaunch: managedLaunch.context,
    isManagedSession: managedLaunch.isManaged,
    init,
    refreshProfile: loadProfile,
    signInWithPassword,
    signOut
  }
}

export const useAuth = createSharedComposable(_useAuth)
