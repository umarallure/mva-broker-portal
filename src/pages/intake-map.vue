<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import usSvgFallbackRaw from '../assets/us.svg?raw'

import { useAuth } from '../composables/useAuth'
import ProductGuideHint from '../components/product-guide/ProductGuideHint.vue'
import { productGuideHints } from '../data/product-guide-hints'
import { ensureAttorneyProfileExists, getAttorneyProfile, patchAttorneyProfile } from '../lib/attorney-profile'
import { createOrder, listOpenOrdersForLawyer, listOrdersForLawyer, type OrderRow } from '../lib/orders'
import { upsertGeneralCoverage, getGeneralCoverageForAttorney, type GeneralCoverageRow } from '../lib/general-coverage'
import { US_STATES } from '../lib/us-states'

const US_SVG_ASSET_URL = new URL('../assets/us.svg', import.meta.url).toString()

type StateOrders = {
  code: string
  name: string
  openOrders: number
}

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const orderMapHints = productGuideHints.orderMap
const loading = ref(false)
const tooltip = ref({ open: false, x: 0, y: 0, state: null as StateOrders | null, myOrder: null as OrderRow | null, blocked: false })
const mapRoot = ref<HTMLDivElement | null>(null)
const tooltipEl = ref<HTMLDivElement | null>(null)

const states = ref<StateOrders[]>([])

const myOpenOrders = ref<OrderRow[]>([])
const myClosedOrders = ref<OrderRow[]>([])

const DEFAULT_MAX_ORDER_STATES = 5
const maxOrderStates = ref<number>(DEFAULT_MAX_ORDER_STATES)

const myOrderByStateCode = computed(() => {
  const map = new Map<string, OrderRow>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (!code) return
      if (!map.has(code)) map.set(code, o)
    })
  })
  return map
})

const stateByCode = computed(() => {
  const map = new Map<string, StateOrders>()
  states.value.forEach(s => map.set(s.code, s))
  return map
})

const isAccountInactive = computed(() => {
  const status = auth.state.value.profile?.account_status ?? null
  return status === 'inactive'
})

const COLOR_NEUTRAL = '#d1d5db'
const COLOR_GREEN = '#22c55e'
const COLOR_YELLOW = '#eab308'
const COLOR_RED = '#ef4444'
// General Coverage palette
const COLOR_GC_NOT_OPEN = '#94a3b8'
const TEMPORARILY_UNAVAILABLE_STATE_CODES = ['CA'] as const
const TEMPORARILY_UNAVAILABLE_STATE_SET = new Set<string>(TEMPORARILY_UNAVAILABLE_STATE_CODES)

// ── Temporary: Commercial orders paused ──
const COMMERCIAL_ORDERS_PAUSED = true

const VALID_STATE_CODE_SET = new Set(US_STATES.map((state) => state.code))

const normalizeStateCode = (stateCode: unknown) => String(stateCode || '').trim().toUpperCase()

const normalizeValidStateCodes = (stateCodes: unknown) => {
  if (!Array.isArray(stateCodes)) return [] as string[]

  const codes = new Set<string>()
  stateCodes.forEach((stateCode) => {
    const code = normalizeStateCode(stateCode)
    if (VALID_STATE_CODE_SET.has(code)) codes.add(code)
  })
  return Array.from(codes)
}

const isTemporarilyUnavailableState = (stateCode: string) => {
  return TEMPORARILY_UNAVAILABLE_STATE_SET.has(normalizeStateCode(stateCode))
}

const getTemporarilyUnavailableStateError = (stateCode: string) => {
  const code = normalizeStateCode(stateCode)
  if (code === 'CA') return 'Temporarily not accepting orders in California.'
  return 'Temporarily not accepting orders in this state.'
}

const isOrderInProgress = (order: Pick<OrderRow, 'quota_filled' | 'quota_total'>) => {
  return orderProgressPercent(order) > 0
}

const openOrdersForStateCode = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return [] as OrderRow[]
  return myOpenOrders.value.filter((o) => (o.target_states ?? []).some((s) => String(s || '').trim().toUpperCase() === code))
}

const hasOpenOrderForStateCode = (stateCode: string) => {
  return openOrdersForStateCode(stateCode).length > 0
}

const hasProgressInOpenOrdersForStateCode = (stateCode: string) => {
  return openOrdersForStateCode(stateCode).some((o) => isOrderInProgress(o))
}

const hasClosedOrderForStateCode = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return false
  return myClosedOrders.value.some((o) => (o.target_states ?? []).some((s) => String(s || '').trim().toUpperCase() === code))
}

const getStateFillColor = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) {
    return hasProgressInOpenOrdersForStateCode(stateCode) ? COLOR_YELLOW : COLOR_GREEN
  }

  if (hasClosedOrderForStateCode(stateCode)) return COLOR_RED
  return COLOR_NEUTRAL
}

const getMyOrderBadgeColor = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) return hasProgressInOpenOrdersForStateCode(stateCode) ? 'warning' : 'success'
  if (hasClosedOrderForStateCode(stateCode)) return 'error'
  return 'neutral'
}

const getMyOrderBadgeLabel = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) return hasProgressInOpenOrdersForStateCode(stateCode) ? 'In Progress' : 'Pending'
  if (hasClosedOrderForStateCode(stateCode)) return 'Fulfilled / Expired'
  return 'No orders'
}

// Display-friendly status for orders
const getOrderDisplayStatus = (order: OrderRow) => {
  if (order.status === 'OPEN') {
    return order.quota_filled > 0 ? 'In Progress' : 'Pending'
  }
  return order.status
}

// ── Stats ──────────────────────────────────────────────────────────────────
const allOrders = computed(() => [...myOpenOrders.value, ...myClosedOrders.value])
const statsTotal = computed(() => allOrders.value.length)
const statsOpen = computed(() => myOpenOrders.value.length)
const statsPending = computed(() => myOpenOrders.value.filter(o => (o.quota_filled ?? 0) === 0).length)
const statsCompleted = computed(() => myClosedOrders.value.filter(o => o.status === 'FULFILLED').length)

// ── Order filters ──────────────────────────────────────────────────────────
const showOrderFilters = ref(false)

// Multi-select filters — empty array = "all" (no filter applied)
const filterStates = ref<string[]>([])
const filterInjurySeverity = ref<string[]>([])
const filterInsuranceStatus = ref<string[]>([])
const filterCaseCategory = ref<string[]>([])
const filterLiabilityStatus = ref<string[]>([])
const filterMedicalTreatment = ref<string[]>([])
const filterLanguage = ref<string[]>([])
// Expiry is a date-range concept so stays single-select
const filterExpiry = ref<string>('all')

// Safe accessor for nested criteria fields
const getOrderCriteria = (order: OrderRow, field: string): unknown => {
  return (order.criteria as Record<string, unknown>)?.[field]
}

// Dynamic option lists derived from existing orders
const orderStateRealCodes = computed(() => {
  const codes = new Set<string>()
  allOrders.value.forEach(o => {
    ;(o.target_states ?? []).forEach(s => {
      const code = String(s || '').trim().toUpperCase()
      if (code) codes.add(code)
    })
  })
  return Array.from(codes).sort()
})

const orderStateFilterOptions = computed(() => [
  { label: 'All states', value: '__all__' },
  ...orderStateRealCodes.value.map(c => ({ label: c, value: c }))
])

// "All states" toggle: selecting __all__ selects every real state; deselecting it clears all
let _skipStatesWatch = false
watch(filterStates, (newVal, oldVal) => {
  if (_skipStatesWatch) return
  const hadAll = oldVal.includes('__all__')
  const hasAll = newVal.includes('__all__')
  const realCodes = orderStateRealCodes.value

  _skipStatesWatch = true
  if (hasAll && !hadAll) {
    // Just checked "All states" → select every real code
    filterStates.value = ['__all__', ...realCodes]
  } else if (!hasAll && hadAll) {
    // Just unchecked "All states" → clear everything
    filterStates.value = []
  } else if (hadAll && hasAll) {
    // Had all selected, user unchecked one individual state → remove __all__ too
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length < realCodes.length) {
      filterStates.value = withoutAll
    }
  } else if (!hadAll && !hasAll) {
    // User checked all individual states manually → add __all__
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length === realCodes.length && realCodes.length > 0) {
      filterStates.value = ['__all__', ...realCodes]
    }
  }
  _skipStatesWatch = false
})

const orderLanguageFilterOptions = computed(() => {
  const langs = new Set<string>()
  allOrders.value.forEach(o => {
    const orderLangs = getOrderCriteria(o, 'languages')
    if (Array.isArray(orderLangs)) {
      orderLangs.forEach(l => { if (typeof l === 'string' && l.trim()) langs.add(l.trim()) })
    }
  })
  return Array.from(langs).sort().map(l => ({ label: l, value: l }))
})

const filterCaseCategoryOptions = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Commercial Cases', value: 'Commercial Cases' },
]

const filterExpiryOptions = [
  { label: 'Any expiry', value: 'all' },
  { label: 'Next 30 days', value: '30' },
  { label: 'Next 60 days', value: '60' },
  { label: 'Next 90 days', value: '90' },
  { label: 'No expiry date', value: 'no_expiry' },
]

const activeFilterCount = computed(() => {
  let count = 0
  if (filterStates.value.filter(v => v !== '__all__').length > 0) count++
  if (filterInjurySeverity.value.length > 0) count++
  if (filterInsuranceStatus.value.length > 0) count++
  if (filterCaseCategory.value.length > 0) count++
  if (filterLiabilityStatus.value.length > 0) count++
  if (filterMedicalTreatment.value.length > 0) count++
  if (filterLanguage.value.length > 0) count++
  if (filterExpiry.value !== 'all') count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0)

const resetAllFilters = () => {
  filterStates.value = []
  filterInjurySeverity.value = []
  filterInsuranceStatus.value = []
  filterCaseCategory.value = []
  filterLiabilityStatus.value = []
  filterMedicalTreatment.value = []
  filterLanguage.value = []
  filterExpiry.value = 'all'
}

const filteredOrders = computed(() => {
  let orders = allOrders.value

  if (filterCaseCategory.value.length > 0) {
    orders = orders.filter(o => filterCaseCategory.value.includes(normalizeCaseType(String(o.case_type || ''))))
  }

  const selectedStates = filterStates.value.filter(v => v !== '__all__')
  if (selectedStates.length > 0) {
    orders = orders.filter(o =>
      (o.target_states ?? []).some(s => selectedStates.includes(String(s || '').trim().toUpperCase()))
    )
  }

  if (filterInjurySeverity.value.length > 0) {
    orders = orders.filter(o => {
      const sev = getOrderCriteria(o, 'injury_severity')
      if (!Array.isArray(sev)) return false
      return sev.some(s => filterInjurySeverity.value.includes(String(s)))
    })
  }

  if (filterInsuranceStatus.value.length > 0) {
    orders = orders.filter(o => {
      const val = getOrderCriteria(o, 'insurance_status')
      return typeof val === 'string' && filterInsuranceStatus.value.includes(val)
    })
  }

  if (filterLiabilityStatus.value.length > 0) {
    orders = orders.filter(o => {
      const val = getOrderCriteria(o, 'liability_status')
      return typeof val === 'string' && filterLiabilityStatus.value.includes(val)
    })
  }

  if (filterMedicalTreatment.value.length > 0) {
    orders = orders.filter(o => {
      const val = getOrderCriteria(o, 'medical_treatment')
      return typeof val === 'string' && filterMedicalTreatment.value.includes(val)
    })
  }

  if (filterLanguage.value.length > 0) {
    orders = orders.filter(o => {
      const langs = getOrderCriteria(o, 'languages')
      if (!Array.isArray(langs)) return false
      return langs.some(l => filterLanguage.value.includes(String(l)))
    })
  }

  if (filterExpiry.value !== 'all') {
    const now = new Date()
    if (filterExpiry.value === 'no_expiry') {
      orders = orders.filter(o => new Date(o.expires_at || '').getFullYear() >= 2099)
    } else {
      const days = Number(filterExpiry.value)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() + days)
      orders = orders.filter(o => {
        const exp = new Date(o.expires_at || '')
        return exp >= now && exp <= cutoff
      })
    }
  }

  return orders
})

