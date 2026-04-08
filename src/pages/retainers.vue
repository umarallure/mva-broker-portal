<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DateFormatter, getLocalTimeZone, CalendarDate, today } from '@internationalized/date'

import ProductGuideHint from '../components/product-guide/ProductGuideHint.vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { useDragGhost } from '../composables/useDragGhost'
import { productGuideHints } from '../data/product-guide-hints'

type CustomerStageKey = 'new_customers_for_review' | '24_hour_approval' | 'customer_approved' | 'customer_rejected'

const STAGES: { key: CustomerStageKey, label: string }[] = [
  { key: 'new_customers_for_review', label: 'My Cases' },
  { key: '24_hour_approval', label: '24 Hour Approval' },
  { key: 'customer_approved', label: 'Customer Approved' },
  { key: 'customer_rejected', label: 'Customer Rejected' }
]

const getStageGuideHint = (stage: CustomerStageKey) => {
  if (stage === 'new_customers_for_review') return myCasesHints.myCasesColumn
  if (stage === '24_hour_approval') return myCasesHints.approvalColumn
  if (stage === 'customer_approved') return myCasesHints.approvedColumn
  return myCasesHints.rejectedColumn
}

type CustomerCard = {
  id: string
  submissionId: string
  clientName: string
  phone: string
  date: string
  rawDate: string | null
  state: string
  status: string
  stage: CustomerStageKey
  leadVendor: string
  assignedAttorneyName: string
  source: 'daily_deal_flow' | 'leads'
}

type DailyDealFlow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  state: string | null
  date: string | null
  status: string | null
  submitted_attorney_status?: string | null
  assigned_attorney_id?: string | null
  assigned_attorney_name?: string | null
  agent: string | null
  carrier: string | null
  created_at: string | null
  source?: 'daily_deal_flow' | 'leads'
}

type LeadRow = Record<string, unknown>

const router = useRouter()
const auth = useAuth()
const toast = useToast()
const myCasesHints = productGuideHints.myCases

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const canSeeAssignments = computed(() => isSuperAdmin.value || isAdmin.value)

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | CustomerStageKey>('all')
const selectedDateRange = ref('all')
const showFilters = ref(false)

// ── Order Map–style multi-select filters (empty = no filter) ──
const filterStates = ref<string[]>([])
const filterCaseCategory = ref<string[]>([])
const filterInjurySeverity = ref<string[]>([])
const filterInsuranceStatus = ref<string[]>([])
const filterLiabilityStatus = ref<string[]>([])
const filterMedicalTreatment = ref<string[]>([])
const filterLanguage = ref<string[]>([])
const filterExpiry = ref<string>('all')

// ── Custom date range calendar ──
const calendarDf = new DateFormatter('en-US', { dateStyle: 'medium' })

const toCalendarDate = (date: Date) =>
  new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())

const calendarRange = ref<{ start: CalendarDate | undefined; end: CalendarDate | undefined }>({
  start: undefined,
  end: undefined
})

const calendarOpen = ref(false)
const calendarMaxDate = computed(() => today(getLocalTimeZone()))

const PRESET_RANGES = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 3 months', months: 3 }
] as const

const isPresetSelected = (range: { days?: number; months?: number }) => {
  if (!calendarRange.value.start || !calendarRange.value.end) return false
  const end = today(getLocalTimeZone())
  let start = end.copy()
  if (range.days !== undefined) {
    start = range.days === 0 ? end.copy() : start.subtract({ days: range.days })
  } else if (range.months) {
    start = start.subtract({ months: range.months })
  }
  return calendarRange.value.start.compare(start) === 0 && calendarRange.value.end.compare(end) === 0
}

const selectPresetRange = (range: { days?: number; months?: number }) => {
  const end = today(getLocalTimeZone())
  let start = end.copy()
  if (range.days !== undefined) {
    start = range.days === 0 ? end.copy() : start.subtract({ days: range.days })
  } else if (range.months) {
    start = start.subtract({ months: range.months })
  }
  calendarRange.value = { start, end }
  calendarOpen.value = false
}

// Sync calendarRange → selectedDateRange + matchesDateFilter
watch(calendarRange, (val) => {
  if (val.start && val.end) {
    selectedDateRange.value = 'custom'
  }
}, { deep: true })

type DateRangeOption = { label: string; value: string }
const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Last 3 Months', value: 'last_3_months' },
  { label: 'Custom Range', value: 'custom' }
]

