<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import usSvgFallbackRaw from '../assets/us.svg?raw'

import { useAuth } from '../composables/useAuth'
import { getAttorneyProfile, patchAttorneyProfile } from '../lib/attorney-profile'
import { createOrder, listOpenOrdersForLawyer, listOrdersForLawyer, type OrderRow } from '../lib/orders'
import { US_STATES } from '../lib/us-states'

const US_SVG_ASSET_URL = new URL('../assets/us.svg', import.meta.url).toString()

type StateOrders = {
  code: string
  name: string
  openOrders: number
}

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const loading = ref(false)
const tooltip = ref({ open: false, x: 0, y: 0, state: null as StateOrders | null, myOrder: null as OrderRow | null, blocked: false })
const mapRoot = ref<HTMLDivElement | null>(null)
const tooltipEl = ref<HTMLDivElement | null>(null)

const states = ref<StateOrders[]>([])

const myOpenOrders = ref<OrderRow[]>([])
const myClosedOrders = ref<OrderRow[]>([])

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

const totalOpenOrders = computed(() => states.value.reduce((sum, s) => sum + s.openOrders, 0))

const isAccountInactive = computed(() => {
  const status = auth.state.value.profile?.account_status ?? null
  return status === 'inactive'
})

const COLOR_NEUTRAL = '#d1d5db'
const COLOR_GREEN = '#22c55e'
const COLOR_YELLOW = '#eab308'
const COLOR_RED = '#ef4444'

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
const filterCategory = ref<string>('all')
const filterState = ref<string>('all')
const filterExpiry = ref<string>('all')

const orderStateFilterOptions = computed(() => {
  const codes = new Set<string>()
  allOrders.value.forEach(o => {
    ;(o.target_states ?? []).forEach(s => {
      const code = String(s || '').trim().toUpperCase()
      if (code) codes.add(code)
    })
  })
  return [
    { label: 'All states', value: 'all' },
    ...Array.from(codes).sort().map(c => ({ label: c, value: c }))
  ]
})

const filteredOrders = computed(() => {
  let orders = allOrders.value

  if (filterCategory.value !== 'all') {
    orders = orders.filter(o => normalizeCaseType(String(o.case_type || '')) === filterCategory.value)
  }

  if (filterState.value !== 'all') {
    orders = orders.filter(o =>
      (o.target_states ?? []).some(s => String(s || '').trim().toUpperCase() === filterState.value)
    )
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
  { label: 'Blocked states', value: 'blocked' }
]

watch(mapFilter, () => {
  applyMapColors()
})

const blockMode = ref(false)
const blockedStateCodes = ref<string[]>([])

const blockedStateSet = computed(() => {
  return new Set(blockedStateCodes.value.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))
})

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
    return
  }

  try {
    const profile = await getAttorneyProfile(userId)
    const raw = (profile as unknown as Record<string, unknown>)?.blocked_states
    const codes = Array.isArray(raw) ? (raw as string[]) : null
    if (codes) {
      blockedStateCodes.value = codes
      saveBlockedStatesToLocalStorage(codes)
      return
    }
  } catch {
    // ignore
  }

  blockedStateCodes.value = loadBlockedStatesFromLocalStorage()
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
  caseCategory: 'Consumer Cases (MVA)' as string,
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

// Auto-adjust quota when switching category (Commercial max is 1)
watch(() => orderForm.value.caseCategory, (newCat) => {
  const max = newCat === 'Commercial Cases' ? 1 : 5
  if (orderForm.value.quotaTotal > max) {
    orderForm.value.quotaTotal = max
  }
})

const selectedStateName = computed(() => {
  const code = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!code) return ''
  return US_STATES.find(s => s.code === code)?.name ?? code
})

const maxQuotaForCategory = computed(() => {
  return orderForm.value.caseCategory === 'Commercial Cases' ? 1 : 5
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
    return 'Consumer Cases (MVA)'
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
  if (!canOrderInState(stateCode)) {
    return `You already have active orders in ${MAX_ORDER_STATES} states (the maximum allowed). To place orders in a new state, please close or wait for existing orders to expire, or contact your account manager.`
  }
  return null
})

// Combined order validation error
const orderValidationError = computed(() => {
  return maxOrderStatesError.value || maxOrdersPerStateError.value || duplicateCaseTypeError.value || quotaError.value || null
})