const refreshMyOrders = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    myOpenOrders.value = []
    return
  }

  myOpenOrders.value = await listOpenOrdersForLawyer(userId)
}

const refreshMyClosedOrders = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    myClosedOrders.value = []
    return
  }

  myClosedOrders.value = await listOrdersForLawyer({
    lawyerId: userId,
    statuses: ['FULFILLED', 'EXPIRED']
  })
}

const refreshAll = async () => {
  loading.value = true
  try {
    await refreshMyOrders()
    await refreshMyClosedOrders()
    await loadBlockedStates()
    await refreshGeneralCoverage()
    rebuildStatesFromMyOrders()
    applyMapColors()
  } finally {
    loading.value = false
  }
}

const orderProgressPercent = (order: Pick<OrderRow, 'quota_filled' | 'quota_total'>) => {
  const total = Number(order.quota_total)
  const filled = Number(order.quota_filled)
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(filled) || filled <= 0) return 0
  const pct = (filled / total) * 100
  if (!Number.isFinite(pct)) return 0
  return Math.max(0, Math.min(100, Math.round(pct)))
}

type MapFilter = 'all' | 'no_orders' | 'has_orders' | 'blocked'

const mapFilter = ref<MapFilter>('all')

const mapFilterOptions = [
  { label: 'All states', value: 'all' },
  { label: 'No orders', value: 'no_orders' },
  { label: 'Has open orders', value: 'has_orders' },
  { label: 'Unavailable states', value: 'blocked' }
]

watch(mapFilter, () => {
  applyMapColors()
})

const blockMode = ref(false)
const blockedStateCodes = ref<string[]>([])
const urgencyOrdersEnabled = ref(true)
const urgencyOrderAccessModalOpen = ref(false)

const blockedStateSet = computed(() => {
  return new Set(normalizeValidStateCodes(blockedStateCodes.value))
})

const canUseUrgencyOrders = computed(() => urgencyOrdersEnabled.value)

const isStateUnavailableForOrdering = (stateCode: string) => {
  const code = normalizeStateCode(stateCode)
  if (!code) return true
  return blockedStateSet.value.has(code) || isTemporarilyUnavailableState(code)
}

const blockedStorageKey = computed(() => {
  const userId = auth.state.value.user?.id ?? ''
  return userId ? `intakeMapBlockedStates:${userId}` : 'intakeMapBlockedStates:anonymous'
})

const loadBlockedStatesFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(blockedStorageKey.value)
    if (!raw) return [] as string[]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : ([] as string[])
  } catch {
    return [] as string[]
  }
}

const saveBlockedStatesToLocalStorage = (codes: string[]) => {
  try {
    localStorage.setItem(blockedStorageKey.value, JSON.stringify(codes))
  } catch {
    // ignore
  }
}

const loadBlockedStates = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    blockedStateCodes.value = []
    urgencyOrdersEnabled.value = true
    maxOrderStates.value = DEFAULT_MAX_ORDER_STATES
    return
  }

  try {
    const profile = await getAttorneyProfile(userId)
    const raw = (profile as unknown as Record<string, unknown>)?.blocked_states
    const codes = Array.isArray(raw) ? normalizeValidStateCodes(raw) : null
    if (codes) {
      blockedStateCodes.value = codes
      saveBlockedStatesToLocalStorage(codes)
    } else {
      blockedStateCodes.value = loadBlockedStatesFromLocalStorage()
    }

    const rawUrgencyOrdersEnabled = (profile as unknown as Record<string, unknown>)?.urgency_orders_enabled
    urgencyOrdersEnabled.value = rawUrgencyOrdersEnabled === false ? false : true

    const rawLimit = (profile as unknown as Record<string, unknown>)?.order_limit
    const n = Number(rawLimit)
    if (Number.isFinite(n) && n >= 1) {
      maxOrderStates.value = Math.floor(n)
    } else {
      maxOrderStates.value = DEFAULT_MAX_ORDER_STATES
    }

    return
  } catch {
    urgencyOrdersEnabled.value = true
  }

  blockedStateCodes.value = loadBlockedStatesFromLocalStorage()
  maxOrderStates.value = DEFAULT_MAX_ORDER_STATES
}

let persistBlockedStatesTimer: number | null = null
watch(blockedStateCodes, () => {
  applyMapColors()

  const userId = auth.state.value.user?.id ?? null
  if (!userId) return

  const snapshot = blockedStateCodes.value.slice()
  saveBlockedStatesToLocalStorage(snapshot)

  if (persistBlockedStatesTimer) window.clearTimeout(persistBlockedStatesTimer)
  persistBlockedStatesTimer = window.setTimeout(async () => {
    try {
      await patchAttorneyProfile(userId, { blocked_states: snapshot })
    } catch {
      // keep localStorage fallback
    }
  }, 500)
}, { deep: true })

const myOpenOrderCountByState = computed(() => {
  const map = new Map<string, number>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (!code) return
      map.set(code, (map.get(code) ?? 0) + 1)
    })
  })
  return map
})

const rebuildStatesFromMyOrders = () => {
  const counts = myOpenOrderCountByState.value
  states.value = US_STATES.map((s) => {
    const openOrders = counts.get(s.code) ?? 0
    return {
      code: s.code,
      name: s.name,
      openOrders
    }
  })
}

const createOrderOpen = ref(false)
const pendingStateCode = ref<string | null>(null)

const createOrderStep = ref<1 | 2>(1)
const orderVerifyPhrase = 'CONFIRM'
const orderVerifyInput = ref('')
const orderVerifyTouched = ref(false)

const orderVerifyIsValid = computed(() => {
  return String(orderVerifyInput.value || '').trim().toUpperCase() === orderVerifyPhrase
})

const orderVerifyError = computed(() => {
  if (!orderVerifyTouched.value) return undefined
  if (orderVerifyIsValid.value) return undefined
  return `Type ${orderVerifyPhrase} to continue.`
})

const orderForm = ref({
  stateCode: '' as string,
  caseCategory: 'Consumer Cases' as string,
  injurySeverity: [] as string[],
  liabilityStatus: 'clear_only' as 'clear_only' | 'disputed_ok',
  insuranceStatus: 'insured_only' as 'insured_only' | 'uninsured_ok',
  medicalTreatment: 'ongoing' as string,
  languages: ['English'] as string[],
  noPriorAttorney: true as boolean,
  quotaTotal: 0 as number,
  expiresInDays: 30 as number
})

const createOrderSubmitting = ref(false)
const NO_CRITERIA_INJURY_SEVERITY = 'no_criteria'

// Auto-adjust quota when switching category (Commercial max is 1)
watch(() => orderForm.value.caseCategory, () => {
  const max = maxQuotaForCategory.value
  if (orderForm.value.quotaTotal > max) {
    orderForm.value.quotaTotal = max
  }
})

watch(() => [...orderForm.value.injurySeverity], (selected, previous) => {
  if (!selected.includes(NO_CRITERIA_INJURY_SEVERITY) || selected.length <= 1) return

  orderForm.value.injurySeverity = previous.includes(NO_CRITERIA_INJURY_SEVERITY)
    ? selected.filter(value => value !== NO_CRITERIA_INJURY_SEVERITY)
    : [NO_CRITERIA_INJURY_SEVERITY]
})

const selectedStateName = computed(() => {
  const code = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!code) return ''
  return US_STATES.find(s => s.code === code)?.name ?? code
})

const isCommercialSelected = computed(() => orderForm.value.caseCategory === 'Commercial Cases')

const maxQuotaForCategory = computed(() => {
  return isCommercialSelected.value ? 1 : 5
})

const quotaError = computed(() => {
  const raw = Number(orderForm.value.quotaTotal)
  const max = maxQuotaForCategory.value
  if (!Number.isFinite(raw) || raw <= max) return null

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return 'Select a state for placing this order.'

  if (max === 1) {
    return `Commercial Cases allow only 1 case per order. Please set quota to 1.`
  }
  return `Maximum ${max} cases are allowed per order in ${selectedStateName.value}. Please reduce your quota to ${max} or less.`
})

// Normalize legacy case type names to current category names
const normalizeCaseType = (caseType: string): string => {
  const t = caseType.trim().toLowerCase()
  if (t.includes('motor vehicle') || t.includes('mva') || t.includes('consumer')) {
    return 'Consumer Cases'
  }
  if (t.includes('commercial')) {
    return 'Commercial Cases'
  }
  return caseType.trim()
}

// Compute which case categories the attorney already has in the selected state (normalized)
const existingCaseTypesForSelectedState = computed(() => {
  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return new Set<string>()
  const types = new Set<string>()
  myOpenOrders.value.forEach((o) => {
    const matchesState = (o.target_states ?? []).some(
      (s) => String(s || '').trim().toUpperCase() === stateCode
    )
    if (matchesState) types.add(normalizeCaseType(String(o.case_type || '')))
  })
  return types
})

// Count how many open orders the attorney has in the selected state
const openOrderCountForSelectedState = computed(() => {
  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return 0
  return myOpenOrders.value.filter((o) =>
    (o.target_states ?? []).some((s) => String(s || '').trim().toUpperCase() === stateCode)
  ).length
})

// Validation: prevent duplicate case type in same state
const duplicateCaseTypeError = computed(() => {
  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return null
  const caseType = String(orderForm.value.caseCategory || '').trim()
  if (!caseType) return null

  if (existingCaseTypesForSelectedState.value.has(caseType)) {
    return `A "${caseType}" order is already open in ${selectedStateName.value}. Please select another case category to create an order.`
  }
  return null
})

// Validation: max 2 orders per state (one per case category)
const maxOrdersPerStateError = computed(() => {
  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return null

  if (openOrderCountForSelectedState.value >= 2) {
    return `You already have 2 orders in ${selectedStateName.value} (maximum allowed). You cannot create more orders in this state.`
  }
  return null
})

// Validation: 5-state ordering limit (new state only)
const maxOrderStatesError = computed(() => {
  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return null
  if (isTemporarilyUnavailableState(stateCode)) {
    return getTemporarilyUnavailableStateError(stateCode)
  }
  if (!canOrderInState(stateCode)) {
    return `You already have active orders in ${MAX_ORDER_STATES.value} states (the maximum allowed). To place orders in a new state, please close or wait for existing orders to expire, or contact your account manager.`
  }
  return null
})