const rows = ref<DailyDealFlow[]>([])
const leads = ref<CustomerCard[]>([])

const dragLeadId = ref<string | null>(null)
const dragFromStage = ref<CustomerStageKey | null>(null)

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()

const toStage = (row: DailyDealFlow): CustomerStageKey => {
  const s = normalize(row.status)

  if (s === 'attorney_review') return '24_hour_approval'
  if (s === 'qualified_payable') return 'customer_approved'
  if (s === 'attorney_rejected') return 'customer_rejected'

  // Default: everything else goes to "My Cases"
  return 'new_customers_for_review'
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value.length >= 10 ? value.slice(0, 10) : value
  }
}

const formatPhone = (phone: string | null) => {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const normalizeState = (v: string | null): string => {
  if (!v) return '—'
  const s = v.trim().toUpperCase()
  if (s.length === 2) return s
  // Common full-name mappings
  const map: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
    MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
    VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC'
  }
  return map[s] ?? v.trim()
}

const coerceCard = (row: DailyDealFlow): CustomerCard => {
  return {
    id: row.id,
    submissionId: row.submission_id,
    clientName: row.insured_name ?? 'Unknown Client',
    phone: row.client_phone_number ?? '—',
    date: formatDate(row.date ?? row.created_at),
    rawDate: row.date ?? row.created_at ?? null,
    state: normalizeState(row.state),
    status: row.status ?? '—',
    stage: toStage(row),
    leadVendor: row.lead_vendor ?? '—',
    assignedAttorneyName: row.assigned_attorney_name ?? '—',
    source: row.source ?? 'daily_deal_flow'
  }
}