// Show toast whenever a validation error becomes active
watch(orderValidationError, (err) => {
  if (err) {
    toast.add({
      title: 'Order restriction',
      description: err,
      icon: 'i-lucide-alert-triangle',
      color: 'error'
    })
  }
})

const resetOrderForm = () => {
  orderForm.value = {
    stateCode: '',
    caseCategory: 'Consumer Cases (MVA)',
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
  pendingStateCode.value = null
  createOrderOpen.value = true
  createOrderStep.value = 1
  orderVerifyInput.value = ''
  orderVerifyTouched.value = false
}

const openCreateOrderForState = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return
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
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' }
]

const caseCategoryOptions = [
  { label: 'Consumer Cases (MVA)', value: 'Consumer Cases (MVA)' },
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
const MAX_ORDER_STATES = 5

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
const isAtMaxOrderStates = computed(() => activeOrderStateCount.value >= MAX_ORDER_STATES)

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
    .filter((s) => !blockedStateSet.value.has(s.code))
    // Max 2 orders per state (one per case category)
    .filter((s) => (openOrderCountByStateCode.value.get(s.code) ?? 0) < 2)
    // 5-state limit: only allow states that already have orders OR if under cap
    .filter((s) => canOrderInState(s.code))
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.code }))
})

const submitCreateOrder = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) return false

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return false

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
  if (orderValidationError.value) {
    toast.add({
      title: 'Order restriction',
      description: orderValidationError.value,
      icon: 'i-lucide-alert-triangle',
      color: 'error'
    })
    return
  }

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

const MAP_PATH_SELECTOR = 'path[data-id], path[id]'

const BLOCKED_PATTERN_ID = 'blocked-hatch'