// Validation: commercial orders temporarily paused
const commercialOrdersPausedError = computed(() => {
  if (!COMMERCIAL_ORDERS_PAUSED) return null
  if (orderForm.value.caseCategory !== 'Commercial Cases') return null
  return 'Commercial case orders are temporarily closed. Order availability will open soon.'
})

// Combined order validation error
const orderValidationError = computed(() => {
  return commercialOrdersPausedError.value || maxOrderStatesError.value || maxOrdersPerStateError.value || duplicateCaseTypeError.value || quotaError.value || null
})

const resetOrderForm = () => {
  orderForm.value = {
    stateCode: '',
    caseCategory: 'Consumer Cases',
    injurySeverity: [],
    liabilityStatus: 'clear_only',
    insuranceStatus: 'insured_only',
    medicalTreatment: 'ongoing',
    languages: ['English'],
    noPriorAttorney: true,
    quotaTotal: 0,
    expiresInDays: 30
  }
}

const openCreateOrder = () => {
  if (!canUseUrgencyOrders.value) {
    blockUrgencyOrderAccess()
    return
  }

  pendingStateCode.value = null
  createOrderOpen.value = true
  createOrderStep.value = 1
  orderVerifyInput.value = ''
  orderVerifyTouched.value = false
}

const openCreateOrderForState = (stateCode: string) => {
  if (!canUseUrgencyOrders.value) {
    blockUrgencyOrderAccess()
    return
  }

  const code = String(stateCode || '').trim().toUpperCase()
  if (!code || isTemporarilyUnavailableState(code)) return
  pendingStateCode.value = code
  orderForm.value.stateCode = code
  createOrderOpen.value = true
  createOrderStep.value = 1
  orderVerifyInput.value = ''
  orderVerifyTouched.value = false
}

const handleCreateOrderOpenUpdate = (v: boolean) => {
  createOrderOpen.value = v
  if (!v) {
    pendingStateCode.value = null
    createOrderStep.value = 1
    orderVerifyInput.value = ''
    orderVerifyTouched.value = false
  }
}

const goToCreateOrderStep2 = () => {
  orderVerifyTouched.value = true
  if (!orderVerifyIsValid.value) return
  createOrderStep.value = 2
}

const injurySeverityOptions = [
  { label: 'No Severity Criteria', value: NO_CRITERIA_INJURY_SEVERITY },
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' }
]

const caseCategoryOptions = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Commercial Cases', value: 'Commercial Cases' },
]

const expirationOptions = [
  { label: 'In 30 days', value: 30 },
  { label: 'In 60 days', value: 60 },
  { label: 'In 90 days', value: 90 },
  { label: 'No expiration date', value: 0 }
]

const liabilityOptions = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const insuranceOptions = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const medicalTreatmentOptions = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

const languageOptions = [
  'English'
]

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden'
}

// Count open orders per state for filtering
const openOrderCountByStateCode = computed(() => {
  const map = new Map<string, number>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (!code) return
      map.set(code, (map.get(code) ?? 0) + 1)
    })
  })
  return map
})

// ═══ 5-STATE ORDERING LIMIT ═══
// Attorney can have open orders in at most 5 distinct states at a time.
const MAX_ORDER_STATES = computed(() => maxOrderStates.value)

// Distinct state codes that currently have at least one open order
const activeOrderStateCodes = computed(() => {
  const codes = new Set<string>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (code) codes.add(code)
    })
  })
  return codes
})

const activeOrderStateCount = computed(() => activeOrderStateCodes.value.size)
const isAtMaxOrderStates = computed(() => activeOrderStateCount.value >= MAX_ORDER_STATES.value)

// Whether the attorney can place an order in this specific state
// They can if: the state already has orders (not a new state) OR they haven't hit the 5-state cap
const canOrderInState = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return false
  // Already has orders in this state → always allowed (subject to per-state caps)
  if (activeOrderStateCodes.value.has(code)) return true
  // New state → only if under 5-state cap
  return !isAtMaxOrderStates.value
}

const orderStateOptions = computed(() => {
  return US_STATES
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((s) => !isStateUnavailableForOrdering(s.code))
    // Max 2 orders per state (one per case category)
    .filter((s) => (openOrderCountByStateCode.value.get(s.code) ?? 0) < 2)
    // 5-state limit: only allow states that already have orders OR if under cap
    .filter((s) => canOrderInState(s.code))
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.code }))
})

const submitCreateOrder = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) return false
  if (!canUseUrgencyOrders.value) {
    blockUrgencyOrderAccess()
    return false
  }

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return false
  if (isTemporarilyUnavailableState(stateCode)) return false

  // Enforce: commercial orders paused
  if (COMMERCIAL_ORDERS_PAUSED && orderForm.value.caseCategory === 'Commercial Cases') return false

  // Enforce: 5-state ordering limit
  if (!canOrderInState(stateCode)) return false

  // Enforce: max 2 orders per state
  if (openOrderCountForSelectedState.value >= 2) return false

  // Enforce: no duplicate case type in same state
  const caseType = String(orderForm.value.caseCategory || '').trim()
  if (existingCaseTypesForSelectedState.value.has(caseType)) return false

  const quotaTotal = Number(orderForm.value.quotaTotal)
  const maxQuota = maxQuotaForCategory.value
  if (!Number.isFinite(quotaTotal) || quotaTotal <= 0) return false
  if (quotaTotal > maxQuota) return false

  const expiresInDays = Number(orderForm.value.expiresInDays)
  if (![0, 30, 60, 90].includes(expiresInDays)) return false

  // If 0 (no expiration), set a far-future date
  let expiresAt: string
  if (expiresInDays === 0) {
    expiresAt = new Date('2099-12-31T23:59:59.999Z').toISOString()
  } else {
    const d = new Date()
    d.setDate(d.getDate() + expiresInDays)
    expiresAt = d.toISOString()
  }

  await createOrder({
    lawyer_id: userId,
    target_states: [stateCode],
    case_type: caseType,
    quota_total: Math.round(quotaTotal),
    expires_at: expiresAt,
    criteria: {
      injury_severity: orderForm.value.injurySeverity,
      liability_status: orderForm.value.liabilityStatus,
      insurance_status: orderForm.value.insuranceStatus,
      medical_treatment: orderForm.value.medicalTreatment,
      languages: orderForm.value.languages,
      no_prior_attorney: orderForm.value.noPriorAttorney
    }
  })

  createOrderOpen.value = false
  resetOrderForm()
  await refreshMyOrders()
  await refreshMyClosedOrders()
  rebuildStatesFromMyOrders()
  applyMapColors()

  return true
}

const handleCreateOrderSubmit = async (close: () => void) => {
  if (createOrderSubmitting.value) return
  if (orderValidationError.value) return

  createOrderSubmitting.value = true
  try {
    const created = await submitCreateOrder()
    if (created) {
      toast.add({
        title: 'Order created',
        description: 'Your order has been placed successfully.',
        icon: 'i-lucide-check-circle',
        color: 'success'
      })
      close()
    }
  } catch (err) {
    toast.add({
      title: 'Failed to create order',
      description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      icon: 'i-lucide-x-circle',
      color: 'error'
    })
  } finally {
    createOrderSubmitting.value = false
  }
}

// ═══ ORDER MAP VIEW SELECTOR ═══
// Drives which section (map + legend + cards) is displayed. General Coverage
// is the default selection when a user first visits the Order Map page.
type OrderMapView = 'general_coverage' | 'urgency_order'

const orderMapViewOptions = [
  { label: 'General Coverage', value: 'general_coverage' },
  { label: 'Urgency Order', value: 'urgency_order' }
]

const orderMapViewSelectUi = {
  base: 'bg-primary text-white ring-primary hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:bg-primary/40 disabled:text-white/70',
  value: 'font-semibold text-white',
  trailingIcon: 'text-white'
}

const orderMapViewQueryValue: Record<OrderMapView, string> = {
  general_coverage: 'general-coverage',
  urgency_order: 'urgency-order'
}

const URGENCY_ORDER_ACCESS_MESSAGE = 'This account does not have permission to select Urgency Orders yet. You must complete General Coverage orders first to be eligible for Urgency Orders. Contact your account manager if you have any questions.'

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value

const parseOrderMapView = (value: unknown): OrderMapView => {
  const raw = String(firstQueryValue(value) || '').trim().toLowerCase()
  if (['urgency-order', 'urgency_order', 'urgency', 'orders'].includes(raw)) return 'urgency_order'
  return 'general_coverage'
}

const showUrgencyOrderAccessModal = () => {
  urgencyOrderAccessModalOpen.value = true
}

const replaceRouteWithGeneralCoverage = async (removeCreateOrderAction = false) => {
  const query: Record<string, unknown> = {
    ...route.query,
    view: orderMapViewQueryValue.general_coverage
  }

  if (removeCreateOrderAction) {
    delete query.action
  }

  await router.replace({ path: route.path, query: query as LocationQueryRaw })
}

const blockUrgencyOrderAccess = (removeCreateOrderAction = false) => {
  blockMode.value = false
  createOrderOpen.value = false
  handleStateLeave()
  showUrgencyOrderAccessModal()
  void replaceRouteWithGeneralCoverage(removeCreateOrderAction)
}

const enforceUrgencyOrderAccessForRoute = async () => {
  if (canUseUrgencyOrders.value) return false

  const requestedUrgencyView = parseOrderMapView(route.query.view) === 'urgency_order'
  const requestedCreateOrder = firstQueryValue(route.query.action) === 'create-order'
  if (!requestedUrgencyView && !requestedCreateOrder) return false

  blockMode.value = false
  createOrderOpen.value = false
  handleStateLeave()
  showUrgencyOrderAccessModal()
  await replaceRouteWithGeneralCoverage(requestedCreateOrder)
  return true
}

const orderMapView = computed<OrderMapView>({
  get: () => {
    const view = parseOrderMapView(route.query.view)
    if (view === 'urgency_order' && !canUseUrgencyOrders.value) return 'general_coverage'
    return view
  },
  set: (view) => {
    if (view === 'urgency_order' && !canUseUrgencyOrders.value) {
      blockUrgencyOrderAccess()
      return
    }

    const query = {
      ...route.query,
      view: orderMapViewQueryValue[view]
    }

    void router.replace({ path: route.path, query })
  }
})

const isCoverageView = computed(() => orderMapView.value === 'general_coverage')
const isUrgencyView = computed(() => orderMapView.value === 'urgency_order')

// ═══ GENERAL COVERAGE ═══
const existingGeneralCoverage = ref<GeneralCoverageRow | null>(null)

const normalizeCoverageStateCodes = (stateCodes: unknown) => {
  return normalizeValidStateCodes(stateCodes).filter((code) => !isTemporarilyUnavailableState(code))
}

const coveredStateSet = computed(() => {
  const set = new Set<string>()
  const codes = normalizeCoverageStateCodes(existingGeneralCoverage.value?.covered_states ?? [])
  codes.forEach((c) => {
    const code = normalizeStateCode(String(c))
    if (code && VALID_STATE_CODE_SET.has(code)) set.add(code)
  })
  return set
})

