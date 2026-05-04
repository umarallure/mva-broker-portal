<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { DateFormatter, getLocalTimeZone, CalendarDate, today } from '@internationalized/date'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { useDragGhost } from '../composables/useDragGhost'

type LeadStatus = 'attorney_review' | 'attorney_approved' | 'attorney_rejected'

type StageKey = 'review' | 'approved' | 'rejected'

const STAGES: { key: StageKey, label: string, status: LeadStatus }[] = [
  { key: 'review', label: 'My Cases', status: 'attorney_review' },
  { key: 'approved', label: 'Approved', status: 'attorney_approved' },
  { key: 'rejected', label: 'Rejected', status: 'attorney_rejected' }
]

const STATUS_TO_STAGE: Record<LeadStatus, StageKey> = {
  attorney_review: 'review',
  attorney_approved: 'approved',
  attorney_rejected: 'rejected'
}

type LeadCard = {
  id: string
  submissionId: string
  clientName: string
  phone: string
  date: string
  rawDate: string | null
  state: string
  status: LeadStatus
  stage: StageKey
  leadVendor: string
  assignedAttorneyId: string | null
  assignedAttorneyName: string
}

type LeadRow = {
  id: string
  submission_id: string
  customer_full_name: string | null
  phone_number: string | null
  lead_vendor: string | null
  state: string | null
  status: string | null
  submission_date: string | null
  created_at: string | null
  assigned_attorney_id: string | null
}

const auth = useAuth()
const toast = useToast()

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')
const selectedDateRange = ref('all')
const showFilters = ref(false)
const filterStates = ref<string[]>([])
const filterAttorneys = ref<string[]>([])