const ensureBlockedPattern = (svg: SVGSVGElement) => {
  const existing = svg.querySelector(`#${BLOCKED_PATTERN_ID}`)
  if (existing) return

  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.insertBefore(defs, svg.firstChild)
  }

  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
  pattern.setAttribute('id', BLOCKED_PATTERN_ID)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', '10')
  pattern.setAttribute('height', '10')
  pattern.setAttribute('patternTransform', 'rotate(45)')

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '10')
  bg.setAttribute('height', '10')
  bg.setAttribute('fill', '#f3f4f6')

  const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  stripe.setAttribute('width', '2')
  stripe.setAttribute('height', '10')
  stripe.setAttribute('fill', '#9ca3af')

  pattern.appendChild(bg)
  pattern.appendChild(stripe)
  defs.appendChild(pattern)
}

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  ensureBlockedPattern(svg as SVGSVGElement)

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)

    const normalizedCode = String(code || '').trim().toUpperCase()
    const isBlocked = blockedStateSet.value.has(normalizedCode)

    const openOrders = Number(state?.openOrders) || 0
    const matchesFilter = mapFilter.value === 'all'
      ? true
      : mapFilter.value === 'no_orders'
        ? !isBlocked && openOrders === 0
        : mapFilter.value === 'has_orders'
          ? !isBlocked && openOrders > 0
          : isBlocked

    const fill = isBlocked
      ? `url(#${BLOCKED_PATTERN_ID})`
      : state
        ? getStateFillColor(state.code)
        : COLOR_NEUTRAL

    const stroke = '#0b0b0b'
    const strokeWidth = '0.8'

    path.style.setProperty('fill', fill, 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-width', strokeWidth, 'important')
    path.style.cursor = matchesFilter && state && !isBlocked ? 'pointer' : 'default'
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
  const state = stateByCode.value.get(code) ?? null
  if (!state) return

  tooltip.value.blocked = blockedStateSet.value.has(String(code || '').trim().toUpperCase())

  tooltip.value.state = state
  tooltip.value.myOrder = myOrderByStateCode.value.get(code) ?? null
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
  const state = stateByCode.value.get(code) ?? null
  if (!state) return

  const normalizedCode = String(code || '').trim().toUpperCase()
  if (blockMode.value) {
    const next = new Set(blockedStateSet.value)
    if (next.has(normalizedCode)) next.delete(normalizedCode)
    else next.add(normalizedCode)
    blockedStateCodes.value = Array.from(next)
    return
  }

  if (blockedStateSet.value.has(normalizedCode)) return

  const stateOrders = openOrdersForStateCode(normalizedCode)

  // If state has 2 orders (max per state), navigate to the first one
  if (stateOrders.length >= 2) {
    router.push(`/orders/${stateOrders[0].id}?state=${normalizedCode}`)
    return
  }

  // If state has 1 order — navigate to it (user can use Create Order for 2nd)
  if (stateOrders.length === 1) {
    router.push(`/orders/${stateOrders[0].id}?state=${normalizedCode}`)
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
      rebuildStatesFromMyOrders()
    } finally {
      loading.value = false
    }

    await mountSvg()
    bindSvgEvents()
    applyMapColors()
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
</script>

<template>
  <UDashboardPanel id="intake-map">
    <template #header>
      <UDashboardNavbar title="Order Map">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
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
            color="neutral"
            :variant="blockMode ? 'solid' : 'outline'"
            :icon="blockMode ? 'i-lucide-check' : 'i-lucide-ban'"
            @click="() => { blockMode = !blockMode }"
          >
            {{ blockMode ? 'Done blocking' : 'Block states' }}
          </UButton>

          <UTooltip v-if="isAccountInactive" text="Locked until Onboarding is Completed">
            <span class="inline-flex opacity-50 cursor-not-allowed">
              <UButton
                color="primary"
                variant="solid"
                icon="i-lucide-plus"
                disabled
              >
                Create Order
              </UButton>
            </span>
          </UTooltip>
          <UTooltip v-else-if="isAtMaxOrderStates && orderStateOptions.length === 0" :text="`You have active orders in ${activeOrderStateCount} states (max ${MAX_ORDER_STATES}) and all are at full capacity. Contact your account manager to increase your state limit.`">
            <span class="inline-flex opacity-50 cursor-not-allowed">
              <UButton
                color="primary"
                variant="solid"
                icon="i-lucide-plus"
                disabled
              >
                Create Order
              </UButton>
            </span>
          </UTooltip>
          <UTooltip v-else-if="isAtMaxOrderStates && orderStateOptions.length > 0" :text="`State limit reached (${activeOrderStateCount}/${MAX_ORDER_STATES}). You can only add orders in your existing states.`">
            <UButton
              color="primary"
              variant="solid"
              icon="i-lucide-plus"
              @click="openCreateOrder"
            >
              Create Order
            </UButton>
          </UTooltip>
          <UButton
            v-else
            color="primary"
            variant="solid"
            icon="i-lucide-plus"
            @click="openCreateOrder"
          >
            Create Order
          </UButton>

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
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="relative flex flex-col gap-5">
        <!-- Locked Overlay for Inactive Accounts -->
        <div
          v-if="isAccountInactive"
          class="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-white/30 dark:bg-black/30"
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
          v-if="isAtMaxOrderStates && !isAccountInactive"
          class="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-3.5"
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
          v-if="blockMode"
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
          :ui="{ content: 'sm:max-w-4xl', body: 'p-0' }"
          @update:open="handleCreateOrderOpenUpdate"
        >
          <template #body="{ close }">
            <div class="flex max-h-[78vh] flex-col">
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

              <div v-if="createOrderStep === 1" class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div class="space-y-4">
                  <UAlert
                    color="neutral"
                    variant="subtle"
                    title="Verification"
                    :description="`To continue, type ${orderVerifyPhrase} below.`"
                  />

                  <UFormField label="Verification word" required :error="orderVerifyError">
                    <UInput
                      v-model="orderVerifyInput"
                      placeholder="Type the verification word"
                      @blur="() => { orderVerifyTouched = true }"
                    />
                  </UFormField>
                </div>
              </div>

              <div v-else class="min-h-0 flex-1 overflow-y-auto px-6 py-4">

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="State" required>
                    <USelect
                      v-model="orderForm.stateCode"
                      :items="orderStateOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select a state"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Case category" required>
                    <USelect
                      v-model="orderForm.caseCategory"
                      :items="caseCategoryOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select case category"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Injury severity" required>
                    <USelect
                      v-model="orderForm.injurySeverity"
                      :items="injurySeverityOptions"
                      class="w-full sm:w-1/2"
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
                      v-model="orderForm.liabilityStatus"
                      :items="liabilityOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select liability"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Insurance status" required>
                    <USelect
                      v-model="orderForm.insuranceStatus"
                      :items="insuranceOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select insurance"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Medical treatment" required>
                    <USelect
                      v-model="orderForm.medicalTreatment"
                      :items="medicalTreatmentOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Languages" required>
                    <USelect
                      v-model="orderForm.languages"
                      :items="languageOptions"
                      class="w-full sm:w-1/2"
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
                    <UCheckbox v-model="orderForm.noPriorAttorney" label="No prior attorney" />
                  </UFormField>

                  <UFormField label="Quota" description="Total number of cases needed" required>
                    <UInput
                      v-model.number="orderForm.quotaTotal"
                      type="number"
                      min="1"
                      :max="maxQuotaForCategory"
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
                  :disabled="createOrderSubmitting || !!orderValidationError || !String(orderForm.stateCode || '').trim() || Number(orderForm.quotaTotal) <= 0"
                  @click="async () => { await handleCreateOrderSubmit(close) }"
                >
                  Create
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- ═══ Legend & Filter ═══ -->
        <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-map" class="text-sm text-[var(--ap-accent)]" />
                </div>
                <h3 class="text-sm font-semibold text-highlighted">My order volume by state</h3>
              </div>
              <div class="flex items-center gap-3">
                <span
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                  :class="isAtMaxOrderStates
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] text-muted'"
                >
                  <UIcon :name="isAtMaxOrderStates ? 'i-lucide-alert-triangle' : 'i-lucide-map-pin'" class="text-[10px]" />
                  {{ activeOrderStateCount }}/{{ MAX_ORDER_STATES }} states
                </span>
                <USelect v-model="mapFilter" :items="mapFilterOptions" size="sm" />
              </div>
            </div>
            <div class="grid gap-3 sm:grid-cols-5">
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-gray-300" />
                <span class="text-xs text-muted">No orders</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-green-500" />
                <span class="text-xs text-muted">Pending</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-yellow-500" />
                <span class="text-xs text-muted">In Progress</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-red-500" />
                <span class="text-xs text-muted">Fulfilled / Expired</span>
              </div>
              <div class="flex items-center gap-2">
                <div
                  class="size-4 rounded-full"
                  style="background: repeating-linear-gradient(45deg, #9ca3af 0 2px, #f3f4f6 2px 6px);"
                />
                <span class="text-xs text-muted">Blocked</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Map ═══ -->
        <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4 overflow-hidden">
          <div class="relative">
            <div
              ref="mapRoot"
              class="w-full rounded-xl bg-white overflow-hidden"
              style="height: 520px;"
            />

            <div
              v-if="tooltip.open && tooltip.state"
              ref="tooltipEl"
              class="pointer-events-none absolute z-10 rounded-xl border border-[var(--ap-card-border)] bg-white dark:bg-[#1a1a1a] px-4 py-3 shadow-xl"
              :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            >
              <div class="text-sm font-semibold text-highlighted">
                {{ tooltip.state.name }} ({{ tooltip.state.code }})
              </div>
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
            </div>
          </div>
        </div>

        <!-- ═══ Stats Cards ═══ -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-layers" class="text-sm text-muted" />
              <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Orders</span>
            </div>
            <div class="text-2xl font-bold text-highlighted tabular-nums">{{ statsTotal }}</div>
          </div>
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-circle-dot" class="text-sm text-blue-400" />
              <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Open Orders</span>
            </div>
            <div class="text-2xl font-bold text-blue-400 tabular-nums">{{ statsOpen }}</div>
          </div>
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-clock" class="text-sm text-green-400" />
              <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Pending</span>
            </div>
            <div class="text-2xl font-bold text-green-400 tabular-nums">{{ statsPending }}</div>
          </div>
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-check-circle" class="text-sm text-amber-400" />
              <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Completed</span>
            </div>
            <div class="text-2xl font-bold text-amber-400 tabular-nums">{{ statsCompleted }}</div>
          </div>
        </div>

        <!-- ═══ Orders Section ═══ -->
        <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
          <!-- Header + Filters -->
          <div class="border-b border-[var(--ap-card-border)] px-5 py-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <UIcon name="i-lucide-shopping-cart" class="text-sm text-blue-400" />
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">My Orders</h3>
                  <p class="text-[11px] text-muted">All your orders — open and closed</p>
                </div>
              </div>
              <span class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-3 py-1 text-xs font-semibold text-muted">
                {{ filteredOrders.length }} / {{ statsTotal }} orders
              </span>
            </div>

            <!-- Filter Row -->
            <div class="flex flex-wrap items-center gap-2">
              <!-- Case Category -->
              <USelect
                v-model="filterCategory"
                :items="[
                  { label: 'All categories', value: 'all' },
                  { label: 'Consumer Cases (MVA)', value: 'Consumer Cases (MVA)' },
                  { label: 'Commercial Cases', value: 'Commercial Cases' },
                ]"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-48"
              />
              <!-- State -->
              <USelect
                v-model="filterState"
                :items="orderStateFilterOptions"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-36"
              />
              <!-- Expiry -->
              <USelect
                v-model="filterExpiry"
                :items="[
                  { label: 'Any expiry', value: 'all' },
                  { label: 'Next 30 days', value: '30' },
                  { label: 'Next 60 days', value: '60' },
                  { label: 'Next 90 days', value: '90' },
                  { label: 'No expiry date', value: 'no_expiry' },
                ]"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-40"
              />
              <!-- Reset -->
              <UButton
                v-if="filterCategory !== 'all' || filterState !== 'all' || filterExpiry !== 'all'"
                icon="i-lucide-x"
                size="sm"
                color="neutral"
                variant="ghost"
                label="Reset"
                @click="filterCategory = 'all'; filterState = 'all'; filterExpiry = 'all'"
              />
            </div>
          </div>

          <!-- Empty -->
          <div v-if="filteredOrders.length === 0" class="flex items-center justify-center p-10">
            <div class="text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 mb-3">
                <UIcon name="i-lucide-shopping-cart" class="text-xl text-blue-400/50" />
              </div>
              <p class="text-sm text-muted">No orders match the selected filters</p>
            </div>
          </div>

          <!-- Orders List -->
          <div v-else class="divide-y divide-[var(--ap-card-divide)]">
            <div
              v-for="order in filteredOrders"
              :key="order.id"
              class="group cursor-pointer px-5 py-4 transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
              @click="router.push(`/orders/${order.id}`)"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)] transition-colors">
                    {{ normalizeCaseType(order.case_type || '') }}
                    <span v-if="order.case_subtype" class="text-muted">— {{ order.case_subtype }}</span>
                  </div>
                  <div class="mt-1 text-[11px] text-muted">
                    States: {{ (order.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—' }}
                  </div>
                </div>

                <div class="min-w-[180px]">
                  <div class="flex items-center justify-end gap-2 flex-wrap">
                    <!-- Status badge -->
                    <span
                      class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      :class="{
                        'bg-amber-500/10 text-amber-400': getOrderDisplayStatus(order) === 'In Progress',
                        'bg-green-500/10 text-green-400': getOrderDisplayStatus(order) === 'Pending',
                        'bg-blue-500/10 text-blue-400': order.status === 'FULFILLED',
                        'bg-red-500/10 text-red-400': order.status === 'EXPIRED',
                      }"
                    >
                      {{ order.status === 'FULFILLED' ? 'Completed' : order.status === 'EXPIRED' ? 'Expired' : getOrderDisplayStatus(order) }}
                    </span>
                    <span class="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                      Quota {{ order.quota_filled }}/{{ order.quota_total }}
                    </span>
                    <span class="inline-flex items-center rounded-md bg-[var(--ap-card-divide)] px-2 py-0.5 text-[11px] font-medium text-muted">
                      {{ new Date(order.expires_at || '').getFullYear() >= 2099 ? 'No expiry' : `Expires ${String(order.expires_at || '').slice(0, 10)}` }}
                    </span>
                  </div>

                  <div class="mt-2 flex items-center justify-end gap-2">
                    <div class="w-10 text-right text-[11px] text-muted tabular-nums">
                      {{ orderProgressPercent(order) }}%
                    </div>
                    <div class="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--ap-card-border)]">
                      <div
                        class="h-full rounded-full transition-all duration-500"
                        :class="orderProgressPercent(order) >= 100 ? 'bg-green-400' : 'bg-blue-400'"
                        :style="{ width: `${Math.min(orderProgressPercent(order), 100)}%` }"
                      />
                    </div>
                    <div class="w-12 text-right text-[11px] text-muted tabular-nums">
                      {{ order.quota_filled }}/{{ order.quota_total }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