const coveredStateCount = computed(() => coveredStateSet.value.size)

const coverageStateCodes = computed(() => Array.from(coveredStateSet.value))

const coverageHighTrafficCount = computed(() => coverageStateCodes.value.length)
const coverageModerateTrafficCount = computed(() => 0)
const coverageClosedCount = computed(() => 0)

const getCoverageStateFillColor = (stateCode: string) => {
  const code = normalizeStateCode(stateCode)
  if (!code) return COLOR_GC_NOT_OPEN
  if (isTemporarilyUnavailableState(code)) return `url(#${TEMPORARILY_UNAVAILABLE_PATTERN_ID})`
  return coveredStateSet.value.has(code) ? COLOR_GREEN : COLOR_GC_NOT_OPEN
}
const hasGeneralCoverage = computed(() => !!existingGeneralCoverage.value)

const generalCoverageOpen = ref(false)
const generalCoverageStep = ref<1 | 2>(1)
const gcVerifyInput = ref('')
const gcVerifyTouched = ref(false)
const generalCoverageSubmitting = ref(false)

const gcVerifyIsValid = computed(() => {
  return String(gcVerifyInput.value || '').trim().toUpperCase() === orderVerifyPhrase
})

const gcVerifyError = computed(() => {
  if (!gcVerifyTouched.value) return undefined
  if (gcVerifyIsValid.value) return undefined
  return `Type ${orderVerifyPhrase} to continue.`
})

const GC_CASE_CATEGORY_CONSUMER = 'Consumer Cases'
const GC_CASE_CATEGORY_CONSUMER_COMMERCIAL = 'Consumer and Commercial Cases'

const gcCaseCategoryOptions = [
  { label: 'Consumer Cases', value: GC_CASE_CATEGORY_CONSUMER },
  { label: 'Consumer and Commercial Cases', value: GC_CASE_CATEGORY_CONSUMER_COMMERCIAL }
]

const gcForm = ref({
  coveredStates: [] as string[],
  caseCategory: GC_CASE_CATEGORY_CONSUMER as string,
  injurySeverity: [] as string[],
  liabilityStatus: 'clear_only' as 'clear_only' | 'disputed_ok',
  insuranceStatus: 'insured_only' as 'insured_only' | 'uninsured_ok',
  medicalTreatment: 'ongoing' as string,
  languages: ['English'] as string[],
  noPriorAttorney: true as boolean
})

watch(() => [...gcForm.value.injurySeverity], (selected, previous) => {
  if (!selected.includes(NO_CRITERIA_INJURY_SEVERITY) || selected.length <= 1) return
  gcForm.value.injurySeverity = previous.includes(NO_CRITERIA_INJURY_SEVERITY)
    ? selected.filter(value => value !== NO_CRITERIA_INJURY_SEVERITY)
    : [NO_CRITERIA_INJURY_SEVERITY]
})

const gcStateOptions = computed(() => {
  return US_STATES
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((s) => !isTemporarilyUnavailableState(s.code))
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.code }))
})

const resetGcForm = () => {
  gcForm.value = {
    coveredStates: [],
    caseCategory: GC_CASE_CATEGORY_CONSUMER,
    injurySeverity: [],
    liabilityStatus: 'clear_only',
    insuranceStatus: 'insured_only',
    medicalTreatment: 'ongoing',
    languages: ['English'],
    noPriorAttorney: true
  }
}

const populateGcFormFromExisting = (gc: GeneralCoverageRow) => {
  gcForm.value = {
    coveredStates: normalizeCoverageStateCodes(gc.covered_states),
    caseCategory: gc.case_category || GC_CASE_CATEGORY_CONSUMER,
    injurySeverity: [...gc.injury_severity],
    liabilityStatus: gc.liability_status as 'clear_only' | 'disputed_ok',
    insuranceStatus: gc.insurance_status as 'insured_only' | 'uninsured_ok',
    medicalTreatment: gc.medical_treatment,
    languages: [...gc.languages],
    noPriorAttorney: gc.no_prior_attorney
  }
}

const refreshGeneralCoverage = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    existingGeneralCoverage.value = null
    return
  }
  try {
    existingGeneralCoverage.value = await getGeneralCoverageForAttorney(userId)
  } catch {
    existingGeneralCoverage.value = null
  }
}

const openGeneralCoverage = () => {
  generalCoverageOpen.value = true
  generalCoverageStep.value = 1
  gcVerifyInput.value = ''
  gcVerifyTouched.value = false
  if (existingGeneralCoverage.value) {
    populateGcFormFromExisting(existingGeneralCoverage.value)
  } else {
    resetGcForm()
  }
}

const handleGeneralCoverageOpenUpdate = (v: boolean) => {
  generalCoverageOpen.value = v
  if (!v) {
    generalCoverageStep.value = 1
    gcVerifyInput.value = ''
    gcVerifyTouched.value = false
  }
}

const goToGcStep2 = () => {
  gcVerifyTouched.value = true
  if (!gcVerifyIsValid.value) return
  generalCoverageStep.value = 2
}

const submitGeneralCoverage = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) return false
  const coveredStates = normalizeCoverageStateCodes(gcForm.value.coveredStates)
  if (!coveredStates.length) return false

  await ensureAttorneyProfileExists(userId)

  const result = await upsertGeneralCoverage({
    attorney_id: userId,
    covered_states: coveredStates,
    case_category: gcForm.value.caseCategory,
    injury_severity: gcForm.value.injurySeverity,
    liability_status: gcForm.value.liabilityStatus,
    insurance_status: gcForm.value.insuranceStatus,
    medical_treatment: gcForm.value.medicalTreatment,
    languages: gcForm.value.languages,
    no_prior_attorney: gcForm.value.noPriorAttorney
  })

  existingGeneralCoverage.value = result
  generalCoverageOpen.value = false
  resetGcForm()
  return true
}

const handleGeneralCoverageSubmit = async (close: () => void) => {
  if (generalCoverageSubmitting.value) return
  const isUpdate = hasGeneralCoverage.value
  generalCoverageSubmitting.value = true
  try {
    const saved = await submitGeneralCoverage()
    if (saved) {
      toast.add({
        title: isUpdate ? 'General coverage updated' : 'General coverage created',
        description: 'Your general coverage has been saved successfully.',
        icon: 'i-lucide-check-circle',
        color: 'success'
      })
      close()
    }
  } catch (err) {
    toast.add({
      title: 'Failed to save general coverage',
      description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      icon: 'i-lucide-x-circle',
      color: 'error'
    })
  } finally {
    generalCoverageSubmitting.value = false
  }
}

const MAP_PATH_SELECTOR = 'path[data-id], path[id]'

const BLOCKED_PATTERN_ID = 'blocked-hatch'
const TEMPORARILY_UNAVAILABLE_PATTERN_ID = 'temporarily-unavailable-hatch'

const ensureHatchPattern = (
  svg: SVGSVGElement,
  patternId: string,
  backgroundColor: string,
  stripeColor: string
) => {
  const existing = svg.querySelector(`#${patternId}`)
  if (existing) return

  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.insertBefore(defs, svg.firstChild)
  }

  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
  pattern.setAttribute('id', patternId)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', '12')
  pattern.setAttribute('height', '12')
  pattern.setAttribute('patternTransform', 'rotate(45)')

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '12')
  bg.setAttribute('height', '12')
  bg.setAttribute('fill', backgroundColor)

  const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  stripe.setAttribute('width', '4')
  stripe.setAttribute('height', '12')
  stripe.setAttribute('fill', stripeColor)

  pattern.appendChild(bg)
  pattern.appendChild(stripe)
  defs.appendChild(pattern)
}

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  ensureHatchPattern(svg as SVGSVGElement, BLOCKED_PATTERN_ID, '#f3f4f6', '#9ca3af')
  ensureHatchPattern(svg as SVGSVGElement, TEMPORARILY_UNAVAILABLE_PATTERN_ID, '#fff7ed', '#f97316')

  const coverageView = isCoverageView.value

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const normalizedCode = normalizeStateCode(code)
    const state = stateByCode.value.get(normalizedCode)
    const isBlocked = !coverageView && blockedStateSet.value.has(normalizedCode)
    const isTemporarilyUnavailable = isTemporarilyUnavailableState(normalizedCode)
    const isUnavailable = isBlocked || isTemporarilyUnavailable

    const openOrders = Number(state?.openOrders) || 0

    // Urgency filters never affect General Coverage; the two map modes are independent.
    const matchesFilter = coverageView
      ? true
      : mapFilter.value === 'all'
        ? true
        : mapFilter.value === 'no_orders'
          ? !isUnavailable && openOrders === 0
          : mapFilter.value === 'has_orders'
            ? !isUnavailable && openOrders > 0
            : isUnavailable

    let fill: string
    if (coverageView) {
      fill = getCoverageStateFillColor(normalizedCode)
    } else if (isTemporarilyUnavailable) {
      fill = `url(#${TEMPORARILY_UNAVAILABLE_PATTERN_ID})`
    } else if (isBlocked) {
      fill = `url(#${BLOCKED_PATTERN_ID})`
    } else if (state) {
      fill = getStateFillColor(state.code)
    } else {
      fill = COLOR_NEUTRAL
    }

    const stroke = '#0b0b0b'
    const strokeWidth = '0.8'
    // Clicks in General Coverage are view-only — no state is interactive.
    const isInteractive = !coverageView && !isBlocked && (!isTemporarilyUnavailable || openOrders > 0)

    path.style.setProperty('fill', fill, 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-width', strokeWidth, 'important')
    path.style.cursor = matchesFilter && state && isInteractive ? 'pointer' : 'default'
    path.style.opacity = matchesFilter ? '1' : '0.25'
    path.style.pointerEvents = matchesFilter ? 'auto' : 'none'
  })

  applyStateLabels()
}

const applyStateLabels = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return

  const old = svg.querySelector('#state-labels')
  if (old) old.remove()

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('id', 'state-labels')
  g.setAttribute('pointer-events', 'none')

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return

    let bbox: DOMRect
    try {
      bbox = (p as unknown as SVGGraphicsElement).getBBox()
    } catch {
      return
    }

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    const state = stateByCode.value.get(code)
    if (!state) return

    const fontSize = Math.max(7, Math.min(14, Math.min(bbox.width, bbox.height) / 4))
    const fill = '#111827'

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = code
    text.setAttribute('x', String(cx))
    text.setAttribute('y', String(cy))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.style.setProperty('font-size', `${fontSize}px`, 'important')
    text.style.setProperty('font-weight', '700', 'important')
    text.style.setProperty('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', 'important')
    text.style.setProperty('fill', fill, 'important')
    text.style.setProperty('paint-order', 'stroke', 'important')
    text.style.setProperty('stroke', 'rgba(255,255,255,0.9)', 'important')
    text.style.setProperty('stroke-width', '2', 'important')
    text.style.setProperty('stroke-linejoin', 'round', 'important')

    g.appendChild(text)
  })

  svg.appendChild(g)
}