const calendarDf = new DateFormatter('en-US', { dateStyle: 'medium' })
const calendarRange = shallowRef<{ start: CalendarDate | undefined; end: CalendarDate | undefined }>({
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

watch(calendarRange, (val) => {
  if (val.start && val.end) {
    selectedDateRange.value = 'custom'
  }
}, { deep: true })

const DATE_RANGE_OPTIONS = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Last 3 Months', value: 'last_3_months' },
  { label: 'Custom Range', value: 'custom' }
]

const leads = ref<LeadCard[]>([])
const dragLeadId = ref<string | null>(null)
const dragFromStage = ref<StageKey | null>(null)

const isBrokerStatus = (s: string | null): s is LeadStatus =>
  s === 'attorney_review' || s === 'attorney_approved' || s === 'attorney_rejected'

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
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return phone
}

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const STATE_NAME_TO_CODE: Record<string, string> = {
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

const normalizeState = (v: string | null): string => {
  if (!v) return '—'
  const s = v.trim().toUpperCase()
  if (s.length === 2) return s
  return STATE_NAME_TO_CODE[s] ?? v.trim()
}

const coerceCard = (row: LeadRow, attorneyName: string): LeadCard | null => {
  if (!isBrokerStatus(row.status)) return null
  return {
    id: row.id,
    submissionId: row.submission_id,
    clientName: row.customer_full_name ?? 'Unknown Client',
    phone: row.phone_number ?? '—',
    date: formatDate(row.submission_date ?? row.created_at),
    rawDate: row.submission_date ?? row.created_at ?? null,
    state: normalizeState(row.state),
    status: row.status,
    stage: STATUS_TO_STAGE[row.status],
    leadVendor: row.lead_vendor ?? '—',
    assignedAttorneyId: row.assigned_attorney_id,
    assignedAttorneyName: attorneyName
  }
}

const load = async () => {
  loading.value = true

  try {
    await auth.init()
    const role = auth.state.value.profile?.role
    if (role !== 'broker' && role !== 'super_admin') {
      leads.value = []
      return
    }

    const { data, error } = await supabase
      .from('leads')
      .select('id,submission_id,customer_full_name,phone_number,lead_vendor,state,status,submission_date,created_at,assigned_attorney_id')
      .in('status', ['attorney_review', 'attorney_approved', 'attorney_rejected'])
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) throw error

    const rows = (data ?? []) as LeadRow[]
    const attorneyIds = [...new Set(
      rows.map(r => r.assigned_attorney_id).filter((id): id is string => Boolean(id))
    )]

    const attorneyNameById = new Map<string, string>()
    if (attorneyIds.length > 0) {
      const { data: attorneys } = await supabase
        .from('attorney_profiles')
        .select('user_id,full_name')
        .in('user_id', attorneyIds)

      for (const a of (attorneys ?? []) as Array<{ user_id: string | null, full_name: string | null }>) {
        const id = a.user_id
        const name = (a.full_name ?? '').trim()
        if (id && name) attorneyNameById.set(id, name)
      }
    }

    const cards: LeadCard[] = []
    for (const row of rows) {
      const name = row.assigned_attorney_id
        ? (attorneyNameById.get(row.assigned_attorney_id) ?? 'Unknown attorney')
        : '—'
      const card = coerceCard(row, name)
      if (card) cards.push(card)
    }
    leads.value = cards
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load cases'
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

const availableStates = computed(() => {
  const states = new Set<string>()
  leads.value.forEach(l => {
    if (l.state && l.state !== '—') states.add(l.state)
  })
  return [...states].sort()
})

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

const availableAttorneys = computed(() => {
  const seen = new Map<string, string>()
  for (const l of leads.value) {
    if (!l.assignedAttorneyId) continue
    if (!seen.has(l.assignedAttorneyId)) seen.set(l.assignedAttorneyId, l.assignedAttorneyName)
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const activeFilterCount = computed(() => {
  let count = 0
  if (filterStates.value.filter(v => v !== '__all__').length > 0) count++
  if (filterAttorneys.value.length > 0) count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || selectedDateRange.value !== 'all')

const resetAllFilters = () => {
  filterStates.value = []
  filterAttorneys.value = []
  selectedDateRange.value = 'all'
  calendarRange.value = { start: undefined, end: undefined }
  query.value = ''
}

const stageHeaderBg = (key: StageKey) => {
  switch (key) {
    case 'review': return 'bg-gradient-to-r from-blue-500/[0.10] via-blue-500/[0.04] to-transparent dark:from-blue-400/[0.14] dark:via-blue-400/[0.06] dark:to-transparent'
    case 'approved': return 'bg-gradient-to-r from-green-500/[0.10] via-green-500/[0.04] to-transparent dark:from-green-400/[0.14] dark:via-green-400/[0.06] dark:to-transparent'
    case 'rejected': return 'bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.04] to-transparent dark:from-red-400/[0.14] dark:via-red-400/[0.06] dark:to-transparent'
  }
}

const stageBgClass = (key: StageKey) => {
  switch (key) {
    case 'review': return 'bg-blue-500/10'
    case 'approved': return 'bg-green-500/10'
    case 'rejected': return 'bg-red-500/10'
  }
}

const stageIcon = (key: StageKey) => {
  switch (key) {
    case 'review': return 'i-lucide-user-plus'
    case 'approved': return 'i-lucide-check-circle'
    case 'rejected': return 'i-lucide-x-circle'
  }
}

const stageIconClass = (key: StageKey) => {
  switch (key) {
    case 'review': return 'text-blue-400'
    case 'approved': return 'text-green-400'
    case 'rejected': return 'text-red-400'
  }
}

const stageCardAccentStyle = (key: StageKey) => {
  switch (key) {
    case 'review':
      return { '--ap-accent': '#60a5fa', '--ap-accent-rgb': '96 165 250' }
    case 'approved':
      return { '--ap-accent': '#4ade80', '--ap-accent-rgb': '74 222 128' }
    case 'rejected':
      return { '--ap-accent': '#f87171', '--ap-accent-rgb': '248 113 113' }
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
  const todayDate = getStartOfDay(new Date())

  if (range === 'today') return leadDate.getTime() === todayDate.getTime()
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
    if (filterAttorneys.value.length > 0) {
      if (!l.assignedAttorneyId || !filterAttorneys.value.includes(l.assignedAttorneyId)) return false
    }
    if (!matchesDateFilter(l.rawDate)) return false
    if (!q) return true
    return [l.clientName, l.phone, l.submissionId, l.status, l.leadVendor, l.state, l.assignedAttorneyName]
      .some(v => String(v ?? '').toLowerCase().includes(q))
  })
})

const leadsByStage = computed(() => {
  const grouped = new Map<StageKey, LeadCard[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
  filteredLeads.value.forEach((l) => {
    const arr = grouped.get(l.stage) ?? []
    arr.push(l)
    grouped.set(l.stage, arr)
  })
  return grouped
})

const reviewCount = computed(() => (leadsByStage.value.get('review') ?? []).length)
const approvedCount = computed(() => (leadsByStage.value.get('approved') ?? []).length)
const rejectedCount = computed(() => (leadsByStage.value.get('rejected') ?? []).length)

const { startDrag, endDrag } = useDragGhost()

const onDragStartLead = (e: DragEvent, lead: LeadCard) => {
  startDrag(e)
  dragLeadId.value = lead.id
  dragFromStage.value = lead.stage
}

const onDragEndLead = () => {
  endDrag()
  dragLeadId.value = null
  dragFromStage.value = null
}

const moveConfirmOpen = ref(false)
const moveConfirmBusy = ref(false)
const pendingMoveLeadId = ref<string | null>(null)
const pendingMoveFromStage = ref<StageKey | null>(null)
const pendingMoveToStage = ref<StageKey | null>(null)

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

const onDropToStage = (targetStage: StageKey) => {
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

  const targetStatus = STAGES.find(s => s.key === targetStage)?.status
  if (!targetStatus) return

  moveConfirmBusy.value = true
  const prev = leads.value[idx]

  leads.value[idx] = { ...prev, stage: targetStage, status: targetStatus }

  try {
    const { error } = await supabase
      .from('leads')
      .update({ status: targetStatus })
      .eq('id', leadId)

    if (error) throw error

    const toLabel = STAGES.find(s => s.key === targetStage)?.label ?? targetStage
    toast.add({
      title: 'Updated',
      description: `Moved to ${toLabel}.`,
      icon: 'i-lucide-check-circle',
      color: 'success'
    })

    moveConfirmOpen.value = false
    pendingMoveLeadId.value = null
    pendingMoveFromStage.value = null
    pendingMoveToStage.value = null
  } catch (err) {
    leads.value[idx] = prev
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
</script>

<template>
  <UDashboardPanel id="my-cases">
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
        <UModal
          :open="moveConfirmOpen"
          title="Move Case"
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
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div class="ap-fade-in group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">New for Review</p>
                <p class="mt-1 text-2xl font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ reviewCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-user-plus" class="text-lg text-blue-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">Approved</p>
                <p class="mt-1 text-2xl font-bold text-green-500 dark:text-green-400 tabular-nums">{{ approvedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-green-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">Rejected</p>
                <p class="mt-1 text-2xl font-bold text-red-500 dark:text-red-400 tabular-nums">{{ rejectedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="ap-fade-in ap-delay-3 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <div class="flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="flex flex-wrap items-center gap-3 min-w-0">
              <UInput
                v-model="query"
                class="max-w-xs"
                icon="i-lucide-search"
                placeholder="Search cases..."
                size="sm"
              />

              <USelect
                v-if="selectedDateRange !== 'custom'"
                v-model="selectedDateRange"
                :items="DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-44"
              />

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
                {{ filteredLeads.length }} cases
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

          <div
            class="ap-collapse"
            :class="showFilters ? 'ap-collapse--open' : ''"
          >
            <div>
              <div class="border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] px-5 py-4">
                <div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
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

                  <div>
                    <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Lawyer</label>
                    <USelect
                      v-model="filterAttorneys"
                      :items="availableAttorneys"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All lawyers"
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
                  <span class="text-sm font-semibold text-highlighted">{{ stage.label }}</span>
                </div>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-3 cases-scroll">
                <div
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="case-card group cursor-grab rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-3 transition-all duration-200 active:cursor-grabbing"
                  :style="stageCardAccentStyle(stage.key)"
                  draggable="true"
                  @dragstart="onDragStartLead($event, lead)"
                  @dragend="onDragEndLead"
                >
                  <div class="flex items-start gap-2.5">
                    <div class="case-card__initials flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition-all duration-200">
                      {{ getInitials(lead.clientName) }}
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)] transition-colors">{{ lead.clientName }}</div>
                      <div class="mt-0.5 text-[11px] text-muted">{{ formatPhone(lead.phone) }}</div>
                    </div>
                  </div>

                  <div
                    v-if="lead.assignedAttorneyName && lead.assignedAttorneyName !== '—'"
                    class="mt-2 flex items-center gap-1.5 text-[11px] text-muted"
                  >
                    <UIcon name="i-lucide-scale" class="size-3 shrink-0" />
                    <span class="truncate">{{ lead.assignedAttorneyName }}</span>
                  </div>

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

                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="flex items-center justify-center rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.08] px-3 py-8 text-center text-xs text-muted"
                >
                  No Cases
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
.cases-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.cases-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.cases-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.cases-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
.case-card:hover {
  border-color: rgb(var(--ap-accent-rgb) / 0.24);
  background: rgb(var(--ap-accent-rgb) / 0.055);
  box-shadow: 0 6px 16px rgb(var(--ap-accent-rgb) / 0.08);
}
.case-card__initials {
  background: rgb(24 24 27 / 0.9);
  color: rgb(255 255 255 / 0.96);
  border: 1px solid rgb(15 23 42 / 0.1);
}
.case-card:hover .case-card__initials {
  background: linear-gradient(135deg, rgb(var(--ap-accent-rgb) / 0.2), rgb(var(--ap-accent-rgb) / 0.05));
  color: var(--ap-accent);
  border-color: rgb(var(--ap-accent-rgb) / 0.22);
}
</style>
