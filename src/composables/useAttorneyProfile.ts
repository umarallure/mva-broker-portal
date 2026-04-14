import { ref, readonly, computed, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { getAttorneyProfile, patchAttorneyProfile, saveAttorneyProfile, type AttorneyProfileData, type PricingTierKey } from '../lib/attorney-profile'
import { useAuth } from './useAuth'

export interface AttorneyProfileState {
  // Tab 1: General Information
  profilePhoto?: string
  fullName?: string
  firmName?: string
  barState?: string
  barNumber?: string
  barNumbers?: string[]
  bio?: string
  yearsExperience?: number
  languages?: string[]
  primaryEmail?: string
  personalEmail?: string
  directPhone?: string
  officeAddress?: string
  websiteUrl?: string
  preferredContact?: 'email' | 'phone' | 'text'
  assistantName?: string
  assistantEmail?: string
  blockedStates?: string[]
  
  // Tab 2: Expertise & Jurisdiction
  licensedStates?: string[]
  primaryCity?: string
  countiesCovered?: string[]
  federalCourts?: string
  primaryPracticeFocus?: string
  injuryCategories?: string[]
  exclusionaryCriteria?: string[]
  minimumCaseValue?: number
  
  // Tab 3: Capacity & Performance
  caseRatePerDeal?: number
  upfrontPaymentPercentage?: number
  paymentWindowDays?: number
  pricingTier?: PricingTierKey

  // Tab 4: Retainer Contract Document
  retainerContractDocumentPath?: string
  retainerContractDocumentName?: string
  retainerContractDocumentMimeType?: string
  retainerContractDocumentSizeBytes?: number
  retainerContractDocumentUploadedAt?: string
}

export const ATTORNEY_PROFILE_REQUIRED_FIELDS: Array<keyof AttorneyProfileState> = [
  'fullName',
  'firmName',
  'barNumbers',
  'languages',
  'directPhone',
  'officeAddress',
  'licensedStates',
  'primaryCity',
  'primaryPracticeFocus',
  'injuryCategories',
  'retainerContractDocumentPath'
]

export const ATTORNEY_PROFILE_OPTIONAL_FIELDS: Array<keyof AttorneyProfileState> = [
  'bio',
  'yearsExperience',
  'websiteUrl',
  'preferredContact',
  'assistantName',
  'assistantEmail',
  'countiesCovered',
  'federalCourts',
  'exclusionaryCriteria',
  'minimumCaseValue',
  'blockedStates',
  'caseRatePerDeal',
  'upfrontPaymentPercentage',
  'paymentWindowDays',
  'pricingTier'
]

export const isAttorneyProfileFieldFilled = (
  profileData: Partial<AttorneyProfileState> | undefined,
  field: keyof AttorneyProfileState
) => {
  const value = profileData?.[field]
  return value !== undefined
    && value !== null
    && value !== ''
    && (!Array.isArray(value) || value.length > 0)
}

const _useAttorneyProfile = () => {
  const auth = useAuth()
  const state = ref<AttorneyProfileState>({})
  const draft = ref<AttorneyProfileState>({})
  const loading = ref(false)
  const loaded = ref(false)
  const hasRow = ref(false)
  const loadedUserId = ref<string | null>(null)
  let activeLoadToken = 0

  const getLegacyBarNumberFromEncoded = (value: string) => {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return ''
    if (!trimmed.includes('|')) return trimmed
    const parts = trimmed.split('|')
    return String(parts[1] ?? '').trim()
  }

  const isEditing = ref(false)
  const isDirty = ref(false)
  const baseline = ref<string>('')

  const clone = <T>(v: T): T => {
    return JSON.parse(JSON.stringify(v)) as T
  }

  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' ? v : null

  const syncDraftWithState = () => {
    draft.value = clone(state.value)
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
  }

  const toDbPatch = (data: Partial<AttorneyProfileState>): Partial<AttorneyProfileData> => {
    const out: Partial<AttorneyProfileData> = {}

    if ('profilePhoto' in data) out.profile_photo_url = data.profilePhoto ? data.profilePhoto : null
    if ('fullName' in data) out.full_name = data.fullName ?? ''
    if ('firmName' in data) out.firm_name = data.firmName ?? ''
    if ('barNumbers' in data) {
      const nums = (data.barNumbers ?? []).map(v => v.trim()).filter(Boolean)
      out.bar_association_numbers = nums
      out.bar_association_number = nums[0] ? getLegacyBarNumberFromEncoded(nums[0]) : ''
    } else if ('barNumber' in data) {
      const n = (data.barNumber ?? '').trim()
      out.bar_association_number = n
      out.bar_association_numbers = n ? [n] : []
    }
    if ('bio' in data) out.professional_bio = data.bio ? data.bio : null
    if ('yearsExperience' in data) out.years_experience = numOrNull(data.yearsExperience)
    if ('languages' in data) out.languages_spoken = data.languages ?? []
    if ('primaryEmail' in data) out.primary_email = data.primaryEmail ?? ''
    if ('personalEmail' in data) out.personal_email = data.personalEmail ? data.personalEmail : null
    if ('directPhone' in data) out.direct_phone = data.directPhone ?? ''
    if ('officeAddress' in data) out.office_address = data.officeAddress ?? ''
    if ('websiteUrl' in data) out.website_url = data.websiteUrl ? data.websiteUrl : null
    if ('preferredContact' in data) out.preferred_contact_method = data.preferredContact ?? null
    if ('assistantName' in data) out.assistant_name = data.assistantName ? data.assistantName : null
    if ('assistantEmail' in data) out.assistant_email = data.assistantEmail ? data.assistantEmail : null
    if ('blockedStates' in data) out.blocked_states = data.blockedStates ?? []

    if ('licensedStates' in data) out.licensed_states = data.licensedStates ?? []
    if ('primaryCity' in data) out.primary_city = data.primaryCity ?? ''
    if ('countiesCovered' in data) out.counties_covered = data.countiesCovered ?? []
    if ('federalCourts' in data) out.federal_court_admissions = data.federalCourts ? data.federalCourts : null

    if ('primaryPracticeFocus' in data) out.primary_practice_focus = data.primaryPracticeFocus ?? ''
    if ('injuryCategories' in data) out.injury_categories = data.injuryCategories ?? []
    if ('exclusionaryCriteria' in data) out.exclusionary_criteria = data.exclusionaryCriteria ?? []
    if ('minimumCaseValue' in data) out.minimum_case_value = numOrNull(data.minimumCaseValue)

    if ('caseRatePerDeal' in data) out.case_rate_per_deal = numOrNull(data.caseRatePerDeal)
    if ('upfrontPaymentPercentage' in data) out.upfront_payment_percentage = numOrNull(data.upfrontPaymentPercentage)
    if ('paymentWindowDays' in data) out.payment_window_days = numOrNull(data.paymentWindowDays)
    if ('pricingTier' in data) out.pricing_tier = (data.pricingTier ?? null) as AttorneyProfileData['pricing_tier']
    if ('retainerContractDocumentPath' in data) out.retainer_contract_document_path = data.retainerContractDocumentPath ?? null
    if ('retainerContractDocumentName' in data) out.retainer_contract_document_name = data.retainerContractDocumentName ?? null
    if ('retainerContractDocumentMimeType' in data) out.retainer_contract_document_mime_type = data.retainerContractDocumentMimeType ?? null
    if ('retainerContractDocumentSizeBytes' in data) out.retainer_contract_document_size_bytes = numOrNull(data.retainerContractDocumentSizeBytes)
    if ('retainerContractDocumentUploadedAt' in data) out.retainer_contract_document_uploaded_at = data.retainerContractDocumentUploadedAt ?? null

    return out
  }

  const mapDatabaseToState = (dbProfile: Partial<AttorneyProfileData>): AttorneyProfileState => {
    const barNumbers = (dbProfile.bar_association_numbers ?? [])
      .map(v => String(v).trim())
      .filter(Boolean)
    const legacyBarNumber = (dbProfile.bar_association_number ?? '').trim()
    const mergedBarNumbers = barNumbers.length
      ? barNumbers
      : (legacyBarNumber ? [legacyBarNumber] : [])

    return {
      profilePhoto: dbProfile.profile_photo_url || '',
      fullName: dbProfile.full_name || '',
      firmName: dbProfile.firm_name || '',
      barNumber: '',
      barNumbers: mergedBarNumbers,
      bio: dbProfile.professional_bio || '',
      yearsExperience: dbProfile.years_experience ?? undefined,
      languages: dbProfile.languages_spoken || [],
      primaryEmail: dbProfile.primary_email || '',
      personalEmail: dbProfile.personal_email || '',
      directPhone: dbProfile.direct_phone || '',
      officeAddress: dbProfile.office_address || '',
      websiteUrl: dbProfile.website_url || '',
      preferredContact: dbProfile.preferred_contact_method || 'email',
      assistantName: dbProfile.assistant_name || '',
      assistantEmail: dbProfile.assistant_email || '',
      blockedStates: dbProfile.blocked_states || [],
      licensedStates: dbProfile.licensed_states || [],
      primaryCity: dbProfile.primary_city || '',
      countiesCovered: dbProfile.counties_covered || [],
      federalCourts: dbProfile.federal_court_admissions || '',
      primaryPracticeFocus: dbProfile.primary_practice_focus || '',
      injuryCategories: dbProfile.injury_categories || [],
      exclusionaryCriteria: dbProfile.exclusionary_criteria || [],
      minimumCaseValue: dbProfile.minimum_case_value ?? undefined,
      caseRatePerDeal: dbProfile.case_rate_per_deal ?? undefined,
      upfrontPaymentPercentage: dbProfile.upfront_payment_percentage ?? undefined,
      paymentWindowDays: dbProfile.payment_window_days ?? undefined,
      pricingTier: dbProfile.pricing_tier || undefined,
      retainerContractDocumentPath: dbProfile.retainer_contract_document_path || '',
      retainerContractDocumentName: dbProfile.retainer_contract_document_name || '',
      retainerContractDocumentMimeType: dbProfile.retainer_contract_document_mime_type || '',
      retainerContractDocumentSizeBytes: dbProfile.retainer_contract_document_size_bytes ?? undefined,
      retainerContractDocumentUploadedAt: dbProfile.retainer_contract_document_uploaded_at || ''
    }
  }

  const loadProfile = async (userId: string) => {
    const normalizedUserId = String(userId ?? '').trim()
    if (!normalizedUserId) {
      resetProfile()
      return
    }

    if (loaded.value && loadedUserId.value === normalizedUserId) return

    if (loadedUserId.value !== normalizedUserId) {
      resetProfile()
      loadedUserId.value = normalizedUserId
    }

    const loadToken = ++activeLoadToken

    loading.value = true
    try {
      const profile = await getAttorneyProfile(normalizedUserId)
      if (loadToken !== activeLoadToken || loadedUserId.value !== normalizedUserId) return

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
      if (loadToken === activeLoadToken && loadedUserId.value === normalizedUserId) {
        state.value = {}
        hasRow.value = false
        loaded.value = false
        syncDraftWithState()
      }
      console.error('Failed to load attorney profile:', error)
    } finally {
      if (loadToken === activeLoadToken) {
        loading.value = false
      }
    }
  }

  const saveProfile = async (userId: string, data: Partial<AttorneyProfileState>) => {
    const normalizedUserId = String(userId ?? '').trim()
    if (!normalizedUserId) {
      throw new Error('Missing user id')
    }

    if (loadedUserId.value !== normalizedUserId) {
      resetProfile()
      loadedUserId.value = normalizedUserId
    }

    loading.value = true
    try {
      // Merge with existing state
      const mergedData = { ...state.value, ...data }
      
      // Map frontend fields to database fields
      const dbData: Partial<AttorneyProfileData> = {
        profile_photo_url: mergedData.profilePhoto || null,
        full_name: mergedData.fullName ?? '',
        firm_name: mergedData.firmName ?? '',
        bar_association_number: getLegacyBarNumberFromEncoded((mergedData.barNumbers?.[0] ?? '').trim()),
        bar_association_numbers: (mergedData.barNumbers ?? []).map(v => v.trim()).filter(Boolean),
        professional_bio: mergedData.bio || null,
        years_experience: numOrNull(mergedData.yearsExperience),
        languages_spoken: mergedData.languages || [],
        primary_email: mergedData.primaryEmail ?? '',
        personal_email: mergedData.personalEmail || null,
        direct_phone: mergedData.directPhone ?? '',
        office_address: mergedData.officeAddress ?? '',
        website_url: mergedData.websiteUrl || null,
        preferred_contact_method: mergedData.preferredContact || null,
        assistant_name: mergedData.assistantName || null,
        assistant_email: mergedData.assistantEmail || null,
        licensed_states: mergedData.licensedStates || [],
        primary_city: mergedData.primaryCity ?? '',
        counties_covered: mergedData.countiesCovered || [],
        federal_court_admissions: mergedData.federalCourts || null,
        primary_practice_focus: mergedData.primaryPracticeFocus ?? '',
        injury_categories: mergedData.injuryCategories || [],
        exclusionary_criteria: mergedData.exclusionaryCriteria || [],
        minimum_case_value: numOrNull(mergedData.minimumCaseValue),
        case_rate_per_deal: numOrNull(mergedData.caseRatePerDeal),
        upfront_payment_percentage: numOrNull(mergedData.upfrontPaymentPercentage),
        payment_window_days: numOrNull(mergedData.paymentWindowDays),
        pricing_tier: (mergedData.pricingTier || null) as AttorneyProfileData['pricing_tier'],
        retainer_contract_document_path: mergedData.retainerContractDocumentPath || null,
        retainer_contract_document_name: mergedData.retainerContractDocumentName || null,
        retainer_contract_document_mime_type: mergedData.retainerContractDocumentMimeType || null,
        retainer_contract_document_size_bytes: numOrNull(mergedData.retainerContractDocumentSizeBytes),
        retainer_contract_document_uploaded_at: mergedData.retainerContractDocumentUploadedAt || null
      }

      const profile = await saveAttorneyProfile(normalizedUserId, dbData)
      if (profile) {
        state.value = mapDatabaseToState(profile)
        syncDraftWithState()
        loaded.value = true
        hasRow.value = true
      }
      return profile
    } finally {
      loading.value = false
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

  const commitEditing = async (userId: string, fields?: Array<keyof AttorneyProfileState>) => {
    const normalizedUserId = String(userId ?? '').trim()
    if (!normalizedUserId) {
      throw new Error('Missing user id')
    }

    if (loadedUserId.value !== normalizedUserId) {
      resetProfile()
      loadedUserId.value = normalizedUserId
    }

    const selected = fields ?? []
    const partial = {} as Partial<AttorneyProfileState>
    for (const key of selected) {
      ;(partial as Record<string, unknown>)[key] = draft.value[key]
    }

    loading.value = true
    try {
      const result = hasRow.value
        ? await patchAttorneyProfile(normalizedUserId, toDbPatch(partial))
        : await saveAttorneyProfile(normalizedUserId, toDbPatch(partial))

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

  watch(
    () => auth.state.value.user?.id ?? null,
    (nextUserId, previousUserId) => {
      if (nextUserId === previousUserId) return
      resetProfile()
    }
  )

  const completionPercentage = computed(() => {
    let filledRequired = 0
    let filledOptional = 0

    ATTORNEY_PROFILE_REQUIRED_FIELDS.forEach((field) => {
      if (isAttorneyProfileFieldFilled(state.value, field)) {
        filledRequired++
      }
    })

    ATTORNEY_PROFILE_OPTIONAL_FIELDS.forEach((field) => {
      if (isAttorneyProfileFieldFilled(state.value, field)) {
        filledOptional++
      }
    })

    const requiredWeight = 0.7
    const optionalWeight = 0.3

    const requiredScore = (filledRequired / ATTORNEY_PROFILE_REQUIRED_FIELDS.length) * requiredWeight
    const optionalScore = (filledOptional / ATTORNEY_PROFILE_OPTIONAL_FIELDS.length) * optionalWeight

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
    saveProfile,
    startEditing,
    cancelEditing,
    commitEditing,
    resetProfile
  }
}

export const useAttorneyProfile = createSharedComposable(_useAttorneyProfile)