const handleStateEnter = (evt: Event) => {
  const target = evt.target as HTMLElement | null
  if (!target) return
  const code = target.getAttribute('data-id') || target.getAttribute('id')
  if (!code) return
  const normalizedCode = normalizeStateCode(code)
  const state = stateByCode.value.get(normalizedCode) ?? null
  if (!state) return

  tooltip.value.blocked = isUrgencyView.value && blockedStateSet.value.has(normalizedCode)

  tooltip.value.state = state
  tooltip.value.myOrder = myOrderByStateCode.value.get(normalizedCode) ?? null
  tooltip.value.open = true
}

const handleStateLeave = () => {
  tooltip.value.open = false
  tooltip.value.state = null
  tooltip.value.myOrder = null
  tooltip.value.blocked = false
}

const handleMouseMove = (evt: MouseEvent) => {
  if (!tooltip.value.open) return

  const root = mapRoot.value
  if (!root) return
  const rect = root.getBoundingClientRect()

  const offset = 6
  const rawX = evt.clientX - rect.left + offset
  const rawY = evt.clientY - rect.top + offset

  const w = tooltipEl.value?.offsetWidth ?? 0
  const h = tooltipEl.value?.offsetHeight ?? 0

  const maxX = Math.max(0, rect.width - w - 4)
  const maxY = Math.max(0, rect.height - h - 4)

  tooltip.value.x = Math.max(4, Math.min(rawX, maxX))
  tooltip.value.y = Math.max(4, Math.min(rawY, maxY))
}

const handleStateClick = (evt: Event) => {
  const target = evt.target as HTMLElement | null
  if (!target) return
  const code = target.getAttribute('data-id') || target.getAttribute('id')
  if (!code) return
  const normalizedCode = normalizeStateCode(code)
  const state = stateByCode.value.get(normalizedCode) ?? null
  if (!state) return

  // Block-toggle is an Urgency Order tool only.
  if (isUrgencyView.value && blockMode.value) {
    const next = new Set(blockedStateSet.value)
    if (next.has(normalizedCode)) next.delete(normalizedCode)
    else next.add(normalizedCode)
    blockedStateCodes.value = Array.from(next)
    return
  }

  if (isCoverageView.value) return

  const stateOrders = openOrdersForStateCode(normalizedCode)
  if (isTemporarilyUnavailableState(normalizedCode)) {
    if (stateOrders.length > 0) {
      router.push(`/orders/${stateOrders[0].id}?state=${normalizedCode}`)
    }
    return
  }

  if (blockedStateSet.value.has(normalizedCode)) return

  // If state has 2 orders (max per state), navigate to the first one
  if (stateOrders.length >= 2) {
    router.push(`/orders/${stateOrders[0].id}?state=${normalizedCode}`)
    return
  }

  // If state has 1 order — open create order modal for placing the 2nd order in this state
  if (stateOrders.length === 1) {
    openCreateOrderForState(state.code)
    return
  }

  // No orders in this state — check 5-state limit
  if (!canOrderInState(normalizedCode)) return

  openCreateOrderForState(state.code)
}

const bindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    p.addEventListener('mouseenter', handleStateEnter)
    p.addEventListener('mouseleave', handleStateLeave)
    p.addEventListener('click', handleStateClick)
  })

  svg.addEventListener('mousemove', handleMouseMove)
}

const unbindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    p.removeEventListener('mouseenter', handleStateEnter)
    p.removeEventListener('mouseleave', handleStateLeave)
    p.removeEventListener('click', handleStateClick)
  })

  svg.removeEventListener('mousemove', handleMouseMove)
}

const mountSvg = async () => {
  await nextTick()
  if (!mapRoot.value) return

  let svgMarkup = ''
  try {
    const res = await fetch(US_SVG_ASSET_URL)
    if (!res.ok) throw new Error('Failed to load bundled SVG')
    svgMarkup = await res.text()
  } catch {
    svgMarkup = usSvgFallbackRaw
  }

  mapRoot.value.innerHTML = svgMarkup

  await nextTick()
  const svg = mapRoot.value.querySelector('svg') as SVGSVGElement | null
  if (svg) {
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
}

onMounted(() => {
  const run = async () => {
    if (!mapRoot.value) return

    await auth.init()
    loading.value = true
    try {
      await refreshMyOrders()
      await refreshMyClosedOrders()
      await loadBlockedStates()
      await refreshGeneralCoverage()
      rebuildStatesFromMyOrders()
    } finally {
      loading.value = false
    }

    await enforceUrgencyOrderAccessForRoute()
    await mountSvg()
    bindSvgEvents()
    applyMapColors()

    // Trigger blur-in after SVG is ready
    if (mapRoot.value) {
      mapRoot.value.classList.remove('opacity-0')
      mapRoot.value.classList.add('ap-blur-in')
    }

    // Auto-open create order modal when navigated from Product Portal or a deep link.
    if (firstQueryValue(route.query.action) === 'create-order' && !isAccountInactive.value) {
      if (await enforceUrgencyOrderAccessForRoute()) return

      const restQuery = Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'action'))
      const query = {
        ...restQuery,
        view: orderMapViewQueryValue.urgency_order
      }
      await router.replace({ path: route.path, query })
      openCreateOrder()
    }
  }

  void run()
})

onUnmounted(() => {
  unbindSvgEvents()
})

watch(states, () => {
  applyMapColors()
})

watch(myOpenOrders, () => {
  rebuildStatesFromMyOrders()
  applyMapColors()
})

watch(myClosedOrders, () => {
  applyMapColors()
})

watch(orderMapView, (view) => {
  if (view === 'general_coverage') {
    blockMode.value = false
  }
  handleStateLeave()
  applyMapColors()
})

watch(
  () => [route.query.view, route.query.action, urgencyOrdersEnabled.value],
  () => {
    void enforceUrgencyOrderAccessForRoute()
  }
)

watch(existingGeneralCoverage, () => {
  if (isCoverageView.value) applyMapColors()
})
</script>

