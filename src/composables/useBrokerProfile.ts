import { ref, readonly, computed, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import {
  getBrokerProfile,
  patchBrokerProfile,
  saveBrokerProfile,
  type BrokerProfileData
} from '../lib/broker-profile'
import { useAuth } from './useAuth'

export interface BrokerProfileState {
  fullName?: string
  companyName?: string
  bio?: string
  yearsInBusiness?: number
  languages?: string[]
  primaryEmail?: string
  personalEmail?: string
  directPhone?: string
  officeAddress?: string
  websiteUrl?: string
  preferredContact?: 'email' | 'phone' | 'text'
  assistantName?: string
  assistantEmail?: string
}

export const BROKER_PROFILE_REQUIRED_FIELDS: Array<keyof BrokerProfileState> = [
  'fullName',
  'companyName',
  'languages',
  'primaryEmail',
  'directPhone',
  'officeAddress'
]

export const BROKER_PROFILE_OPTIONAL_FIELDS: Array<keyof BrokerProfileState> = [
  'bio',
  'yearsInBusiness',
  'personalEmail',
  'websiteUrl',
  'preferredContact',
  'assistantName',
  'assistantEmail'
]

export const isBrokerProfileFieldFilled = (
  data: Partial<BrokerProfileState> | undefined,
  field: keyof BrokerProfileState
) => {
  const value = data?.[field]
  return value !== undefined
    && value !== null
    && value !== ''
    && (!Array.isArray(value) || value.length > 0)
}

const _useBrokerProfile = () => {
  const auth = useAuth()
  const state = ref<BrokerProfileState>({})
  const draft = ref<BrokerProfileState>({})
  const loading = ref(false)
  const loaded = ref(false)
  const hasRow = ref(false)
  const loadedUserId = ref<string | null>(null)
  let activeLoadToken = 0

  const isEditing = ref(false)
  const isDirty = ref(false)
  const baseline = ref<string>('')

  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && !Number.isNaN(v) ? v : null

  const syncDraftWithState = () => {
    draft.value = clone(state.value)
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
  }

  const toDbPatch = (data: Partial<BrokerProfileState>): Partial<BrokerProfileData> => {
    const out: Partial<BrokerProfileData> = {}
    if ('fullName' in data) out.full_name = data.fullName ?? null
    if ('companyName' in data) out.company_name = data.companyName ?? null
    if ('bio' in data) out.bio = data.bio ?? null
    if ('yearsInBusiness' in data) out.years_in_business = numOrNull(data.yearsInBusiness)
    if ('languages' in data) out.languages = data.languages ?? []
    if ('primaryEmail' in data) out.primary_email = data.primaryEmail ?? null
    if ('personalEmail' in data) out.personal_email = data.personalEmail ?? null
    if ('directPhone' in data) out.direct_phone = data.directPhone ?? null
    if ('officeAddress' in data) out.office_address = data.officeAddress ?? null
    if ('websiteUrl' in data) out.website_url = data.websiteUrl ?? null
    if ('preferredContact' in data) out.preferred_contact = data.preferredContact ?? null
    if ('assistantName' in data) out.assistant_name = data.assistantName ?? null
    if ('assistantEmail' in data) out.assistant_email = data.assistantEmail ?? null
    return out
  }

  const mapDatabaseToState = (db: Partial<BrokerProfileData>): BrokerProfileState => ({
    fullName: db.full_name || '',
    companyName: db.company_name || '',
    bio: db.bio || '',
    yearsInBusiness: db.years_in_business ?? undefined,
    languages: db.languages || [],
    primaryEmail: db.primary_email || '',
    personalEmail: db.personal_email || '',
    directPhone: db.direct_phone || '',
    officeAddress: db.office_address || '',
    websiteUrl: db.website_url || '',
    preferredContact: db.preferred_contact || undefined,
    assistantName: db.assistant_name || '',
    assistantEmail: db.assistant_email || ''
  })

  const resetProfile = () => {
    activeLoadToken++
    state.value = {}
    draft.value = {}
    baseline.value = ''
    isDirty.value = false
    isEditing.value = false
    loaded.value = false
    hasRow.value = false
    loadedUserId.value = null
    loading.value = false
  }

  const loadProfile = async (userId: string) => {
    const normalized = String(userId ?? '').trim()
    if (!normalized) {
      resetProfile()
      return
    }

    if (loaded.value && loadedUserId.value === normalized) return

    if (loadedUserId.value !== normalized) {
      resetProfile()
      loadedUserId.value = normalized
    }

    const token = ++activeLoadToken
    loading.value = true
    try {
      const profile = await getBrokerProfile(normalized)
      if (token !== activeLoadToken || loadedUserId.value !== normalized) return

      if (profile) {
        state.value = mapDatabaseToState(profile)
        hasRow.value = true
      } else {
        state.value = {}
        hasRow.value = false
      }

      syncDraftWithState()
      loaded.value = true
    } catch (error) {
      console.error('Failed to load broker profile:', error)
      if (token === activeLoadToken && loadedUserId.value === normalized) {
        state.value = {}
        hasRow.value = false
        loaded.value = false
        syncDraftWithState()
      }
    } finally {
      if (token === activeLoadToken) {
        loading.value = false
      }
    }
  }

  const startEditing = () => {
    if (isEditing.value) return
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
    isEditing.value = true
  }

  const cancelEditing = () => {
    draft.value = clone(state.value)
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
    isEditing.value = false
  }

  const commitEditing = async (userId: string, fields?: Array<keyof BrokerProfileState>) => {
    const normalized = String(userId ?? '').trim()
    if (!normalized) throw new Error('Missing user id')

    if (loadedUserId.value !== normalized) {
      resetProfile()
      loadedUserId.value = normalized
    }

    const selected = fields ?? (Object.keys(draft.value) as Array<keyof BrokerProfileState>)
    const partial = {} as Partial<BrokerProfileState>
    for (const key of selected) {
      ;(partial as Record<string, unknown>)[key] = draft.value[key]
    }

    loading.value = true
    try {
      const result = hasRow.value
        ? await patchBrokerProfile(normalized, toDbPatch(partial))
        : await saveBrokerProfile(normalized, toDbPatch(partial))

      state.value = mapDatabaseToState(result)
      syncDraftWithState()
      isEditing.value = false
      hasRow.value = true
      loaded.value = true
      return result
    } finally {
      loading.value = false
    }
  }

  watch(
    draft,
    () => {
      if (!isEditing.value) return
      isDirty.value = JSON.stringify(draft.value) !== baseline.value
    },
    { deep: true }
  )

  watch(
    () => auth.state.value.user?.id ?? null,
    (next, prev) => {
      if (next === prev) return
      resetProfile()
    }
  )

  const completionPercentage = computed(() => {
    let filledRequired = 0
    let filledOptional = 0

    BROKER_PROFILE_REQUIRED_FIELDS.forEach((field) => {
      if (isBrokerProfileFieldFilled(state.value, field)) filledRequired++
    })
    BROKER_PROFILE_OPTIONAL_FIELDS.forEach((field) => {
      if (isBrokerProfileFieldFilled(state.value, field)) filledOptional++
    })

    const requiredScore = (filledRequired / BROKER_PROFILE_REQUIRED_FIELDS.length) * 0.7
    const optionalScore = (filledOptional / BROKER_PROFILE_OPTIONAL_FIELDS.length) * 0.3
    return Math.round((requiredScore + optionalScore) * 100)
  })

  return {
    state: readonly(state),
    draft,
    loading: readonly(loading),
    loaded: readonly(loaded),
    isEditing: readonly(isEditing),
    isDirty: readonly(isDirty),
    completionPercentage,
    loadProfile,
    startEditing,
    cancelEditing,
    commitEditing,
    resetProfile
  }
}

export const useBrokerProfile = createSharedComposable(_useBrokerProfile)