const load = async () => {
  loading.value = true

  try {
    await auth.init()

    const userId = auth.state.value.profile?.user_id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    // For lawyers, build a list of name keywords for fallback matching
    let nameKeywords: string[] = []
    if (userRole === 'lawyer' && userId) {
      const { data: attorneyProfile } = await supabase
        .from('attorney_profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle()

      const fullName = attorneyProfile?.full_name?.trim() || null
      const displayName = auth.state.value.profile?.display_name?.trim() || null
      const email = auth.state.value.profile?.email || null
      // Extract name from email prefix (e.g. "bradleydworkin" from "bradleydworkin@...")
      const emailName = email ? email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() : null

      // Collect name keywords from all sources
      const rawName = fullName || displayName || emailName || ''
      nameKeywords = rawName
        .split(/[\s\-_]+/)
        .map((w: string) => w.trim().toLowerCase())
        .filter((w: string) => w.length >= 3)
    }

    const selectCols = 'id,submission_id,insured_name,client_phone_number,lead_vendor,state,date,status,submitted_attorney_status,assigned_attorney_id,submitted_attorney,agent,carrier,created_at'

    let dealFlows: DailyDealFlow[] = []

    if (userRole === 'lawyer' && userId) {
      // First try matching by assigned_attorney_id
      const { data: byId, error: byIdErr } = await supabase
        .from('daily_deal_flow')
        .select(selectCols)
        .ilike('submitted_attorney_status', '%submitted%')
        .eq('assigned_attorney_id', userId)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (byIdErr) throw byIdErr
      dealFlows = (byId ?? []) as DailyDealFlow[]

      // Fallback: match by any name keyword in submitted_attorney field
      if (dealFlows.length === 0 && nameKeywords.length > 0) {
        // Build OR filter for each keyword: submitted_attorney.ilike.%keyword1%,submitted_attorney.ilike.%keyword2%
        const orFilter = nameKeywords
          .map((kw: string) => `submitted_attorney.ilike.%${kw}%`)
          .join(',')

        const { data: byName, error: byNameErr } = await supabase
          .from('daily_deal_flow')
          .select(selectCols)
          .ilike('submitted_attorney_status', '%submitted%')
          .or(orFilter)
          .order('created_at', { ascending: false })
          .limit(1000)

        if (byNameErr) throw byNameErr
        dealFlows = (byName ?? []) as DailyDealFlow[]
      }
    } else if (!userRole && userId) {
      const { data: userData } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (userData?.center_id) {
        const { data: centerData } = await supabase
          .from('centers')
          .select('lead_vendor')
          .eq('id', userData.center_id)
          .maybeSingle()

        if (centerData?.lead_vendor) {
          const { data, error: supaError } = await supabase
            .from('daily_deal_flow')
            .select(selectCols)
            .ilike('submitted_attorney_status', '%submitted%')
            .eq('lead_vendor', centerData.lead_vendor)
            .order('created_at', { ascending: false })
            .limit(1000)

          if (supaError) throw supaError
          dealFlows = (data ?? []) as DailyDealFlow[]
        } else {
          rows.value = []
          leads.value = []
          return
        }
      } else {
        rows.value = []
        leads.value = []
        return
      }
    } else {
      // Admin/agent: fetch all
      const { data, error: supaError } = await supabase
        .from('daily_deal_flow')
        .select(selectCols)
        .ilike('submitted_attorney_status', '%submitted%')
        .order('created_at', { ascending: false })
        .limit(1000)

      if (supaError) throw supaError
      dealFlows = (data ?? []) as DailyDealFlow[]
    }

    dealFlows.forEach((r) => {
      r.source = 'daily_deal_flow'
    })

    // Fallback to leads table for lawyers with no daily_deal_flow data
    if (userRole === 'lawyer' && userId && dealFlows.length === 0) {
      const { data: leadsData, error: leadsErr } = await supabase
        .from('leads')
        .select('*')
        .eq('assigned_attorney_id', userId)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (leadsErr) throw leadsErr

      const mapped = (leadsData ?? []).map((r: unknown): DailyDealFlow => {
        const row = (r ?? {}) as LeadRow
        const createdAt = (row.created_at ? String(row.created_at) : null)
        const date = (row.submission_date ? String(row.submission_date) : createdAt)
        return {
          id: String(row.id ?? ''),
          submission_id: String(row.submission_id ?? ''),
          insured_name: (row.customer_full_name ? String(row.customer_full_name) : null),
          client_phone_number: (row.phone_number ? String(row.phone_number) : null),
          lead_vendor: (row.lead_vendor ? String(row.lead_vendor) : null),
          state: (row.state ? String(row.state) : null),
          date,
          status: (row.status ? String(row.status) : null),
          submitted_attorney_status: (row.submitted_attorney_status ? String(row.submitted_attorney_status) : null),
          assigned_attorney_id: (row.assigned_attorney_id ? String(row.assigned_attorney_id) : null),
          agent: null,
          carrier: null,
          created_at: createdAt,
          source: 'leads'
        }
      }).filter((r) => {
        if (!r.id || !r.submission_id) return false
        const s = String(r.submitted_attorney_status ?? '').toLowerCase()
        return s.includes('submitted')
      })

      dealFlows = mapped
    }

    // Resolve attorney names for admin+
    if (canSeeAssignments.value) {
      const attorneyIds = [...new Set(dealFlows
        .map(d => d.assigned_attorney_id)
        .filter((id): id is string => Boolean(id))
      )]

      if (attorneyIds.length) {
        const { data: attorneys, error: attorneysError } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', attorneyIds)

        if (!attorneysError && attorneys) {
          const attorneyNameByUserId = new Map(
            (attorneys ?? []).map((a: unknown) => {
              const row = (a ?? {}) as Record<string, unknown>
              return [String(row.user_id ?? ''), String(row.full_name ?? '').trim()]
            })
          )

          dealFlows.forEach((flow) => {
            const id = flow.assigned_attorney_id ?? null
            if (!id) return
            const name = attorneyNameByUserId.get(id) ?? ''
            flow.assigned_attorney_name = name.length ? name : null
          })
        }
      }
    }

    rows.value = dealFlows
    leads.value = dealFlows.map(coerceCard)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load customers'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {})
})

watch(query, () => {
  // query filtering is done client-side via filteredLeads
})

const availableStates = computed(() => {
  const states = new Set<string>()
  leads.value.forEach(l => {
    if (l.state && l.state !== '—') states.add(l.state)
  })
  return [...states].sort()
})

// ── Filter options (same as Order Map) ──
const stateFilterOptions = computed(() => [
  { label: 'All states', value: '__all__' },
  ...availableStates.value.map(s => ({ label: s, value: s }))
])

let _skipStatesWatch = false
watch(filterStates, (newVal, oldVal) => {
  if (_skipStatesWatch) return
  const hadAll = oldVal.includes('__all__')
  const hasAll = newVal.includes('__all__')
  const realCodes = availableStates.value

  _skipStatesWatch = true
  if (hasAll && !hadAll) {
    filterStates.value = ['__all__', ...realCodes]
  } else if (!hasAll && hadAll) {
    filterStates.value = []
  } else if (hadAll && hasAll) {
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length < realCodes.length) {
      filterStates.value = withoutAll
    }
  } else if (!hadAll && !hasAll) {
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length === realCodes.length && realCodes.length > 0) {
      filterStates.value = ['__all__', ...realCodes]
    }
  }
  _skipStatesWatch = false
})

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden'
}