<template>
  <UDashboardPanel id="intake-map">
    <template #header>
      <UDashboardNavbar title="Order Map">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <ProductGuideHint
              :title="orderMapHints.createOrder.title"
              :description="orderMapHints.createOrder.description"
              :guide-target="orderMapHints.createOrder.guideTarget"
            />

            <UTooltip v-if="isAccountInactive" text="Locked until Onboarding is Completed">
              <span class="inline-flex opacity-50 cursor-not-allowed">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-refresh-cw"
                  :loading="loading"
                  disabled
                >
                  Refresh
                </UButton>
              </span>
            </UTooltip>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="refreshAll"
            >
              Refresh
            </UButton>

            <template v-if="isUrgencyView">
              <UTooltip v-if="isAccountInactive" text="Locked until Onboarding is Completed">
                <span class="inline-flex opacity-50 cursor-not-allowed">
                  <UButton
                    color="neutral"
                    :variant="blockMode ? 'solid' : 'outline'"
                    :icon="blockMode ? 'i-lucide-check' : 'i-lucide-ban'"
                    disabled
                  >
                    {{ blockMode ? 'Done blocking' : 'Block states' }}
                  </UButton>
                </span>
              </UTooltip>
              <UButton
                v-else
                :color="blockMode ? 'primary' : 'neutral'"
                :variant="blockMode ? 'solid' : 'outline'"
                :icon="blockMode ? 'i-lucide-check' : 'i-lucide-ban'"
                @click="() => { blockMode = !blockMode }"
              >
                {{ blockMode ? 'Done blocking' : 'Block states' }}
              </UButton>
            </template>

            <template v-if="isUrgencyView">
              <UTooltip v-if="isAccountInactive" text="Locked until Onboarding is Completed">
                <span class="inline-flex opacity-50 cursor-not-allowed">
                  <UButton
                    color="primary"
                    variant="solid"
                    icon="i-lucide-plus"
                    disabled
                  >
                    Create Urgency Order
                  </UButton>
                </span>
              </UTooltip>
              <UTooltip
                v-else-if="isAtMaxOrderStates && orderStateOptions.length === 0"
                :text="`You have active orders in ${activeOrderStateCount} states (max ${MAX_ORDER_STATES}) and all are at full capacity. Contact your account manager to increase your state limit.`"
              >
                <span class="inline-flex opacity-50 cursor-not-allowed">
                  <UButton
                    color="primary"
                    variant="solid"
                    icon="i-lucide-plus"
                    disabled
                  >
                    Create Urgency Order
                  </UButton>
                </span>
              </UTooltip>
              <UTooltip
                v-else-if="isAtMaxOrderStates && orderStateOptions.length > 0"
                :text="`State limit reached (${activeOrderStateCount}/${MAX_ORDER_STATES}). You can only add orders in your existing states.`"
              >
                <UButton
                  color="primary"
                  variant="solid"
                  icon="i-lucide-plus"
                  @click="openCreateOrder"
                >
                  Create Urgency Order
                </UButton>
              </UTooltip>
              <UButton
                v-else
                color="primary"
                variant="solid"
                icon="i-lucide-plus"
                @click="openCreateOrder"
              >
                Create Urgency Order
              </UButton>
            </template>

            <template v-else>
              <UTooltip v-if="isAccountInactive" text="Locked until Onboarding is Completed">
                <span class="inline-flex opacity-50 cursor-not-allowed">
                  <UButton
                    color="primary"
                    variant="solid"
                    icon="i-lucide-plus"
                    disabled
                  >
                    Create General Coverage
                  </UButton>
                </span>
              </UTooltip>
              <UButton
                v-else
                color="primary"
                variant="solid"
                :icon="hasGeneralCoverage ? 'i-lucide-pencil' : 'i-lucide-plus'"
                @click="openGeneralCoverage"
              >
                {{ hasGeneralCoverage ? 'Edit General Coverage' : 'Create General Coverage' }}
              </UButton>
            </template>

            <USelect
              v-model="orderMapView"
              :items="orderMapViewOptions"
              value-key="value"
              label-key="label"
              class="min-w-44"
              color="primary"
              variant="subtle"
              :ui="orderMapViewSelectUi"
              :disabled="isAccountInactive"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="relative flex flex-col gap-5">
        <UModal
          :open="urgencyOrderAccessModalOpen"
          title="Urgency Orders unavailable"
          :dismissible="true"
          @update:open="(value: boolean) => { urgencyOrderAccessModalOpen = value }"
        >
          <template #body>
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <UIcon name="i-lucide-lock" class="text-lg text-amber-500" />
                </div>
                <p class="text-sm leading-6 text-muted">
                  {{ URGENCY_ORDER_ACCESS_MESSAGE }}
                </p>
              </div>

              <div class="flex justify-end">
                <UButton color="primary" variant="solid" @click="urgencyOrderAccessModalOpen = false">
                  Got it
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- Locked Overlay for Inactive Accounts -->
        <div
          v-if="isAccountInactive"
          class="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-white/30 dark:bg-black/30 ap-fade-in"
        >
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-white dark:bg-[#1a1a1a] p-8 shadow-2xl max-w-md mx-4">
            <div class="flex flex-col items-center gap-4 text-center">
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
                <UIcon name="i-lucide-lock" class="text-3xl text-amber-500" />
              </div>
              <div>
                <p class="text-lg font-semibold text-highlighted">Locked until Onboarding is Completed</p>
                <p class="mt-2 text-sm text-muted">
                  This page is currently locked. Please complete your onboarding process to access the Order Map.
                </p>
                <p class="mt-4 text-sm text-muted">
                  Schedule a meeting with your account manager to complete onboarding:
                </p>
                <div class="mt-3 flex justify-center">
                  <UButton
                    as="a"
                    href="https://calendly.com/monicagonzalez03/onboarding"
                    target="_blank"
                    rel="noreferrer"
                    color="primary"
                    variant="solid"
                    icon="i-lucide-calendar"
                  >
                    Schedule Onboarding
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- ═══ 5-State Limit Banner ═══ -->
        <div
          v-if="isUrgencyView && isAtMaxOrderStates && !isAccountInactive"
          class="ap-fade-in ap-delay-1 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-3.5"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <UIcon name="i-lucide-alert-triangle" class="text-base text-amber-400" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-highlighted">
              Order state limit reached
            </p>
            <p class="mt-0.5 text-xs text-muted">
              You have active orders in <span class="font-semibold text-amber-400">{{ activeOrderStateCount }}/{{ MAX_ORDER_STATES }}</span> states — the maximum allowed.
              New orders cannot be placed until existing orders expire or are fulfilled.
              To increase your state limit, please contact your account manager.
            </p>
          </div>
          <div class="shrink-0 text-right">
            <div class="flex items-center gap-1.5">
              <template v-for="code in [...activeOrderStateCodes].slice(0, 5)" :key="code">
                <span class="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                  {{ code }}
                </span>
              </template>
            </div>
          </div>
        </div>

        <UAlert
          v-if="isUrgencyView && blockMode"
          color="neutral"
          variant="subtle"
          title="Blocking mode"
          description="Click states on the map to block/unblock them. Blocked states are disabled and removed from the order state dropdown."
        />

        <UModal
          v-if="createOrderOpen"
          :open="true"
          title="Create Order"
          :dismissible="false"
          :ui="{ content: 'sm:max-w-3xl', body: 'p-0' }"
          @update:open="handleCreateOrderOpenUpdate"
        >
          <template #body="{ close }">
            <div class="flex max-h-[78vh] min-h-[560px] flex-col">
              <div>
                <div class="mt-2 flex items-center justify-center">
                  <div class="w-full max-w-sm">
                    <div class="relative">
                      <div class="absolute left-30 right-30 top-4 h-px border-t border-dashed border-primary/50" />
                      <div
                        v-if="createOrderStep >= 2"
                        class="absolute left-30 right-30 top-4 h-px bg-primary"
                      />
                      <div class="relative flex items-start justify-center gap-24">
                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="createOrderStep >= 1 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-muted ring-default'"
                          >
                            1
                          </div>
                          <div class="text-xs" :class="createOrderStep === 1 ? 'font-semibold text-foreground' : 'text-muted'">
                            Verification
                          </div>
                        </div>

                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="createOrderStep >= 2 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-[var(--ap-accent)] ring-[var(--ap-accent)]'"
                          >
                            2
                          </div>
                          <div class="text-xs" :class="createOrderStep === 2 ? 'font-semibold text-foreground' : 'text-muted'">
                            Order Details
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="createOrderStep === 1" class="min-h-0 flex-1 overflow-y-auto px-6 py-4 flex items-center justify-center">
                <div class="w-full max-w-md space-y-5">
                  <p class="text-center text-sm text-muted">
                    To continue, type <span class="font-semibold text-highlighted">{{ orderVerifyPhrase }}</span> below.
                  </p>

                  <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
                    <UFormField label="Verification word" required :error="orderVerifyError">
                      <UInput
                        v-model="orderVerifyInput"
                        placeholder="Type the verification word"
                        size="xl"
                        class="w-full"
                        @blur="() => { orderVerifyTouched = true }"
                      />
                    </UFormField>
                  </div>
                </div>
              </div>

              <div v-else class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <UAlert
                  v-if="orderValidationError"
                  color="error"
                  variant="subtle"
                  title="Order restriction"
                  :description="orderValidationError"
                  class="mb-4"
                />

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="State" required>
                    <USelect
                      v-model="orderForm.stateCode"
                      :items="orderStateOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select a state"
                      :disabled="isCommercialSelected"
                    />
                  </UFormField>

                  <UFormField label="Case category" required>
                    <USelect
                      v-model="orderForm.caseCategory"
                      :items="caseCategoryOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select case category"
                    />
                  </UFormField>

                  <UFormField label="Injury severity" required>
                    <USelect
                      v-model="orderForm.injurySeverity"
                      :items="injurySeverityOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Select injury severities"
                      :ui="multiSelectUi"
                      :disabled="isCommercialSelected"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Liability status" required>
                    <USelect
                      v-model="orderForm.liabilityStatus"
                      :items="liabilityOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select liability"
                      :disabled="isCommercialSelected"
                    />
                  </UFormField>

                  <UFormField label="Insurance status" required>
                    <USelect
                      v-model="orderForm.insuranceStatus"
                      :items="insuranceOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select insurance"
                      :disabled="isCommercialSelected"
                    />
                  </UFormField>

                  <UFormField label="Medical treatment" required>
                    <USelect
                      v-model="orderForm.medicalTreatment"
                      :items="medicalTreatmentOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      :disabled="isCommercialSelected"
                    />
                  </UFormField>

                  <UFormField label="Languages" required>
                    <USelect
                      v-model="orderForm.languages"
                      :items="languageOptions"
                      class="w-full"
                      multiple
                      placeholder="Select languages"
                      :ui="multiSelectUi"
                      :disabled="isCommercialSelected"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Client requirements">
                    <UCheckbox v-model="orderForm.noPriorAttorney" label="No prior attorney" :disabled="isCommercialSelected" />
                  </UFormField>

                  <UFormField label="Quota" description="Total number of cases needed" required>
                    <UInput
                      v-model.number="orderForm.quotaTotal"
                      type="number"
                      min="1"
                      :max="maxQuotaForCategory"
                      :disabled="isCommercialSelected"
                    />
                    <div class="mt-1 text-xs text-muted">
                      Maximum {{ maxQuotaForCategory }} {{ maxQuotaForCategory === 1 ? 'case' : 'cases' }} per order for {{ orderForm.caseCategory }}.
                    </div>
                  </UFormField>

                  <UFormField label="Expiration" description="Stop accepting retainers" required>
                    <div class="grid grid-cols-2 gap-x-1 gap-y-2">
                      <label
                        v-for="opt in expirationOptions"
                        :key="opt.value"
                        class="flex items-center gap-3"
                      >
                        <input
                          :checked="orderForm.expiresInDays === opt.value"
                          type="radio"
                          name="expiresInDays"
                          class="h-4 w-4"
                          :disabled="isCommercialSelected"
                          @change="() => { orderForm.expiresInDays = opt.value }"
                        >
                        <span class="text-sm">
                          {{ opt.label }}
                        </span>
                      </label>
                    </div>
                  </UFormField>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 border-t border-default px-6 py-4">
                <UButton
                  v-if="createOrderStep === 1"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetOrderForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="createOrderStep === 1"
                  color="primary"
                  variant="solid"
                  :disabled="!orderVerifyIsValid"
                  @click="goToCreateOrderStep2"
                >
                  Next
                </UButton>

                <UButton
                  v-else
                  color="neutral"
                  variant="outline"
                  @click="() => { createOrderStep = 1 }"
                >
                  Back
                </UButton>
                <UButton
                  v-if="createOrderStep === 2"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetOrderForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="createOrderStep === 2"
                  color="primary"
                  variant="solid"
                  :loading="createOrderSubmitting"
                  :disabled="createOrderSubmitting || isCommercialSelected"
                  @click="async () => { await handleCreateOrderSubmit(close) }"
                >
                  Create
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- ═══ General Coverage Modal ═══ -->
        <UModal
          v-if="generalCoverageOpen"
          :open="true"
          :title="hasGeneralCoverage ? 'Edit General Coverage' : 'Create General Coverage'"
          :dismissible="false"
          :ui="{ content: 'sm:max-w-3xl', body: 'p-0' }"
          @update:open="handleGeneralCoverageOpenUpdate"
        >
          <template #body="{ close }">
            <div class="flex max-h-[78vh] min-h-[560px] flex-col">
              <div>
                <div class="mt-2 flex items-center justify-center">
                  <div class="w-full max-w-sm">
                    <div class="relative">
                      <div class="absolute left-30 right-30 top-4 h-px border-t border-dashed border-primary/50" />
                      <div
                        v-if="generalCoverageStep >= 2"
                        class="absolute left-30 right-30 top-4 h-px bg-primary"
                      />
                      <div class="relative flex items-start justify-center gap-24">
                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="generalCoverageStep >= 1 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-muted ring-default'"
                          >
                            1
                          </div>
                          <div class="text-xs" :class="generalCoverageStep === 1 ? 'font-semibold text-foreground' : 'text-muted'">
                            Verification
                          </div>
                        </div>

                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="generalCoverageStep >= 2 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-[var(--ap-accent)] ring-[var(--ap-accent)]'"
                          >
                            2
                          </div>
                          <div class="text-xs" :class="generalCoverageStep === 2 ? 'font-semibold text-foreground' : 'text-muted'">
                            Coverage Details
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="generalCoverageStep === 1" class="min-h-0 flex-1 overflow-y-auto px-6 py-4 flex items-center justify-center">
                <div class="w-full max-w-md space-y-5">
                  <p class="text-center text-sm text-muted">
                    To continue, type <span class="font-semibold text-highlighted">{{ orderVerifyPhrase }}</span> below.
                  </p>

                  <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
                    <UFormField label="Verification word" required :error="gcVerifyError">
                      <UInput
                        v-model="gcVerifyInput"
                        placeholder="Type the verification word"
                        size="xl"
                        class="w-full"
                        @blur="() => { gcVerifyTouched = true }"
                      />
                    </UFormField>
                  </div>
                </div>
              </div>

              <div v-else class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="Covered States" required class="sm:col-span-2">
                    <USelect
                      v-model="gcForm.coveredStates"
                      :items="gcStateOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Select states"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                    <div v-if="gcForm.coveredStates.length" class="mt-2 flex flex-wrap gap-1">
                      <span
                        v-for="code in gcForm.coveredStates"
                        :key="code"
                        class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {{ code }}
                        <button
                          type="button"
                          class="ml-0.5 hover:text-red-500"
                          @click="gcForm.coveredStates = gcForm.coveredStates.filter(s => s !== code)"
                        >
                          <UIcon name="i-lucide-x" class="size-3" />
                        </button>
                      </span>
                    </div>
                  </UFormField>

                  <UFormField label="Case category" required>
                    <USelect
                      v-model="gcForm.caseCategory"
                      :items="gcCaseCategoryOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select case category"
                    />
                  </UFormField>

                  <UFormField label="Injury severity" required>
                    <USelect
                      v-model="gcForm.injurySeverity"
                      :items="injurySeverityOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Select injury severities"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Liability status" required>
                    <USelect
                      v-model="gcForm.liabilityStatus"
                      :items="liabilityOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select liability"
                    />
                  </UFormField>

                  <UFormField label="Insurance status" required>
                    <USelect
                      v-model="gcForm.insuranceStatus"
                      :items="insuranceOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                      placeholder="Select insurance"
                    />
                  </UFormField>

                  <UFormField label="Medical treatment" required>
                    <USelect
                      v-model="gcForm.medicalTreatment"
                      :items="medicalTreatmentOptions"
                      class="w-full"
                      value-key="value"
                      label-key="label"
                    />
                  </UFormField>

                  <UFormField label="Languages" required>
                    <USelect
                      v-model="gcForm.languages"
                      :items="languageOptions"
                      class="w-full"
                      multiple
                      placeholder="Select languages"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Client requirements">
                    <UCheckbox v-model="gcForm.noPriorAttorney" label="No prior attorney" />
                  </UFormField>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 border-t border-default px-6 py-4">
                <UButton
                  v-if="generalCoverageStep === 1"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetGcForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="generalCoverageStep === 1"
                  color="primary"
                  variant="solid"
                  :disabled="!gcVerifyIsValid"
                  @click="goToGcStep2"
                >
                  Next
                </UButton>

                <UButton
                  v-else
                  color="neutral"
                  variant="outline"
                  @click="() => { generalCoverageStep = 1 }"
                >
                  Back
                </UButton>
                <UButton
                  v-if="generalCoverageStep === 2"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetGcForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="generalCoverageStep === 2"
                  color="primary"
                  variant="solid"
                  :loading="generalCoverageSubmitting"
                  :disabled="generalCoverageSubmitting || !gcForm.coveredStates.length"
                  @click="async () => { await handleGeneralCoverageSubmit(close) }"
                >
                  Save
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- ═══ Map with integrated legend ═══ -->
        <div class="ap-fade-in ap-delay-2 rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4 overflow-hidden">
          <div class="relative">
            <div class="absolute right-3 top-3 z-[5] rounded-xl border border-black/[0.06] bg-white/90 px-2 py-1.5 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Guide</span>
                <ProductGuideHint
                  :title="orderMapHints.map.title"
                  :description="orderMapHints.map.description"
                  :guide-target="orderMapHints.map.guideTarget"
                />
              </div>
            </div>

            <div
              ref="mapRoot"
              class="w-full rounded-xl overflow-hidden opacity-0"
              style="height: 520px;"
            />

            <!-- Stats overlay — absolute on desktop, below map on mobile -->
            <div v-if="isUrgencyView" class="hidden md:block absolute top-3 left-3 z-[5] w-32 overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
              <div class="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 400ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-orange-500 dark:bg-orange-600" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-orange-500 dark:text-orange-600">Total</div>
                  <div class="mt-0.5 text-lg font-bold text-orange-600 tabular-nums">{{ statsTotal }}</div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 500ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">Open</div>
                  <div class="mt-0.5 text-lg font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ statsOpen }}</div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 600ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">Pending</div>
                  <div class="mt-0.5 text-lg font-bold text-green-500 dark:text-green-400 tabular-nums">{{ statsPending }}</div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 700ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-red-400 dark:text-red-400">Completed</div>
                  <div class="mt-0.5 text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{{ statsCompleted }}</div>
                </div>
              </div>
            </div>

            <!-- General Coverage stats overlay -->
            <div v-else class="hidden md:block absolute top-3 left-3 z-[5] w-40 overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
              <div class="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 400ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-[var(--ap-accent)]" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-[var(--ap-accent)]">Covered States</div>
                  <div class="mt-0.5 text-lg font-bold text-[var(--ap-accent)] tabular-nums">{{ coveredStateCount }}</div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 500ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">High Traffic</div>
                  <div class="mt-0.5 text-lg font-bold text-green-500 dark:text-green-400 tabular-nums">
                    {{ coverageHighTrafficCount }}
                  </div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 600ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-yellow-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-yellow-500 dark:text-yellow-400">Moderate Traffic</div>
                  <div class="mt-0.5 text-lg font-bold text-yellow-500 dark:text-yellow-400 tabular-nums">{{ coverageModerateTrafficCount }}</div>
                </div>
                <div class="ap-fade-in-left relative px-3 py-2.5 pl-5" style="animation-delay: 700ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-red-400 dark:text-red-400">Closed</div>
                  <div class="mt-0.5 text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{{ coverageClosedCount }}</div>
                </div>
              </div>
            </div>

            <!-- Legend & Filter overlay -->
            <div class="ap-fade-in ap-delay-4 absolute bottom-0 left-1/2 z-[5] -translate-x-1/2 flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1.5 md:gap-x-4 md:whitespace-nowrap rounded-xl border border-black/[0.06] bg-white/90 dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 px-2.5 py-2 md:px-4 md:py-2.5 shadow-lg backdrop-blur-sm max-w-[calc(100%-1.5rem)] md:max-w-none">
              <!-- Urgency Order legend -->
              <div v-if="isUrgencyView" class="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3">
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-gray-300" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">No orders</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-green-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Pending</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-yellow-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">In Progress</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-red-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Completed</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #9ca3af 0 2px, #f3f4f6 2px 6px);"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Blocked</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #f97316 0 3px, #fff7ed 3px 7px);"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Temporarily unavailable</span>
                </div>
              </div>

              <!-- General Coverage legend -->
              <div v-else class="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3">
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full" style="background-color: #94a3b8;" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Not open</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-green-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">High traffic</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-yellow-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Moderate traffic</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-red-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Closed</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #9ca3af 0 2px, #f3f4f6 2px 6px);"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Not licensed</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #f97316 0 3px, #fff7ed 3px 7px);"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Temporarily unavailable</span>
                </div>
              </div>

              <div v-if="isUrgencyView" class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold"
                  :class="isAtMaxOrderStates
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400'"
                >
                  <UIcon :name="isAtMaxOrderStates ? 'i-lucide-alert-triangle' : 'i-lucide-map-pin'" class="text-[9px]" />
                  {{ activeOrderStateCount }}/{{ MAX_ORDER_STATES }}
                </span>
                <USelect
                  v-model="mapFilter"
                  :items="mapFilterOptions"
                  size="xs"
                  class="min-w-28 md:min-w-36"
                />
              </div>
              <div v-else class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1 rounded-md border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                  <UIcon name="i-lucide-map-pin" class="text-[9px]" />
                  {{ coveredStateCount }} covered
                </span>
              </div>
            </div>

            <div
              v-if="tooltip.open && tooltip.state"
              ref="tooltipEl"
              class="pointer-events-none absolute z-10 rounded-xl border border-[var(--ap-card-border)] bg-white dark:bg-[#1a1a1a] px-4 py-3 shadow-xl"
              :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            >
              <div class="text-sm font-semibold text-highlighted">
                {{ tooltip.state.name }} ({{ tooltip.state.code }})
              </div>

              <template v-if="isUrgencyView">
                <div class="mt-1.5 flex items-center gap-2">
                  <UBadge
                    :color="getMyOrderBadgeColor(tooltip.state.code)"
                    variant="subtle"
                    :label="getMyOrderBadgeLabel(tooltip.state.code)"
                    size="xs"
                  />

                  <UBadge
                    v-if="tooltip.blocked"
                    color="neutral"
                    variant="subtle"
                    label="Blocked"
                    size="xs"
                  />

                  <UBadge
                    v-if="tooltip.myOrder"
                    color="primary"
                    variant="subtle"
                    label="Your order active"
                    size="xs"
                  />
                </div>
                <div class="mt-2 space-y-1 text-[11px] text-muted">
                  <div>My open orders in state: {{ tooltip.state.openOrders }}</div>
                  <div v-if="tooltip.myOrder">
                    Your quota: {{ tooltip.myOrder.quota_filled }}/{{ tooltip.myOrder.quota_total }}
                  </div>
                  <div v-if="tooltip.myOrder">
                    Expires: {{ String(tooltip.myOrder.expires_at || '').slice(0, 10) }}
                  </div>
                </div>
                <!-- State limit warning for states with no orders -->
                <div
                  v-if="!tooltip.blocked && tooltip.state.openOrders === 0 && isAtMaxOrderStates"
                  class="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-400"
                >
                  Cannot order here — state limit reached ({{ activeOrderStateCount }}/{{ MAX_ORDER_STATES }}). Contact your account manager to increase this limit.
                </div>
                <!-- Per-state capacity info for states with orders -->
                <div
                  v-else-if="!tooltip.blocked && tooltip.state.openOrders >= 2"
                  class="mt-2 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-medium text-blue-400"
                >
                  This state is at full capacity (2/2 orders — one per case category).
                </div>
              </template>

              <template v-else>
                <div class="mt-1.5 flex items-center gap-2">
                  <UBadge
                    v-if="isTemporarilyUnavailableState(tooltip.state.code)"
                    color="warning"
                    variant="subtle"
                    label="Temporarily unavailable"
                    size="xs"
                  />
                  <UBadge
                    v-else-if="!coveredStateSet.has(tooltip.state.code)"
                    color="neutral"
                    variant="subtle"
                    label="Not open"
                    size="xs"
                  />
                  <UBadge
                    v-else
                    color="success"
                    variant="subtle"
                    label="High traffic"
                    size="xs"
                  />
                </div>
                <div class="mt-2 space-y-1 text-[11px] text-muted">
                  <div v-if="existingGeneralCoverage">
                    Case category: {{ existingGeneralCoverage.case_category }}
                  </div>
                  <div v-else>
                    No general coverage set yet.
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Stats row — visible only on mobile, below the map (Urgency view) -->
          <div v-if="isUrgencyView" class="flex md:hidden gap-2 mt-3">
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 400ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-orange-500 dark:bg-orange-600" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-orange-500 dark:text-orange-600">Total</div>
              <div class="mt-0.5 text-lg font-bold text-orange-600 tabular-nums">{{ statsTotal }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 500ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">Open</div>
              <div class="mt-0.5 text-lg font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ statsOpen }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 600ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">Pending</div>
              <div class="mt-0.5 text-lg font-bold text-green-500 dark:text-green-400 tabular-nums">{{ statsPending }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 700ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-red-400">Completed</div>
              <div class="mt-0.5 text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{{ statsCompleted }}</div>
            </div>
          </div>

          <!-- Stats row — mobile, General Coverage -->
          <div v-if="isCoverageView" class="grid grid-cols-2 md:hidden gap-2 mt-3">
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 400ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-[var(--ap-accent)]" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-[var(--ap-accent)]">Covered States</div>
              <div class="mt-0.5 text-lg font-bold text-[var(--ap-accent)] tabular-nums">{{ coveredStateCount }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 500ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">High Traffic</div>
              <div class="mt-0.5 text-lg font-bold text-green-500 dark:text-green-400 tabular-nums">{{ coverageHighTrafficCount }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 600ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-yellow-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-yellow-500 dark:text-yellow-400">Moderate Traffic</div>
              <div class="mt-0.5 text-lg font-bold text-yellow-500 dark:text-yellow-400 tabular-nums">{{ coverageModerateTrafficCount }}</div>
            </div>
            <div class="ap-fade-in-left flex-1 relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm" style="animation-delay: 700ms">
              <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
              <div class="text-[10px] font-medium uppercase tracking-wider text-red-400">Closed</div>
              <div class="mt-0.5 text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{{ coverageClosedCount }}</div>
            </div>
          </div>
        </div>

        <!-- ═══ Orders Section ═══ -->
        <div class="ap-fade-in ap-delay-5 rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
          <!-- Header -->
          <div class="border-b border-[var(--ap-card-border)] px-5 py-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                  <UIcon :name="isUrgencyView ? 'i-lucide-shopping-cart' : 'i-lucide-shield'" class="text-sm text-[var(--ap-accent)]" />
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-semibold text-highlighted">
                      {{ isUrgencyView ? 'My Urgency Orders' : 'My General Coverage' }}
                    </span>
                    <ProductGuideHint
                      v-if="isUrgencyView"
                      :title="orderMapHints.myOrders.title"
                      :description="orderMapHints.myOrders.description"
                      :guide-target="orderMapHints.myOrders.guideTarget"
                    />
                  </div>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ isUrgencyView ? 'Manage and track all your active and closed orders.' : 'View and manage your general coverage preferences.' }}
                  </p>
                </div>
              </div>
              <div v-if="isUrgencyView" class="flex items-center gap-2">
                <ProductGuideHint
                  :title="orderMapHints.filters.title"
                  :description="orderMapHints.filters.description"
                  :guide-target="orderMapHints.filters.guideTarget"
                />
                <UButton
                  :icon="showOrderFilters ? 'i-lucide-filter-x' : 'i-lucide-filter'"
                  size="xs"
                  :color="hasActiveFilters ? 'primary' : 'neutral'"
                  :variant="showOrderFilters ? 'soft' : 'outline'"
                  @click="showOrderFilters = !showOrderFilters"
                >
                  {{ showOrderFilters ? 'Hide Filters' : 'Filters' }}
                  <template v-if="activeFilterCount > 0" #trailing>
                    <span class="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                      {{ activeFilterCount }}
                    </span>
                  </template>
                </UButton>
                <UButton
                  v-if="hasActiveFilters"
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="Reset all"
                  @click="resetAllFilters"
                />
              </div>
              <div v-else class="flex items-center gap-2">
                <UButton
                  size="xs"
                  color="primary"
                  variant="outline"
                  icon="i-lucide-pencil"
                  @click="openGeneralCoverage"
                >
                  Edit
                </UButton>
              </div>
            </div>
          </div>

          <!-- ═══ My Orders View ═══ -->
          <template v-if="isUrgencyView">
          <!-- Collapsible Filter Panel -->
          <div
            class="ap-collapse"
            :class="showOrderFilters ? 'ap-collapse--open' : ''"
          >
            <div>
              <div class="border-b border-[var(--ap-card-border)] bg-[var(--ap-card-divide)]/30 px-5 py-4">
              <div class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <!-- States -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">States</label>
                <USelect
                  v-model="filterStates"
                  :items="orderStateFilterOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All states"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Case Category -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Case Category</label>
                <USelect
                  v-model="filterCaseCategory"
                  :items="filterCaseCategoryOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All categories"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Injury Severity -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Injury Severity</label>
                <USelect
                  v-model="filterInjurySeverity"
                  :items="injurySeverityOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All severities"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Insurance Status -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Insurance Status</label>
                <USelect
                  v-model="filterInsuranceStatus"
                  :items="insuranceOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Liability Status -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Liability Status</label>
                <USelect
                  v-model="filterLiabilityStatus"
                  :items="liabilityOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Medical Treatment -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Medical Treatment</label>
                <USelect
                  v-model="filterMedicalTreatment"
                  :items="medicalTreatmentOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>

              <!-- Expiration -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Expiration</label>
                <USelect
                  v-model="filterExpiry"
                  :items="filterExpiryOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Any expiry"
                  size="xs"
                  class="w-full"
                />
              </div>

              <!-- Language -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Language</label>
                <USelect
                  v-model="filterLanguage"
                  :items="orderLanguageFilterOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="All languages"
                  size="xs"
                  class="w-full"
                  :ui="multiSelectUi"
                >
                  <template #item-leading>
                    <span class="relative flex size-4 items-center justify-center">
                      <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                      <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                    </span>
                  </template>
                </USelect>
              </div>
              </div>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <!-- Column headers -->
            <div class="flex items-center gap-4 border-b border-[var(--ap-card-border)] bg-[var(--ap-card-divide)]/50 px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted min-w-[640px]">
              <div class="min-w-0 flex-1">Order</div>
              <div class="w-24 text-center">Status</div>
              <div class="w-20 text-center">Quota</div>
              <div class="w-36 text-center">Progress</div>
              <div class="w-28 text-right">Expiry</div>
              <div class="w-5" />
            </div>

            <!-- Empty -->
            <div v-if="filteredOrders.length === 0" class="flex items-center justify-center py-16 px-6">
              <div class="text-center">
                <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/10">
                  <UIcon name="i-lucide-inbox" class="text-lg text-muted" />
                </div>
                <p class="text-sm font-medium text-highlighted">No orders found</p>
                <p class="mt-1 text-xs text-muted">Try adjusting your filters to find what you're looking for.</p>
              </div>
            </div>

            <!-- Orders List -->
            <div v-else class="divide-y divide-[var(--ap-card-divide)]">
              <div
                v-for="(order, idx) in filteredOrders"
                :key="order.id"
                class="ap-fade-in-row group flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-[var(--ap-accent)]/[0.03] min-w-[640px]"
                :style="{ animationDelay: `${800 + idx * 50}ms` }"
                @click="router.push(`/orders/${order.id}`)"
              >
                <!-- Order info -->
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-highlighted">
                    {{ normalizeCaseType(order.case_type || '') }}
                    <span v-if="order.case_subtype" class="font-normal text-muted"> — {{ order.case_subtype }}</span>
                  </div>
                  <div class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <UIcon name="i-lucide-map-pin" class="size-3 shrink-0" />
                    {{ (order.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—' }}
                  </div>
                </div>

                <!-- Status -->
                <div class="flex w-24 items-center gap-1.5 justify-center">
                  <span
                    class="size-1.5 shrink-0 rounded-full"
                    :class="{
                      'bg-amber-400': getOrderDisplayStatus(order) === 'In Progress',
                      'bg-green-400': getOrderDisplayStatus(order) === 'Pending',
                      'bg-blue-400': order.status === 'FULFILLED',
                      'bg-red-400': order.status === 'EXPIRED',
                    }"
                  />
                  <span
                    class="text-xs font-medium"
                    :class="{
                      'text-amber-500 dark:text-amber-400': getOrderDisplayStatus(order) === 'In Progress',
                      'text-green-500 dark:text-green-400': getOrderDisplayStatus(order) === 'Pending',
                      'text-blue-500 dark:text-blue-400': order.status === 'FULFILLED',
                      'text-red-500 dark:text-red-400': order.status === 'EXPIRED',
                    }"
                  >
                    {{ order.status === 'FULFILLED' ? 'Completed' : order.status === 'EXPIRED' ? 'Expired' : getOrderDisplayStatus(order) }}
                  </span>
                </div>

                <!-- Quota -->
                <div class="w-20 text-center">
                  <span class="inline-flex items-center rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--ap-accent)]">
                    {{ order.quota_filled }}/{{ order.quota_total }}
                  </span>
                </div>

                <!-- Progress -->
                <div class="flex w-36 items-center gap-2.5">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ap-card-border)]">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="orderProgressPercent(order) >= 100 ? 'bg-green-400' : 'bg-[var(--ap-accent)]'"
                      :style="{ width: `${Math.min(orderProgressPercent(order), 100)}%` }"
                    />
                  </div>
                  <span class="w-10 text-right text-xs tabular-nums text-muted">{{ orderProgressPercent(order) }}%</span>
                </div>

                <!-- Expiry -->
                <div class="w-28 text-right">
                  <span class="text-xs text-muted">
                    {{ new Date(order.expires_at || '').getFullYear() >= 2099 ? 'No expiry' : String(order.expires_at || '').slice(0, 10) }}
                  </span>
                </div>

                <!-- Chevron -->
                <div class="w-5">
                  <UIcon name="i-lucide-chevron-right" class="text-sm text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-[var(--ap-card-border)] px-5 py-2.5">
            <p class="text-xs text-muted">
              Showing {{ filteredOrders.length }} of {{ statsTotal }} orders
            </p>
          </div>
          </template>

          <!-- ═══ My General Coverage View ═══ -->
          <template v-else>
            <div v-if="!existingGeneralCoverage" class="flex items-center justify-center py-16 px-6">
              <div class="text-center">
                <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/10">
                  <UIcon name="i-lucide-shield-off" class="text-lg text-muted" />
                </div>
                <p class="text-sm font-medium text-highlighted">No general coverage set</p>
                <p class="mt-1 text-xs text-muted">Create a general coverage to define your default case preferences.</p>
                <UButton
                  class="mt-4"
                  color="primary"
                  variant="solid"
                  icon="i-lucide-plus"
                  size="sm"
                  @click="openGeneralCoverage"
                >
                  Create General Coverage
                </UButton>
              </div>
            </div>

            <template v-else>
              <div class="divide-y divide-[var(--ap-card-divide)]">
                <div class="grid gap-4 px-5 py-4 sm:grid-cols-2">
                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Covered States</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span
                        v-for="code in coverageStateCodes"
                        :key="code"
                        class="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      >
                        {{ code }}
                      </span>
                      <span v-if="!coverageStateCodes.length" class="text-sm text-muted">-</span>
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Case Category</div>
                    <div class="mt-1.5 text-sm text-highlighted">{{ existingGeneralCoverage.case_category }}</div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Injury Severity</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span
                        v-for="sev in existingGeneralCoverage.injury_severity"
                        :key="sev"
                        class="inline-flex items-center rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ap-accent)]"
                      >
                        {{ sev === 'no_criteria' ? 'No Criteria' : sev.charAt(0).toUpperCase() + sev.slice(1) }}
                      </span>
                      <span v-if="!existingGeneralCoverage.injury_severity.length" class="text-sm text-muted">—</span>
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Liability Status</div>
                    <div class="mt-1.5 text-sm text-highlighted">
                      {{ existingGeneralCoverage.liability_status === 'clear_only' ? 'Clear liability only' : 'Disputed acceptable' }}
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Insurance Status</div>
                    <div class="mt-1.5 text-sm text-highlighted">
                      {{ existingGeneralCoverage.insurance_status === 'insured_only' ? 'Insured only' : 'Uninsured acceptable' }}
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Medical Treatment</div>
                    <div class="mt-1.5 text-sm text-highlighted">
                      {{ existingGeneralCoverage.medical_treatment === 'no_medical' ? 'No medical' : existingGeneralCoverage.medical_treatment === 'ongoing' ? 'Ongoing' : 'Proof of medical treatment' }}
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Languages</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span
                        v-for="lang in existingGeneralCoverage.languages"
                        :key="lang"
                        class="inline-flex items-center rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ap-accent)]"
                      >
                        {{ lang }}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div class="text-[11px] font-medium uppercase tracking-wider text-muted">Client Requirements</div>
                    <div class="mt-1.5 text-sm text-highlighted">
                      {{ existingGeneralCoverage.no_prior_attorney ? 'No prior attorney' : 'No requirements' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div class="border-t border-[var(--ap-card-border)] px-5 py-2.5">
                <p class="text-xs text-muted">
                  Last updated {{ existingGeneralCoverage.updated_at ? new Date(existingGeneralCoverage.updated_at).toLocaleDateString() : '—' }}
                </p>
              </div>
            </template>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
