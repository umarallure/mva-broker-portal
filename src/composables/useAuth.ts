import { ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { clearLaunchedPortalWindow } from '../lib/launchedSession'
import {
  getFirstBrokerSectionPath,
  type BrokerSection,
  type BrokerWorkspaceContext
} from '../lib/broker-access'
import { useManagedLaunch } from './useManagedLaunch'

export type AppRole = 'super_admin' | 'admin' | 'lawyer' | 'agent' | 'accounts' | 'broker' | 'broker_member'

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
  brokerContext: BrokerWorkspaceContext | null
}

const _useAuth = () => {
  const managedLaunch = useManagedLaunch()
  const state = ref<AuthState>({
    ready: false,
    loading: true,
    user: null,
    session: null,
    profile: null,
    brokerContext: null
  })

  const loadBrokerContext = async () => {
    const role = state.value.profile?.role
    if (role !== 'broker' && role !== 'broker_member') {
      state.value.brokerContext = null
      return
    }

    const { data, error } = await supabase
      .rpc('get_current_broker_context')
      .maybeSingle()

    if (error) {
      console.warn('[auth] failed to load broker context', error.message)
      state.value.brokerContext = null
      return
    }

    state.value.brokerContext = (data as BrokerWorkspaceContext | null) ?? null
  }

  const loadProfile = async () => {
    if (!state.value.user) {
      state.value.profile = null
      state.value.brokerContext = null
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
    await loadBrokerContext()
    console.info('[auth] profile loaded', state.value.profile)
  }

  const hasBrokerSection = (section: BrokerSection) => {
    if (state.value.profile?.role === 'super_admin') return true
    if (state.value.profile?.role === 'admin') return section === 'invoicing'
    return state.value.brokerContext?.allowed_sections.includes(section) ?? false
  }

  const getDefaultPath = () => {
    if (state.value.profile?.role === 'super_admin') return '/dashboard'
    if (state.value.profile?.role === 'admin') return '/invoicing/broker'
    return getFirstBrokerSectionPath(state.value.brokerContext?.allowed_sections ?? [])
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
    state.value.brokerContext = null
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
    hasBrokerSection,
    getDefaultPath,
    signInWithPassword,
    signOut
  }
}

export const useAuth = createSharedComposable(_useAuth)