const filterCaseCategoryOptions = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Commercial Cases', value: 'Commercial Cases' },
]

const injurySeverityOptions = [
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' }
]

const insuranceOptions = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const liabilityOptions = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const medicalTreatmentOptions = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

const filterExpiryOptions = [
  { label: 'Any expiry', value: 'all' },
  { label: 'Next 30 days', value: '30' },
  { label: 'Next 60 days', value: '60' },
  { label: 'Next 90 days', value: '90' },
  { label: 'No expiry date', value: 'no_expiry' },
]

const filterLanguageOptions = computed(() => {
  const langs = new Set<string>()
  leads.value.forEach(l => {
    // Language is not currently on CustomerCard; placeholder for future data
  })
  // Default options matching Order Map
  return [{ label: 'English', value: 'English' }]
})

const activeFilterCount = computed(() => {
  let count = 0
  if (filterStates.value.filter(v => v !== '__all__').length > 0) count++
  if (filterCaseCategory.value.length > 0) count++
  if (filterInjurySeverity.value.length > 0) count++
  if (filterInsuranceStatus.value.length > 0) count++
  if (filterLiabilityStatus.value.length > 0) count++
  if (filterMedicalTreatment.value.length > 0) count++
  if (filterLanguage.value.length > 0) count++
  if (filterExpiry.value !== 'all') count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || selectedDateRange.value !== 'all')

const resetAllFilters = () => {
  filterStates.value = []
  filterCaseCategory.value = []
  filterInjurySeverity.value = []
  filterInsuranceStatus.value = []
  filterLiabilityStatus.value = []
  filterMedicalTreatment.value = []
  filterLanguage.value = []
  filterExpiry.value = 'all'
  selectedDateRange.value = 'all'
  calendarRange.value = { start: undefined, end: undefined }
  query.value = ''
}

const stageHeaderBg = (key: CustomerStageKey) => {
  switch (key) {
    case 'new_customers_for_review': return 'bg-gradient-to-r from-blue-500/[0.10] via-blue-500/[0.04] to-transparent dark:from-blue-400/[0.14] dark:via-blue-400/[0.06] dark:to-transparent'
    case '24_hour_approval': return 'bg-gradient-to-r from-amber-500/[0.10] via-amber-500/[0.04] to-transparent dark:from-amber-400/[0.14] dark:via-amber-400/[0.06] dark:to-transparent'
    case 'customer_approved': return 'bg-gradient-to-r from-green-500/[0.10] via-green-500/[0.04] to-transparent dark:from-green-400/[0.14] dark:via-green-400/[0.06] dark:to-transparent'
    case 'customer_rejected': return 'bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.04] to-transparent dark:from-red-400/[0.14] dark:via-red-400/[0.06] dark:to-transparent'
  }
}

const getStartOfDay = (d: Date) => {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  return start
}

const matchesDateFilter = (rawDate: string | null): boolean => {
  const range = selectedDateRange.value
  if (range === 'all') return true
  if (!rawDate) return false

  const leadDate = getStartOfDay(new Date(rawDate))
  const now = new Date()
  const todayDate = getStartOfDay(now)

  if (range === 'today') {
    return leadDate.getTime() === todayDate.getTime()
  }
  if (range === 'yesterday') {
    const yesterday = new Date(todayDate)
    yesterday.setDate(yesterday.getDate() - 1)
    return leadDate.getTime() === yesterday.getTime()
  }
  if (range === 'last_week') {
    const weekAgo = new Date(todayDate)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return leadDate.getTime() >= weekAgo.getTime() && leadDate.getTime() <= todayDate.getTime()
  }
  if (range === 'last_month') {
    const monthAgo = new Date(todayDate)
    monthAgo.setDate(monthAgo.getDate() - 30)
    return leadDate.getTime() >= monthAgo.getTime() && leadDate.getTime() <= todayDate.getTime()
  }
  if (range === 'last_3_months') {
    const threeMonthsAgo = new Date(todayDate)
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90)
    return leadDate.getTime() >= threeMonthsAgo.getTime() && leadDate.getTime() <= todayDate.getTime()
  }
  if (range === 'custom') {
    const cr = calendarRange.value
    if (cr.start && cr.end) {
      const from = getStartOfDay(cr.start.toDate(getLocalTimeZone()))
      const to = getStartOfDay(cr.end.toDate(getLocalTimeZone()))
      return leadDate.getTime() >= from.getTime() && leadDate.getTime() <= to.getTime()
    }
    if (cr.start) {
      const from = getStartOfDay(cr.start.toDate(getLocalTimeZone()))
      return leadDate.getTime() >= from.getTime()
    }
  }
  return true
}

const filteredLeads = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value
  const activeStates = filterStates.value.filter(v => v !== '__all__')

  return leads.value.filter((l) => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false
    if (activeStates.length > 0 && !activeStates.includes(l.state)) return false
    if (!matchesDateFilter(l.rawDate)) return false
    if (!q) return true
    return [l.clientName, l.phone, l.submissionId, l.status, l.leadVendor, l.assignedAttorneyName, l.state]
      .some(v => String(v ?? '').toLowerCase().includes(q))
  })
})

const leadsByStage = computed(() => {
  const grouped = new Map<CustomerStageKey, CustomerCard[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
  filteredLeads.value.forEach((l) => {
    const arr = grouped.get(l.stage) ?? []
    arr.push(l)
    grouped.set(l.stage, arr)
  })
  return grouped
})

const newReviewCount = computed(() => (leadsByStage.value.get('new_customers_for_review') ?? []).length)
const approvalCount = computed(() => (leadsByStage.value.get('24_hour_approval') ?? []).length)
const approvedCount = computed(() => (leadsByStage.value.get('customer_approved') ?? []).length)
const rejectedCount = computed(() => (leadsByStage.value.get('customer_rejected') ?? []).length)

const openLead = (lead: CustomerCard) => {
  router.push(`/retainers/${lead.id}`)
}

const { startDrag, endDrag } = useDragGhost()

const onDragStartLead = (e: DragEvent, lead: CustomerCard) => {
  startDrag(e)
  dragLeadId.value = lead.id
  dragFromStage.value = lead.stage
}

const onDragEndLead = () => {
  endDrag()
  dragLeadId.value = null
  dragFromStage.value = null
}

// Confirmation modal state
const moveConfirmOpen = ref(false)
const moveConfirmBusy = ref(false)
const pendingMoveLeadId = ref<string | null>(null)
const pendingMoveFromStage = ref<CustomerStageKey | null>(null)
const pendingMoveToStage = ref<CustomerStageKey | null>(null)

const pendingMoveLeadName = computed(() => {
  if (!pendingMoveLeadId.value) return ''
  return leads.value.find(l => l.id === pendingMoveLeadId.value)?.clientName ?? ''
})

const pendingMoveFromLabel = computed(() => {
  if (!pendingMoveFromStage.value) return ''
  return STAGES.find(s => s.key === pendingMoveFromStage.value)?.label ?? ''
})

const pendingMoveToLabel = computed(() => {
  if (!pendingMoveToStage.value) return ''
  return STAGES.find(s => s.key === pendingMoveToStage.value)?.label ?? ''
})

const onDropToStage = (targetStage: CustomerStageKey) => {
  const leadId = dragLeadId.value
  const fromStage = dragFromStage.value
  onDragEndLead()

  if (!leadId || !fromStage) return
  if (fromStage === targetStage) return

  const idx = leads.value.findIndex(l => l.id === leadId)
  if (idx < 0) return

  pendingMoveLeadId.value = leadId
  pendingMoveFromStage.value = fromStage
  pendingMoveToStage.value = targetStage
  moveConfirmOpen.value = true
}

const handleMoveConfirmUpdate = (v: boolean) => {
  moveConfirmOpen.value = v
  if (!v) {
    pendingMoveLeadId.value = null
    pendingMoveFromStage.value = null
    pendingMoveToStage.value = null
    moveConfirmBusy.value = false
  }
}

const confirmMove = async () => {
  const leadId = pendingMoveLeadId.value
  const fromStage = pendingMoveFromStage.value
  const targetStage = pendingMoveToStage.value
  if (!leadId || !fromStage || !targetStage) return

  const idx = leads.value.findIndex(l => l.id === leadId)
  if (idx < 0) return

  moveConfirmBusy.value = true

  const prevStage = leads.value[idx].stage
  const prevStatus = leads.value[idx].status

  const targetDbStatus: string | null | undefined = (() => {
    if (targetStage === 'new_customers_for_review') return undefined
    if (targetStage === '24_hour_approval') return 'attorney_review'
    if (targetStage === 'customer_approved') return 'qualified_payable'
    if (targetStage === 'customer_rejected') return 'attorney_rejected'
    return targetStage
  })()

  leads.value[idx] = {
    ...leads.value[idx],
    stage: targetStage,
    status: targetDbStatus === undefined ? prevStatus : (targetDbStatus ?? '')
  }

  try {
    if (targetDbStatus !== undefined) {
      const { error } = await supabase
        .from('daily_deal_flow')
        .update({ status: targetDbStatus })
        .eq('id', leadId)

      if (error) throw error

      const toLabel = STAGES.find(s => s.key === targetStage)?.label ?? targetStage
      toast.add({
        title: 'Updated',
        description: `Moved to ${toLabel}.`,
        icon: 'i-lucide-check-circle',
        color: 'success'
      })
    }

    moveConfirmOpen.value = false
    pendingMoveLeadId.value = null
    pendingMoveFromStage.value = null
    pendingMoveToStage.value = null
  } catch (err) {
    leads.value[idx] = {
      ...leads.value[idx],
      stage: prevStage,
      status: prevStatus
    }

    const msg = err instanceof Error ? err.message : 'Unable to update stage'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    moveConfirmBusy.value = false
  }
}

const stageIcon = (key: CustomerStageKey) => {
  switch (key) {
    case 'new_customers_for_review': return 'i-lucide-user-plus'
    case '24_hour_approval': return 'i-lucide-clock'
    case 'customer_approved': return 'i-lucide-check-circle'
    case 'customer_rejected': return 'i-lucide-x-circle'
  }
}

const stageBgClass = (key: CustomerStageKey) => {
  switch (key) {
    case 'new_customers_for_review': return 'bg-blue-500/10'
    case '24_hour_approval': return 'bg-amber-500/10'
    case 'customer_approved': return 'bg-green-500/10'
    case 'customer_rejected': return 'bg-red-500/10'
  }
}

const stageIconClass = (key: CustomerStageKey) => {
  switch (key) {
    case 'new_customers_for_review': return 'text-blue-400'
    case '24_hour_approval': return 'text-amber-400'
    case 'customer_approved': return 'text-green-400'
    case 'customer_rejected': return 'text-red-400'
  }
}

const stageCardAccentStyle = (key: CustomerStageKey) => {
  switch (key) {
    case 'new_customers_for_review':
      return { '--ap-accent': '#60a5fa', '--ap-accent-rgb': '96 165 250' }
    case '24_hour_approval':
      return { '--ap-accent': '#fbbf24', '--ap-accent-rgb': '251 191 36' }
    case 'customer_approved':
      return { '--ap-accent': '#4ade80', '--ap-accent-rgb': '74 222 128' }
    case 'customer_rejected':
      return { '--ap-accent': '#f87171', '--ap-accent-rgb': '248 113 113' }
  }
}
</script>

<template>
  <UDashboardPanel id="retainers">
    <template #header>
      <UDashboardNavbar title="My Cases">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="load"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-5">
        <!-- Move Confirmation Modal -->
        <UModal
          :open="moveConfirmOpen"
          title="Move Customer"
          :dismissible="false"
          @update:open="handleMoveConfirmUpdate"
        >
          <template #body="{ close }">
            <div class="space-y-5">
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-arrow-right-left" class="text-lg text-[var(--ap-accent)]" />
                </div>
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Are you sure?
                  </p>
                  <p class="mt-0.5 text-sm text-muted">
                    You are moving <span class="font-semibold text-highlighted">{{ pendingMoveLeadName }}</span> from
                    <span class="font-semibold text-highlighted">{{ pendingMoveFromLabel }}</span> to
                    <span class="font-semibold text-highlighted">{{ pendingMoveToLabel }}</span>.
                  </p>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 pt-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="moveConfirmBusy"
                  class="rounded-lg"
                  @click="() => { close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  :loading="moveConfirmBusy"
                  icon="i-lucide-check"
                  class="rounded-lg"
                  @click="confirmMove"
                >
                  Confirm
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- Stat Cards -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="ap-fade-in group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">New for Review</p>
                  <ProductGuideHint
                    :title="myCasesHints.newForReviewCard.title"
                    :description="myCasesHints.newForReviewCard.description"
                    :guide-target="myCasesHints.newForReviewCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ newReviewCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-user-plus" class="text-lg text-blue-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">24 Hour Approval</p>
                  <ProductGuideHint
                    :title="myCasesHints.approvalCard.title"
                    :description="myCasesHints.approvalCard.description"
                    :guide-target="myCasesHints.approvalCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">{{ approvalCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">Approved</p>
                  <ProductGuideHint
                    :title="myCasesHints.approvedCard.title"
                    :description="myCasesHints.approvedCard.description"
                    :guide-target="myCasesHints.approvedCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-green-500 dark:text-green-400 tabular-nums">{{ approvedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-green-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-3 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">Rejected</p>
                  <ProductGuideHint
                    :title="myCasesHints.rejectedCard.title"
                    :description="myCasesHints.rejectedCard.description"
                    :guide-target="myCasesHints.rejectedCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-red-500 dark:text-red-400 tabular-nums">{{ rejectedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="ap-fade-in ap-delay-4 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <!-- Filter Header -->
          <div class="flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="flex flex-wrap items-center gap-3 min-w-0">
              <UInput
                v-model="query"
                class="max-w-xs"
                icon="i-lucide-search"
                placeholder="Search customers..."
                size="sm"
              />
              <ProductGuideHint
                :title="myCasesHints.filters.title"
                :description="myCasesHints.filters.description"
                :guide-target="myCasesHints.filters.guideTarget"
              />

              <!-- Date Range (outside filter panel) -->
              <USelect
                v-if="selectedDateRange !== 'custom'"
                v-model="selectedDateRange"
                :items="DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-44"
              />

              <!-- Custom date range picker -->
              <UPopover
                v-if="selectedDateRange === 'custom'"
                v-model:open="calendarOpen"
                :content="{ align: 'start' }"
                :ui="{ content: 'bg-white/95 dark:bg-[#1a1a1a]/90 backdrop-blur-xl border-black/[0.06] dark:border-white/[0.1] shadow-2xl rounded-xl' }"
              >
                <UButton
                  size="sm"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-calendar"
                >
                  <span class="truncate text-xs">
                    <template v-if="calendarRange.start && calendarRange.end">
                      {{ calendarDf.format(calendarRange.start.toDate(getLocalTimeZone())) }} – {{ calendarDf.format(calendarRange.end.toDate(getLocalTimeZone())) }}
                    </template>
                    <template v-else>
                      Pick dates
                    </template>
                  </span>
                  <template #trailing>
                    <UIcon name="i-lucide-chevron-down" class="size-3.5 text-muted" />
                  </template>
                </UButton>

                <template #content>
                  <div class="flex items-stretch sm:divide-x divide-black/[0.06] dark:divide-white/[0.08]">
                    <div class="hidden sm:flex flex-col py-1.5">
                      <button
                        v-for="range in PRESET_RANGES"
                        :key="range.label"
                        class="px-4 py-1.5 text-left text-[11px] font-medium transition-colors whitespace-nowrap"
                        :class="isPresetSelected(range)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:text-highlighted'"
                        @click="selectPresetRange(range)"
                      >
                        {{ range.label }}
                      </button>
                      <button
                        class="mt-auto px-4 py-1.5 text-left text-[11px] font-medium text-muted hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:text-highlighted transition-colors border-t border-black/[0.06] dark:border-white/[0.08]"
                        @click="selectedDateRange = 'all'; calendarRange = { start: undefined, end: undefined }; calendarOpen = false"
                      >
                        Clear
                      </button>
                    </div>
                    <UCalendar
                      v-model="calendarRange"
                      class="p-2"
                      :number-of-months="2"
                      :max-value="calendarMaxDate"
                      range
                    />
                  </div>
                </template>
              </UPopover>
            </div>

            <div class="ml-auto flex flex-wrap items-center justify-end gap-2.5 text-right">
              <p
                aria-live="polite"
                class="text-sm font-medium text-muted tabular-nums"
              >
                {{ filteredLeads.length }} customers
              </p>
              <UButton
                :icon="showFilters ? 'i-lucide-filter-x' : 'i-lucide-filter'"
                size="xs"
                :color="activeFilterCount > 0 ? 'primary' : 'neutral'"
                :variant="showFilters ? 'soft' : 'outline'"
                @click="showFilters = !showFilters"
              >
                {{ showFilters ? 'Hide Filters' : 'Filters' }}
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
          </div>

          <!-- Collapsible Filter Panel (same 8 filters as Order Map) -->
          <div
            class="ap-collapse"
            :class="showFilters ? 'ap-collapse--open' : ''"
          >
            <div>
              <div class="border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] px-5 py-4">
              <div class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <!-- States -->
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">States</label>
                <USelect
                  v-model="filterStates"
                  :items="stateFilterOptions"
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
                  :items="filterLanguageOptions"
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
        </div>

        <!-- Kanban Board -->
        <div class="min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full gap-4">
            <div
              v-for="(stage, stageIdx) in STAGES"
              :key="stage.key"
              class="ap-fade-in flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm"
              :style="{ animationDelay: `${600 + stageIdx * 100}ms` }"
              @dragover.prevent
              @drop.prevent="onDropToStage(stage.key)"
            >
              <!-- Column Header -->
              <div
                class="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3"
                :class="stageHeaderBg(stage.key)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-lg"
                    :class="stageBgClass(stage.key)"
                  >
                    <UIcon
                      :name="stageIcon(stage.key)"
                      class="text-xs"
                      :class="stageIconClass(stage.key)"
                    />
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-semibold text-highlighted">{{ stage.label }}</span>
                    <ProductGuideHint
                      :title="getStageGuideHint(stage.key).title"
                      :description="getStageGuideHint(stage.key).description"
                      :guide-target="getStageGuideHint(stage.key).guideTarget"
                    />
                  </div>
                </div>
              </div>

              <!-- Column Cards -->
              <div class="flex-1 space-y-2 overflow-y-auto p-3 retainers-scroll">
                <div
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="retainer-card group cursor-pointer rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-3 transition-all duration-200"
                  :style="stageCardAccentStyle(stage.key)"
                  draggable="true"
                  @dragstart="onDragStartLead($event, lead)"
                  @dragend="onDragEndLead"
                  @click="openLead(lead)"
                >
                  <!-- Client Name & Initials -->
                  <div class="flex items-start gap-2.5">
                    <div class="retainer-card__initials flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition-all duration-200">
                      {{ getInitials(lead.clientName) }}
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)] transition-colors">{{ lead.clientName }}</div>
                      <div class="mt-0.5 text-[11px] text-muted">{{ formatPhone(lead.phone) }}</div>
                    </div>
                  </div>

                  <!-- Date & State -->
                  <div class="mt-2 flex items-center justify-between">
                    <div class="flex items-center gap-1.5 text-[11px] text-muted">
                      <UIcon name="i-lucide-calendar" class="size-3" />
                      <span>{{ lead.date }}</span>
                    </div>
                    <div v-if="lead.state !== '—'" class="flex items-center gap-1 text-[11px] text-muted">
                      <UIcon name="i-lucide-map-pin" class="size-3" />
                      <span class="font-medium">{{ lead.state }}</span>
                    </div>
                  </div>
                </div>

                <!-- Empty State -->
                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="flex items-center justify-center rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.08] px-3 py-8 text-center text-xs text-muted"
                >
                  No Customers
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.retainers-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.retainers-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.retainers-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.retainers-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
.retainer-card:hover {
  border-color: rgb(var(--ap-accent-rgb) / 0.24);
  background: rgb(var(--ap-accent-rgb) / 0.055);
  box-shadow: 0 6px 16px rgb(var(--ap-accent-rgb) / 0.08);
}
.retainer-card__initials {
  background: rgb(24 24 27 / 0.9);
  color: rgb(255 255 255 / 0.96);
  border: 1px solid rgb(15 23 42 / 0.1);
}
.retainer-card:hover .retainer-card__initials {
  background: linear-gradient(135deg, rgb(var(--ap-accent-rgb) / 0.2), rgb(var(--ap-accent-rgb) / 0.05));
  color: var(--ap-accent);
  border-color: rgb(var(--ap-accent-rgb) / 0.22);
}
</style>
