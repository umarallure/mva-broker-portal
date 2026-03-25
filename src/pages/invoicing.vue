<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DateFormatter, getLocalTimeZone, CalendarDate, today } from '@internationalized/date'

import { useAuth } from '../composables/useAuth'
import { useDragGhost } from '../composables/useDragGhost'
import { deleteInvoice, listInvoices, markInvoiceAsPaid, requestChargeback, updateInvoice, type InvoiceRow, type InvoiceStatus } from '../lib/invoices'
import { supabase } from '../lib/supabase'

type ViewMode = 'kanban' | 'list'

type InvoiceListRow = InvoiceRow & {
  lawyer_name?: string | null
  vendor_name?: string | null
  lead_names?: string | null
}

type QualifiedDealRow = {
  id: string
  submission_id: string | null
  insured_name: string | null
  client_phone_number: string | null
  state: string | null
  lead_vendor: string | null
  payment_status: string | null
  assigned_attorney_id: string | null
  invoice_id: string | null
  publisher_invoice_id: string | null
  created_at: string | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const isAccounts = computed(() => auth.state.value.profile?.role === 'accounts')
const isAdminOrSuper = computed(() => isSuperAdmin.value || isAdmin.value || isAccounts.value)
const isPublisherMode = computed(() => route.path === '/invoicing/publisher')

const canFilterByAttorney = computed(() => !isPublisherMode.value && (isSuperAdmin.value || isAdmin.value))
const canFilterByVendor = computed(() => isPublisherMode.value && (isSuperAdmin.value || isAdmin.value))

const pageTitle = computed(() => isPublisherMode.value ? 'Publisher Invoicing' : 'Lawyer Invoicing')
const createRoute = computed(() => isPublisherMode.value ? '/invoicing/create?mode=publisher' : '/invoicing/create?mode=lawyer')

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const showFilters = ref(false)
const selectedStatus = ref<'all' | InvoiceStatus>('all')
const filterVendor = ref('')
const filterAttorney = ref('')
const filterState = ref<'all' | string>('all')
const filterDateStart = ref('')
const filterDueDate = ref<'all' | 'today' | 'yesterday' | 'this_week'>('all')
const selectedDateRange = ref('all')

const calendarDf = new DateFormatter('en-US', { dateStyle: 'medium' })
const calendarRange = ref<{ start: CalendarDate | undefined; end: CalendarDate | undefined }>({
  start: undefined,
  end: undefined
})
const calendarOpen = ref(false)
const calendarMaxDate = computed(() => today(getLocalTimeZone()))

// Drag & drop
const dragInvoiceId = ref<string | null>(null)

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<InvoiceRow | null>(null)
const deletingInvoice = ref(false)

const loadSeq = ref(0)

const invoices = ref<InvoiceListRow[]>([])

const qualifiedDeals = ref<QualifiedDealRow[]>([])
const qualifiedDealCenterIdMap = ref(new Map<string, string>())
const qualifiedDealVendorNameMap = ref(new Map<string, string>())
const qualifiedDealLawyerNameMap = ref(new Map<string, string>())

const dealStateMap = ref(new Map<string, string>())

const normalizeState = (v: unknown) => {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s) return ''
  return s.length > 2 ? s.slice(0, 2) : s
}

const formatDateInput = (value: Date) => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getStartOfDay = (value: Date) => {
  const start = new Date(value)
  start.setHours(0, 0, 0, 0)
  return start
}

const setDateStartFromRange = (range: { start?: CalendarDate; end?: CalendarDate }) => {
  if (range.start) {
    filterDateStart.value = formatDateInput(range.start.toDate(getLocalTimeZone()))
    return
  }
  filterDateStart.value = ''
}

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

const getDealState = (d: { state?: string | null }) => {
  return normalizeState(d.state ?? '')
}

const stateOptions = computed(() => {
  if (isPublisherMode.value) return []

  const states = new Set<string>()
  qualifiedDeals.value.forEach((d) => {
    const s = getDealState(d)
    if (s) states.add(s)
  })

  invoices.value.forEach((inv) => {
    const ids = (inv.deal_ids ?? []).map(String)
    ids.forEach((id) => {
      const s = normalizeState(dealStateMap.value.get(id) ?? '')
      if (s) states.add(s)
    })
  })

  return ['all', ...Array.from(states).sort((a, b) => a.localeCompare(b))]
})

const stateSelectItems = computed(() =>
  stateOptions.value.map((s) => ({
    label: s === 'all' ? 'All States' : s,
    value: s
  }))
)

const attorneyOptions = computed(() => {
  const names = invoices.value
    .map((i) => i.lawyer_name)
    .filter((n): n is string => Boolean(n && String(n).trim()))
    .map((n) => String(n).trim())

  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
})

const vendorOptions = computed(() => {
  const names = invoices.value
    .map((i) => i.vendor_name)
    .filter((n): n is string => Boolean(n && String(n).trim()))
    .map((n) => String(n).trim())

  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
})

const statusFilterItems = computed(() =>
  isPublisherMode.value
    ? [
        { label: 'All Statuses', value: 'all' },
        { label: 'Billable – Awaiting to be Paid', value: 'pending' },
        { label: 'In Review', value: 'in_review' },
        { label: 'Paid', value: 'paid' },
        { label: 'Chargeback', value: 'chargeback' }
      ]
    : [
        { label: 'All Statuses', value: 'all' },
        { label: 'Billable (Approved)', value: 'pending' },
        { label: 'Pending', value: 'in_review' },
        { label: 'Paid (Successful Invoice)', value: 'paid' },
        { label: 'Chargeback (14 Days Period)', value: 'chargeback' }
      ]
)

const dueDateItems = [
  { label: 'All Due Dates', value: 'all' },
  { label: 'Due Today', value: 'today' },
  { label: 'Due Yesterday', value: 'yesterday' },
  { label: 'Due This Week', value: 'this_week' }
]

const activeFilterCount = computed(() => {
  let count = 0

  if (selectedStatus.value !== 'all') count++
  if (!isPublisherMode.value && filterState.value !== 'all') count++
  if (filterDueDate.value !== 'all') count++
  if (canFilterByVendor.value && filterVendor.value.trim()) count++
  if (canFilterByAttorney.value && filterAttorney.value.trim()) count++

  return count
})

const hasActiveFilters = computed(() =>
  activeFilterCount.value > 0
  || selectedDateRange.value !== 'all'
  || query.value.trim().length > 0
)

const resetAllFilters = () => {
  query.value = ''
  selectedStatus.value = 'all'
  filterVendor.value = ''
  filterAttorney.value = ''
  filterState.value = 'all'
  filterDueDate.value = 'all'
  selectedDateRange.value = 'all'
  filterDateStart.value = ''
  calendarRange.value = { start: undefined, end: undefined }
  calendarOpen.value = false
  showFilters.value = false
}

const matchesCreatedDateFilter = (rawDate: string | null): boolean => {
  const range = selectedDateRange.value
  if (range === 'all') return true
  if (!rawDate) return false

  const recordDate = getStartOfDay(new Date(rawDate))
  const todayDate = getStartOfDay(new Date())

  if (range === 'today') {
    return recordDate.getTime() === todayDate.getTime()
  }
  if (range === 'yesterday') {
    const yesterdayDate = new Date(todayDate)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    return recordDate.getTime() === yesterdayDate.getTime()
  }
  if (range === 'last_week') {
    const weekAgo = new Date(todayDate)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return recordDate.getTime() >= weekAgo.getTime() && recordDate.getTime() <= todayDate.getTime()
  }
  if (range === 'last_month') {
    const monthAgo = new Date(todayDate)
    monthAgo.setDate(monthAgo.getDate() - 30)
    return recordDate.getTime() >= monthAgo.getTime() && recordDate.getTime() <= todayDate.getTime()
  }
  if (range === 'last_3_months') {
    const threeMonthsAgo = new Date(todayDate)
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90)
    return recordDate.getTime() >= threeMonthsAgo.getTime() && recordDate.getTime() <= todayDate.getTime()
  }
  if (range === 'custom') {
    const cr = calendarRange.value
    if (cr.start && cr.end) {
      const from = getStartOfDay(cr.start.toDate(getLocalTimeZone()))
      const to = getStartOfDay(cr.end.toDate(getLocalTimeZone()))
      return recordDate.getTime() >= from.getTime() && recordDate.getTime() <= to.getTime()
    }
    if (cr.start) {
      const from = getStartOfDay(cr.start.toDate(getLocalTimeZone()))
      return recordDate.getTime() >= from.getTime()
    }
  }
  return true
}

const filteredInvoices = computed(() => {
  const q = query.value.trim().toLowerCase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  return invoices.value.filter((inv) => {
    const ds = getDisplayStatus(inv)
    if (selectedStatus.value !== 'all' && ds !== selectedStatus.value) return false

    if (!isPublisherMode.value && filterState.value !== 'all') {
      const want = normalizeState(filterState.value)
      const dealIds = (inv.deal_ids ?? []).map(String)
      const has = dealIds.some((id) => normalizeState(dealStateMap.value.get(id) ?? '') === want)
      if (!has) return false
    }

    if (filterVendor.value && isPublisherMode.value) {
      const vendorQ = filterVendor.value.trim().toLowerCase()
      const vn = (inv.vendor_name ?? '').toLowerCase()
      const vid = (inv.lead_vendor_id ?? '').toLowerCase()
      if (!vn.includes(vendorQ) && !vid.includes(vendorQ)) return false
    }

    if (filterAttorney.value && !isPublisherMode.value) {
      const an = (inv.lawyer_name ?? '').toLowerCase()
      if (!an.includes(filterAttorney.value.toLowerCase())) return false
    }

    if (!matchesCreatedDateFilter(inv.created_at ?? null)) return false

    if (filterDueDate.value !== 'all' && inv.due_date) {
      const dd = inv.due_date.slice(0, 10)
      if (filterDueDate.value === 'today' && dd !== todayStr) return false
      if (filterDueDate.value === 'yesterday' && dd !== yesterdayStr) return false
      if (filterDueDate.value === 'this_week' && dd < weekStartStr) return false
    }

    if (!q) return true
    const itemDescriptions = (inv.items ?? []).map((i) => i.description ?? '').join(' ')
    const haystack = [
      inv.invoice_number,
      inv.lawyer_name ?? '',
      inv.vendor_name ?? '',
      inv.lead_names ?? '',
      itemDescriptions,
      inv.notes ?? ''
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const filteredQualifiedDeals = computed(() => {
  if (viewMode.value !== 'kanban') return []
  if (selectedStatus.value !== 'all' && selectedStatus.value !== 'pending') return []

  const q = query.value.trim().toLowerCase()
  const vendorQ = filterVendor.value.trim().toLowerCase()
  const attorneyQ = filterAttorney.value.trim().toLowerCase()

  return qualifiedDeals.value.filter((d) => {
    if (!matchesCreatedDateFilter(d.created_at ?? null)) return false

    if (!isPublisherMode.value && filterState.value !== 'all') {
      const want = normalizeState(filterState.value)
      const s = getDealState(d)
      if (s !== want) return false
    }

    if (isPublisherMode.value && vendorQ) {
      const vn = String(d.lead_vendor ?? '').toLowerCase()
      if (!vn.includes(vendorQ)) return false
    }

    if (!isPublisherMode.value && attorneyQ) {
      const attorneyName = String(qualifiedDealLawyerNameMap.value.get(String(d.assigned_attorney_id ?? '')) ?? '').toLowerCase()
      if (!attorneyName.includes(attorneyQ)) return false
    }

    if (!q) return true
    const haystack = [
      d.submission_id ?? '',
      d.insured_name ?? '',
      d.lead_vendor ?? ''
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredInvoices.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredInvoices.value.slice(start, start + PAGE_SIZE)
})

const PUBLISHER_KANBAN_STATUSES: InvoiceStatus[] = ['pending', 'in_review', 'paid', 'chargeback']
const LAWYER_KANBAN_STATUSES: InvoiceStatus[] = ['pending', 'in_review', 'paid', 'chargeback']

const kanbanStatuses = computed(() =>
  isPublisherMode.value ? PUBLISHER_KANBAN_STATUSES : LAWYER_KANBAN_STATUSES
)

const getDisplayStatus = (invoice: InvoiceRow): InvoiceStatus => {
  if (isPublisherMode.value && invoice.status === 'billable') return 'pending'
  if (!isPublisherMode.value && invoice.status === 'signed_awaiting') return 'in_review'
  return invoice.status
}

const invoicesByStatus = computed(() => {
  const grouped = new Map<InvoiceStatus, typeof invoices.value>()
  kanbanStatuses.value.forEach((s) => grouped.set(s, []))
  filteredInvoices.value.forEach((inv) => {
    const arr = grouped.get(getDisplayStatus(inv))
    if (arr) arr.push(inv)
  })
  return grouped
})

const totalAmount = computed(() => invoices.value.reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const billableAmount = computed(() => invoices.value
  .filter(inv => getDisplayStatus(inv) === 'pending')
  .reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const reviewAmount = computed(() => invoices.value
  .filter(inv => getDisplayStatus(inv) === 'in_review')
  .reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const paidAmount = computed(() => invoices.value
  .filter(inv => getDisplayStatus(inv) === 'paid')
  .reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const chargebackAmount = computed(() => invoices.value.filter(inv => inv.status === 'chargeback').reduce((sum, inv) => sum + Number(inv.total_amount), 0))

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n}`
  }
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

const getInitials = (value: string | null | undefined) => {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return 'NA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const getStatusLabel = (status: InvoiceStatus) => {
  if (status === 'billable') return isPublisherMode.value ? 'Billable' : 'Billable (Approved)'
  if (status === 'pending') return isPublisherMode.value ? 'Billable – Awaiting to be Paid' : 'Billable (Approved)'
  if (status === 'in_review') return isPublisherMode.value ? 'In Review' : 'Pending'
  if (status === 'signed_awaiting') return 'Signed – Awaiting to be Paid'
  if (status === 'in_preview') return 'In Preview'
  if (status === 'paid') return isPublisherMode.value ? 'Paid' : 'Paid (Successful Invoice)'
  return isPublisherMode.value ? 'Chargeback' : 'Chargeback (14 Days Period)'
}

const getSummaryCardLabel = (status: InvoiceStatus) => {
  if (!isPublisherMode.value) {
    if (status === 'pending') return 'Billable'
    if (status === 'paid') return 'Paid'
    if (status === 'chargeback') return 'Chargeback'
  }

  return getStatusLabel(status)
}

const getEmptyStateText = (status: InvoiceStatus) => {
  if (status === 'in_review') return 'No pending invoices.'
  if (status === 'paid') return 'No paid invoices.'
  if (status === 'chargeback') return 'No chargeback invoices.'
  return 'No invoices.'
}

const getStatusIcon = (status: InvoiceStatus) => {
  if (status === 'billable') return 'i-lucide-file-plus'
  if (status === 'pending') return isPublisherMode.value ? 'i-lucide-clock' : 'i-lucide-file-check'
  if (status === 'in_review') return isPublisherMode.value ? 'i-lucide-eye' : 'i-lucide-clock'
  if (status === 'signed_awaiting') return 'i-lucide-pen-line'
  if (status === 'in_preview') return 'i-lucide-search'
  if (status === 'paid') return 'i-lucide-check-circle'
  return 'i-lucide-alert-triangle'
}

const getStatusColorClass = (status: InvoiceStatus) => {
  if (status === 'billable') return 'text-blue-400'
  if (status === 'pending') return 'text-blue-400'
  if (status === 'in_review') return 'text-amber-400'
  if (status === 'signed_awaiting') return 'text-emerald-400'
  if (status === 'in_preview') return 'text-sky-400'
  if (status === 'paid') return 'text-green-400'
  return 'text-red-400'
}

const getKanbanHeaderBg = (status: InvoiceStatus) => {
  switch (status) {
    case 'billable':
    case 'pending':
      return 'bg-gradient-to-r from-blue-500/[0.10] via-blue-500/[0.04] to-transparent dark:from-blue-400/[0.14] dark:via-blue-400/[0.06] dark:to-transparent'
    case 'in_review':
      return 'bg-gradient-to-r from-amber-500/[0.10] via-amber-500/[0.04] to-transparent dark:from-amber-400/[0.14] dark:via-amber-400/[0.06] dark:to-transparent'
    case 'paid':
      return 'bg-gradient-to-r from-green-500/[0.10] via-green-500/[0.04] to-transparent dark:from-green-400/[0.14] dark:via-green-400/[0.06] dark:to-transparent'
    case 'chargeback':
      return 'bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.04] to-transparent dark:from-red-400/[0.14] dark:via-red-400/[0.06] dark:to-transparent'
    default:
      return ''
  }
}

const getKanbanIconBgClass = (status: InvoiceStatus) => {
  switch (status) {
    case 'billable':
    case 'pending':
      return 'bg-blue-500/10'
    case 'in_review':
      return 'bg-amber-500/10'
    case 'paid':
      return 'bg-green-500/10'
    case 'chargeback':
      return 'bg-red-500/10'
    default:
      return 'bg-black/[0.04] dark:bg-white/[0.06]'
  }
}

const getKanbanAccentStyle = (status: InvoiceStatus) => {
  switch (status) {
    case 'billable':
    case 'pending':
      return { '--ap-accent': '#60a5fa', '--ap-accent-rgb': '96 165 250' }
    case 'in_review':
      return { '--ap-accent': '#fbbf24', '--ap-accent-rgb': '251 191 36' }
    case 'paid':
      return { '--ap-accent': '#4ade80', '--ap-accent-rgb': '74 222 128' }
    case 'chargeback':
      return { '--ap-accent': '#f87171', '--ap-accent-rgb': '248 113 113' }
    default:
      return { '--ap-accent': '#94a3b8', '--ap-accent-rgb': '148 163 184' }
  }
}

const { startDrag, endDrag } = useDragGhost()

const handleDragStart = (e: DragEvent, invoiceId: string) => {
  startDrag(e)
  dragInvoiceId.value = invoiceId
}

const handleDragEnd = () => {
  endDrag()
  dragInvoiceId.value = null
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
}

const handleDrop = async (e: DragEvent, targetStatus: InvoiceStatus) => {
  e.preventDefault()
  if (!dragInvoiceId.value) return

  const id = dragInvoiceId.value
  dragInvoiceId.value = null

  const idx = invoices.value.findIndex(i => i.id === id)
  if (idx === -1) return
  const invoice = invoices.value[idx]
  const prev = invoice.status
  if (prev === targetStatus) return

  // Optimistic update
  invoices.value[idx] = { ...invoices.value[idx], status: targetStatus }

  try {
    await updateInvoice(id, { status: targetStatus })

    // Update payment_status of linked deals based on invoice status
    if (invoice.deal_ids?.length) {
      const dealUpdates: { payment_status?: string } = {}
      
      if (targetStatus === 'in_review') {
        dealUpdates.payment_status = invoice.invoice_type === 'lawyer' 
          ? 'attorney_payment_in_review' 
          : 'publisher_payment_in_review'
      } else if (targetStatus === 'paid') {
        dealUpdates.payment_status = invoice.invoice_type === 'lawyer'
          ? 'paid_by_attorney'
          : undefined // Publisher paid is handled by status field
        
        // For publisher invoices, also update status to paid_to_bpo
        if (invoice.invoice_type === 'publisher') {
          await supabase
            .from('daily_deal_flow')
            .update({ status: 'paid_to_bpo' })
            .in('id', invoice.deal_ids)
        }
      } else if (targetStatus === 'chargeback') {
        dealUpdates.payment_status = invoice.invoice_type === 'lawyer'
          ? 'attorney_chargeback'
          : 'publisher_chargeback'
      }

      if (dealUpdates.payment_status) {
        await supabase
          .from('daily_deal_flow')
          .update(dealUpdates)
          .in('id', invoice.deal_ids)
      }
    }
  } catch (err) {
    // Revert on error
    invoices.value[idx] = { ...invoices.value[idx], status: prev }
    error.value = err instanceof Error ? err.message : 'Failed to update status'
  }
}

const load = async () => {
  const seq = ++loadSeq.value
  const modeAtStart = isPublisherMode.value
  loading.value = true
  error.value = null

  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    const role = auth.state.value.profile?.role ?? null

    const filters: { lawyer_id?: string; status?: InvoiceStatus; invoice_type?: 'lawyer' | 'publisher' } = {}

    if (isPublisherMode.value) {
      filters.invoice_type = 'publisher'
    } else {
      filters.invoice_type = 'lawyer'
      if (role === 'lawyer' && userId) {
        filters.lawyer_id = userId
      }
    }

    if (selectedStatus.value !== 'all') {
      // In lawyer mode, we show any legacy `signed_awaiting` invoices under `in_review`.
      // So for `in_review`, don't apply a strict server-side filter.
      if (!(selectedStatus.value === 'in_review' && !isPublisherMode.value)) {
        filters.status = selectedStatus.value
      }
    }

    const data = (await listInvoices(filters)) as InvoiceListRow[]

    // Load Qualified/Payable leads for the Billable (pending) column
    let dealsQb = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,state,lead_vendor,payment_status,assigned_attorney_id,invoice_id,publisher_invoice_id,created_at')
      .order('created_at', { ascending: false })

    if (filterDateStart.value) {
      dealsQb = dealsQb.gte('created_at', filterDateStart.value)
    }

    if (!isPublisherMode.value) {
      // Lawyer mode: show only un-invoiced leads
      dealsQb = dealsQb
        .is('invoice_id', null)
        .in('status', [
          'qualified_payable',
        ])
      if (role === 'lawyer' && userId) {
        dealsQb = dealsQb.eq('assigned_attorney_id', userId)
      }
    } else {
      dealsQb = dealsQb
        .is('publisher_invoice_id', null)
        .eq('payment_status', 'paid_by_attorney')
    }

    const { data: dealData, error: dealErr } = await dealsQb
    if (dealErr) throw new Error(dealErr.message)

    const dealRows = (dealData ?? []) as unknown as QualifiedDealRow[]

    const vendorNames = [...new Set(dealRows.map((d) => String(d.lead_vendor ?? '').trim()).filter(Boolean))]
    if (vendorNames.length) {
      const { data: centers } = await supabase
        .from('centers')
        .select('id,lead_vendor,center_name')
        .in('lead_vendor', vendorNames)

      const centerRows = (centers ?? []) as unknown as Array<{ id: string; lead_vendor: string | null; center_name: string | null }>
      qualifiedDealCenterIdMap.value = new Map(
        centerRows
          .filter((c) => Boolean(c.lead_vendor))
          .map((c) => [String(c.lead_vendor), String(c.id)])
      )

      qualifiedDealVendorNameMap.value = new Map(
        centerRows
          .filter((c) => Boolean(c.lead_vendor))
          .map((c) => [String(c.lead_vendor), String(c.center_name ?? c.lead_vendor ?? '').trim()])
      )
    } else {
      qualifiedDealCenterIdMap.value = new Map()
      qualifiedDealVendorNameMap.value = new Map()
    }

    if (!isPublisherMode.value) {
      const lawyerIds = [...new Set(dealRows.map((d) => d.assigned_attorney_id).filter(Boolean))] as string[]
      if (lawyerIds.length) {
        const { data: profiles } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', lawyerIds)

        const profileRows = (profiles ?? []) as unknown as Array<{ user_id: string; full_name: string | null }>
        const nameMap = new Map(profileRows.map((p) => [String(p.user_id), String(p.full_name ?? '').trim()]))

        const { data: appUsers } = await supabase
          .from('app_users')
          .select('user_id,display_name,email')
          .in('user_id', lawyerIds)

        const userRows = (appUsers ?? []) as unknown as Array<{ user_id: string; display_name: string | null; email: string | null }>
        const fallbackMap = new Map(
          userRows.map((u) => [String(u.user_id), String(u.display_name || u.email || '').trim()])
        )

        qualifiedDealLawyerNameMap.value = new Map(
          lawyerIds.map((id) => [
            String(id),
            nameMap.get(id) || fallbackMap.get(id) || ''
          ])
        )
      } else {
        qualifiedDealLawyerNameMap.value = new Map()
      }
    } else {
      qualifiedDealLawyerNameMap.value = new Map()
    }

    qualifiedDeals.value = dealRows

    // Enrich invoices with lead/insured names (from daily_deal_flow) for search
    const allDealIds = [...new Set(data.flatMap((inv) => inv.deal_ids ?? []).filter(Boolean))]

    if (allDealIds.length) {
      const { data: deals, error: dealsError } = await supabase
        .from('daily_deal_flow')
        .select('id,insured_name,state')
        .in('id', allDealIds)

      if (dealsError) throw new Error(dealsError.message)

      const dealRows = (deals ?? []) as unknown as Array<{ id: string; insured_name: string | null; state: string | null }>
      const nameMap = new Map(dealRows.map((r) => [String(r.id), String(r.insured_name ?? '').trim()]))
      dealStateMap.value = new Map(dealRows.map((r) => [String(r.id), getDealState(r)]))

      data.forEach((inv) => {
        const dealIds = (inv.deal_ids ?? []).map(String)
        const names = dealIds
          .map((id: string) => nameMap.get(id) ?? '')
          .map((s: string) => s.trim())
          .filter(Boolean)

        inv.lead_names = [...new Set(names)].join(' · ')
      })
    } else {
      dealStateMap.value = new Map()
    }

    if (isPublisherMode.value) {
      // Resolve vendor (center) names via lead_vendor_id
      const vendorIds = [...new Set(data.map(d => d.lead_vendor_id).filter(Boolean))] as string[]
      if (vendorIds.length) {
        const { data: centers } = await supabase
          .from('centers')
          .select('id,center_name,lead_vendor')
          .in('id', vendorIds)

        const centerRows = (centers ?? []) as unknown as Array<{ id: string; center_name: string | null; lead_vendor: string | null }>
        const vendorMap = new Map(
          centerRows.map((c) => [String(c.id), String(c.center_name ?? c.lead_vendor ?? '').trim()])
        )

        data.forEach((inv) => {
          inv.vendor_name = inv.lead_vendor_id !== null
            ? (vendorMap.get(inv.lead_vendor_id) ?? null)
            : null
        })
      }
    } else if (role === 'super_admin' || role === 'admin' || role === 'accounts') {
      // Fetch lawyer names for admin view
      const lawyerIds = [...new Set(data.map(d => d.lawyer_id).filter(Boolean))] as string[]
      if (lawyerIds.length) {
        const { data: profiles } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', lawyerIds)

        const profileRows = (profiles ?? []) as unknown as Array<{ user_id: string; full_name: string | null }>
        const nameMap = new Map(profileRows.map((p) => [String(p.user_id), String(p.full_name ?? '').trim()]))

        const { data: appUsers } = await supabase
          .from('app_users')
          .select('user_id,display_name,email')
          .in('user_id', lawyerIds)

        const userRows = (appUsers ?? []) as unknown as Array<{ user_id: string; display_name: string | null; email: string | null }>
        const fallbackMap = new Map(
          userRows.map((u) => [String(u.user_id), String(u.display_name || u.email || '').trim()])
        )

        data.forEach((inv) => {
          if (inv.lawyer_id === null) {
            inv.lawyer_name = null
            return
          }
          inv.lawyer_name = nameMap.get(inv.lawyer_id) || fallbackMap.get(inv.lawyer_id) || null
        })
      }
    }

    // Ignore stale loads when route mode changes quickly (prevents brief UI flash)
    if (seq === loadSeq.value && modeAtStart === isPublisherMode.value) {
      invoices.value = data
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load invoices'
    error.value = msg
  } finally {
    if (seq === loadSeq.value) {
      loading.value = false
    }
  }
}

watch(isPublisherMode, () => {
  // Reset mode-specific UI state to avoid showing the wrong mode briefly
  invoices.value = []
  qualifiedDeals.value = []
  qualifiedDealCenterIdMap.value = new Map()
  qualifiedDealVendorNameMap.value = new Map()
  qualifiedDealLawyerNameMap.value = new Map()
  page.value = 1
  showFilters.value = false
  query.value = ''
  selectedStatus.value = 'all'
  filterVendor.value = ''
  filterAttorney.value = ''
  filterState.value = 'all'
  filterDateStart.value = ''
  filterDueDate.value = 'all'
  selectedDateRange.value = 'all'
  calendarRange.value = { start: undefined, end: undefined }
  load()
})

watch(selectedDateRange, (range) => {
  if (range === 'custom') return

  calendarOpen.value = false
  calendarRange.value = { start: undefined, end: undefined }

  const end = new Date()
  end.setHours(0, 0, 0, 0)
  let start: Date | null = null

  if (range === 'today') {
    start = new Date(end)
  } else if (range === 'yesterday') {
    start = new Date(end)
    start.setDate(start.getDate() - 1)
  } else if (range === 'last_week') {
    start = new Date(end)
    start.setDate(start.getDate() - 7)
  } else if (range === 'last_month') {
    start = new Date(end)
    start.setDate(start.getDate() - 30)
  } else if (range === 'last_3_months') {
    start = new Date(end)
    start.setDate(start.getDate() - 90)
  }

  filterDateStart.value = start ? formatDateInput(start) : ''
})

watch(calendarRange, (range) => {
  if (range.start && range.end) {
    selectedDateRange.value = 'custom'
  }
  setDateStartFromRange(range)
}, { deep: true })

const openQualifiedDeal = (deal: QualifiedDealRow) => {
  if (isPublisherMode.value) {
    const centerId = deal.lead_vendor ? (qualifiedDealCenterIdMap.value.get(deal.lead_vendor) ?? null) : null
    const qs = new URLSearchParams({ mode: 'publisher', deal_id: deal.id, quick: '1' })
    if (centerId) qs.set('center_id', centerId)
    router.push(`/invoicing/create?${qs.toString()}`)
    return
  }

  const lawyerId = deal.assigned_attorney_id ?? ''
  const qs = new URLSearchParams({ mode: 'lawyer', deal_id: deal.id, quick: '1' })
  if (lawyerId) qs.set('lawyer_id', lawyerId)
  router.push(`/invoicing/create?${qs.toString()}`)
}

function openLeadDetails(deal: QualifiedDealRow) {
  const from = route.fullPath
  router.push(`/retainers/${deal.id}?from=${encodeURIComponent(from)}`)
}

const openInvoicePdf = (invoice: InvoiceRow) => {
  const url = router.resolve(`/invoicing/${invoice.id}/pdf`).href
  window.open(url, '_blank')
}

const requestDeleteInvoice = (invoice: InvoiceRow) => {
  deleteTarget.value = invoice
  deleteConfirmOpen.value = true
}

const confirmDeleteInvoice = async () => {
  if (!deleteTarget.value) return
  deletingInvoice.value = true
  error.value = null

  try {
    const invoiceId = deleteTarget.value.id

    const { error: dfErr1 } = await supabase
      .from('daily_deal_flow')
      .update({ invoice_id: null })
      .eq('invoice_id', invoiceId)
    if (dfErr1) throw new Error(dfErr1.message)

    const { error: dfErr2 } = await supabase
      .from('daily_deal_flow')
      .update({ publisher_invoice_id: null })
      .eq('publisher_invoice_id', invoiceId)
    if (dfErr2) throw new Error(dfErr2.message)

    await deleteInvoice(invoiceId)

    deleteConfirmOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete invoice'
  } finally {
    deletingInvoice.value = false
  }
}

const editInvoice = (invoice: InvoiceRow) => {
  const mode = isPublisherMode.value ? 'publisher' : 'lawyer'
  router.push(`/invoicing/edit/${invoice.id}?mode=${mode}`)
}

const handleMarkAsPaid = async (invoice: InvoiceRow & { lawyer_name?: string | null }) => {
  try {
    const updated = await markInvoiceAsPaid(invoice.id)
    const idx = invoices.value.findIndex(i => i.id === invoice.id)
    if (idx !== -1) {
      invoices.value[idx] = { ...invoices.value[idx], ...updated }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to mark as paid'
  }
}

const handleRequestChargeback = async (invoice: InvoiceRow & { lawyer_name?: string | null }) => {
  try {
    const updated = await requestChargeback(invoice.id)
    const idx = invoices.value.findIndex(i => i.id === invoice.id)
    if (idx !== -1) {
      invoices.value[idx] = { ...invoices.value[idx], ...updated }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to request chargeback'
  }
}

const createInvoice = () => {
  router.push(createRoute.value)
}

onMounted(() => {
  load()
})

watch([selectedStatus], () => {
  page.value = 1
  load()
})

watch([query, filterVendor, filterAttorney, filterDateStart, filterDueDate, selectedDateRange], () => {
  page.value = 1
})

watch([filterState], () => {
  page.value = 1
})

watch(calendarRange, () => {
  page.value = 1
}, { deep: true })

watch(canFilterByVendor, (allowed) => {
  if (!allowed && filterVendor.value) filterVendor.value = ''
})

watch(pageCount, () => {
  if (page.value > pageCount.value) page.value = pageCount.value
})
</script>

<template>
  <UDashboardPanel id="invoicing">
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="isAdminOrSuper"
              color="primary"
              icon="i-lucide-plus"
              size="sm"
              class="rounded-lg"
              @click="createInvoice"
            >
              {{ isPublisherMode ? 'Create Publisher Invoice' : 'Create Invoice' }}
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="load"
            >
              Refresh
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-5">
        <!-- Stats Cards -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div class="ap-fade-in group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-orange-500 dark:bg-orange-600" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-orange-500 dark:text-orange-600">Total Invoiced</p>
                <p class="mt-1 text-2xl font-bold text-highlighted tabular-nums">{{ formatMoney(totalAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 dark:bg-orange-600/15">
                <UIcon name="i-lucide-receipt" class="text-lg text-orange-500 dark:text-orange-600" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">{{ getSummaryCardLabel('pending') }}</p>
                <p class="mt-1 text-2xl font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ formatMoney(billableAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-file-check" class="text-lg text-blue-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">{{ getSummaryCardLabel('in_review') }}</p>
                <p class="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">{{ formatMoney(reviewAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-3 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-green-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-green-500 dark:text-green-400">{{ getSummaryCardLabel('paid') }}</p>
                <p class="mt-1 text-2xl font-bold text-green-500 dark:text-green-400 tabular-nums">{{ formatMoney(paidAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-green-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-4 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">{{ getSummaryCardLabel('chargeback') }}</p>
                <p class="mt-1 text-2xl font-bold text-red-500 dark:text-red-400 tabular-nums">{{ formatMoney(chargebackAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-alert-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="ap-fade-in ap-delay-5 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <div class="flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="flex flex-1 flex-wrap items-center gap-3 min-w-0">
              <UInput
                v-model="query"
                class="max-w-xs"
                icon="i-lucide-search"
                size="sm"
                placeholder="Search invoices..."
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
                {{ invoices.length }} total
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
              <div class="inline-flex rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-0.5">
                <button
                  v-for="mode in (['kanban', 'list'] as ViewMode[])"
                  :key="mode"
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                  :class="viewMode === mode
                    ? 'bg-[var(--ap-accent)] text-white shadow-sm'
                    : 'text-muted hover:text-highlighted hover:bg-[var(--ap-card-divide)]'"
                  @click="viewMode = mode"
                >
                  {{ mode === 'kanban' ? 'Board' : 'List' }}
                </button>
              </div>
            </div>
          </div>

          <div
            class="ap-collapse"
            :class="showFilters ? 'ap-collapse--open' : ''"
          >
            <div>
              <div class="border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] px-5 py-4">
            <div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Statuses</label>
                <USelect
                  v-model="selectedStatus"
                  :items="statusFilterItems"
                  value-key="value"
                  label-key="label"
                  size="xs"
                  class="w-full"
                />
              </div>

              <div v-if="!isPublisherMode">
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">States</label>
                <USelect
                  v-model="filterState"
                  :items="stateSelectItems"
                  value-key="value"
                  label-key="label"
                  size="xs"
                  class="w-full"
                />
              </div>

              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Due Dates</label>
                <USelect
                  v-model="filterDueDate"
                  :items="dueDateItems"
                  value-key="value"
                  label-key="label"
                  size="xs"
                  class="w-full"
                />
              </div>

              <div v-if="canFilterByVendor">
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Vendors</label>
                <UInputMenu
                  v-model="filterVendor"
                  :items="vendorOptions"
                  create-item
                  size="xs"
                  class="w-full"
                  placeholder="All vendors"
                />
              </div>

              <div v-if="canFilterByAttorney">
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Attorneys</label>
                <UInputMenu
                  v-model="filterAttorney"
                  :items="attorneyOptions"
                  create-item
                  size="xs"
                  class="w-full"
                  placeholder="All attorneys"
                />
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Alert -->
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Unable to load invoices"
          :description="error"
          class="rounded-xl"
        />

        <UModal v-model:open="deleteConfirmOpen" title="Delete invoice" :dismissible="false">
          <template #body>
            <div class="space-y-4">
              <p class="text-sm text-white/80">
                This will permanently delete this invoice.
              </p>

              <UAlert
                v-if="deleteTarget"
                color="warning"
                variant="subtle"
                title="You are deleting"
                :description="deleteTarget.invoice_number"
              />

              <div class="flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="deletingInvoice"
                  @click="deleteConfirmOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  :loading="deletingInvoice"
                  @click="confirmDeleteInvoice"
                >
                  Delete invoice
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- Loading -->
        <div v-if="loading && !invoices.length" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
            <span class="text-sm text-muted">Loading invoices...</span>
          </div>
        </div>

        <!-- Empty State (List view only) -->
        <div v-else-if="!loading && viewMode === 'list' && !invoices.length" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-receipt" class="text-3xl text-[var(--ap-accent)]/60" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">No invoices yet</p>
              <p class="mt-1 text-xs text-muted">
                {{ isAdminOrSuper ? 'Create your first invoice to get started' : 'No invoices have been created for you yet' }}
              </p>
            </div>
            <UButton
              v-if="isAdminOrSuper"
              color="primary"
              icon="i-lucide-plus"
              @click="createInvoice"
            >
              {{ isPublisherMode ? 'Create Publisher Invoice' : 'Create Invoice' }}
            </UButton>
          </div>
        </div>

        <!-- Kanban View -->
        <div v-else-if="viewMode === 'kanban'" class="min-h-0 flex-1 overflow-hidden">
          <div class="ap-fade-in ap-delay-5 flex h-full gap-4 pb-1 ap-overflow-defer">
            <div
              v-for="(status, statusIdx) in kanbanStatuses"
              :key="status"
              class="ap-fade-in flex min-w-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-colors"
              :class="dragInvoiceId ? 'border-dashed' : ''"
              :style="{ ...getKanbanAccentStyle(status), animationDelay: `${500 + statusIdx * 100}ms` }"
              @dragover="handleDragOver"
              @drop="status === 'pending' ? undefined : handleDrop($event, status)"
            >
              <div
                class="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3"
                :class="getKanbanHeaderBg(status)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-lg"
                    :class="getKanbanIconBgClass(status)"
                  >
                    <UIcon :name="getStatusIcon(status)" class="text-xs" :class="getStatusColorClass(status)" />
                  </div>
                  <span class="text-sm font-semibold text-highlighted">{{ getStatusLabel(status) }}</span>
                </div>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-3 invoicing-scroll">
                <!-- Qualified deal cards (Billable column only) -->
                <div
                  v-for="deal in (status === 'pending' ? filteredQualifiedDeals : [])"
                  :key="`deal-${deal.id}`"
                  class="invoicing-card group flex min-h-[148px] cursor-pointer flex-col rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-black/[0.025] dark:bg-white/[0.04] p-3.5 transition-all duration-200"
                  @click="openLeadDetails(deal)"
                >
                  <!-- Row 1: Name + Badge -->
                  <div class="flex items-center justify-between gap-2">
                    <div class="truncate text-sm font-semibold text-highlighted transition-colors group-hover:text-[var(--ap-accent)]">
                      {{ deal.insured_name || '—' }}
                    </div>
                    <span class="shrink-0 inline-flex items-center rounded-md border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--ap-accent)]">
                      Ready
                    </span>
                  </div>

                  <!-- Row 2: Contact + assignment details -->
                  <div class="mt-2.5 space-y-1.5">
                    <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <div v-if="deal.client_phone_number" class="flex items-center gap-1.5 text-[11px] text-muted">
                      <UIcon name="i-lucide-phone" class="size-3 shrink-0 opacity-50" />
                      <span class="truncate">{{ deal.client_phone_number }}</span>
                    </div>
                    <div v-if="deal.state" class="flex items-center gap-1.5 text-[11px] text-muted">
                      <UIcon name="i-lucide-map-pin" class="size-3 shrink-0 opacity-50" />
                      <span class="font-medium">{{ deal.state }}</span>
                    </div>
                    <div v-if="deal.created_at" class="flex items-center gap-1.5 text-[11px] text-muted">
                      <UIcon name="i-lucide-calendar" class="size-3 shrink-0 opacity-50" />
                      <span>{{ formatDate(deal.created_at) }}</span>
                    </div>
                    <div v-if="!isPublisherMode" class="flex items-center gap-1.5 text-[11px] text-muted">
                      <UIcon name="i-lucide-building" class="size-3 shrink-0 opacity-50" />
                      <span class="truncate">{{ deal.lead_vendor || '—' }}</span>
                    </div>
                    <div v-if="isAdminOrSuper && isPublisherMode" class="flex items-center gap-1.5 text-[11px] text-muted col-span-2">
                      <UIcon name="i-lucide-building" class="size-3 shrink-0 opacity-50" />
                      <span class="truncate">{{ qualifiedDealVendorNameMap.get(String(deal.lead_vendor ?? '')) ?? deal.lead_vendor ?? '—' }}</span>
                    </div>
                    </div>
                    <div v-if="!isPublisherMode" class="truncate text-[11px] text-muted">
                      Attorney: {{ qualifiedDealLawyerNameMap.get(String(deal.assigned_attorney_id ?? '')) || 'Unassigned' }}
                    </div>
                  </div>

                  <!-- Row 3: Action (pushed to bottom right) -->
                  <div class="mt-auto flex justify-end pt-2.5">
                    <button
                      class="rounded-md border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--ap-accent)] opacity-0 transition-all hover:bg-[var(--ap-accent)]/20 group-hover:opacity-100"
                      title="Create Invoice"
                      @click.stop="openQualifiedDeal(deal)"
                    >
                      + Create Invoice
                    </button>
                  </div>
                </div>

                <!-- Invoice cards (all columns) -->
                <div
                  v-for="invoice in (invoicesByStatus.get(status) ?? [])"
                  :key="invoice.id"
                  draggable="true"
                  class="invoicing-card group flex min-h-[148px] cursor-pointer flex-col rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-black/[0.025] dark:bg-white/[0.04] p-3.5 transition-all duration-200"
                  :class="dragInvoiceId === invoice.id ? 'scale-95 opacity-50' : ''"
                  @dragstart="handleDragStart($event, invoice.id)"
                  @dragend="handleDragEnd"
                  @click="openInvoicePdf(invoice)"
                >
                  <!-- Row 1: Icon + Invoice # + Amount -->
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="invoicing-card__icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all duration-200">
                        <UIcon name="i-lucide-receipt" class="text-[10px]" />
                      </div>
                      <div class="truncate text-sm font-semibold text-highlighted transition-colors group-hover:text-[var(--ap-accent)]">
                        {{ invoice.invoice_number }}
                      </div>
                    </div>
                    <div class="shrink-0 text-sm font-bold text-highlighted tabular-nums">
                      {{ formatMoney(Number(invoice.total_amount)) }}
                    </div>
                  </div>

                  <!-- Row 2: Vendor/Lawyer + Lead names + Quick actions -->
                  <div class="mt-2 flex items-start justify-between gap-2">
                    <div class="min-w-0 space-y-0.5">
                      <div v-if="isAdminOrSuper" class="truncate text-[11px] text-muted">
                        {{ isPublisherMode ? invoice.vendor_name : invoice.lawyer_name }}
                      </div>
                      <div v-if="invoice.lead_names" class="truncate text-[11px] text-muted">
                        {{ invoice.lead_names }}
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                      <button
                        v-if="getDisplayStatus(invoice) === 'in_review'"
                        class="rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400 opacity-0 transition-all hover:bg-green-500/20 group-hover:opacity-100"
                        title="Mark as Paid"
                        @click.stop="handleMarkAsPaid(invoice)"
                      >
                        Mark as Paid
                      </button>
                      <button
                        v-if="getDisplayStatus(invoice) === 'paid'"
                        class="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 opacity-0 transition-all hover:bg-red-500/20 group-hover:opacity-100"
                        title="Initiate Chargeback"
                        @click.stop="handleRequestChargeback(invoice)"
                      >
                        Initiate Chargeback
                      </button>
                      <button
                        class="rounded-md p-1 text-muted opacity-0 transition-all hover:bg-black/[0.05] hover:text-highlighted group-hover:opacity-100 dark:hover:bg-white/[0.07]"
                        title="View PDF"
                        @click.stop="openInvoicePdf(invoice)"
                      >
                        <UIcon name="i-lucide-external-link" class="text-xs" />
                      </button>
                    </div>
                  </div>

                  <!-- Row 3: Meta details (pushed to bottom) -->
                  <div class="mt-auto space-y-1.5 pt-2.5">
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div v-if="invoice.due_date" class="flex items-center gap-1.5 text-[11px] text-muted">
                        <UIcon name="i-lucide-clock-3" class="size-3 shrink-0 opacity-50" />
                        <span>Due {{ formatDate(invoice.due_date) }}</span>
                      </div>
                      <div class="flex items-center gap-1.5 text-[11px] text-muted">
                        <UIcon name="i-lucide-calendar" class="size-3 shrink-0 opacity-50" />
                        <span class="truncate">{{ formatDate(invoice.date_range_start) }} – {{ formatDate(invoice.date_range_end) }}</span>
                      </div>
                      <div class="flex items-center gap-1.5 text-[10px] text-muted">
                        <UIcon name="i-lucide-layers" class="size-3 shrink-0 opacity-50" />
                        <span>{{ invoice.items?.length ?? 0 }} item{{ (invoice.items?.length ?? 0) === 1 ? '' : 's' }} · Created {{ formatDate(invoice.created_at) }}</span>
                      </div>
                    </div>

                    <!-- Actions row -->
                    <div class="flex items-center justify-end gap-1.5">
                      <button
                        v-if="isAdminOrSuper"
                        class="rounded-md p-1 text-muted opacity-0 transition-all hover:bg-black/[0.05] hover:text-highlighted group-hover:opacity-100 dark:hover:bg-white/[0.07]"
                        title="Edit invoice"
                        @click.stop="editInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-pencil" class="text-xs" />
                      </button>
                      <button
                        v-if="isSuperAdmin"
                        class="rounded-md p-1 text-muted opacity-0 transition-all hover:bg-black/[0.05] hover:text-red-300 group-hover:opacity-100 dark:hover:bg-white/[0.07]"
                        title="Delete invoice"
                        @click.stop="requestDeleteInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-trash" class="text-xs" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Empty state -->
                <div
                  v-if="(invoicesByStatus.get(status)?.length ?? 0) === 0 && !(status === 'pending' && filteredQualifiedDeals.length > 0)"
                  class="flex items-center justify-center rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.08] px-3 py-8 text-center text-xs text-muted"
                >
                  {{ getEmptyStateText(status) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- List View -->
        <div v-else class="ap-fade-in ap-delay-6 relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <div class="flex-1 min-h-0 overflow-y-auto invoicing-scroll">
            <table class="w-full">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#151515]/80 backdrop-blur-xl">
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Invoice #</th>
                  <th v-if="isAdminOrSuper" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">{{ isPublisherMode ? 'Vendor' : 'Lawyer' }}</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Date Range</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Amount</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Due Date</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Status</th>
                  <th class="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="invoice in pagedRows"
                  :key="invoice.id"
                  class="group cursor-pointer border-b border-black/[0.05] dark:border-white/[0.06] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.045]"
                  @click="openInvoicePdf(invoice)"
                >
                  <td class="px-5 py-3.5">
                    <span class="text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)]">
                      {{ invoice.invoice_number }}
                    </span>
                  </td>
                  <td v-if="isAdminOrSuper" class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ isPublisherMode ? (invoice.vendor_name ?? '—') : (invoice.lawyer_name ?? '—') }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ formatDate(invoice.date_range_start) }} - {{ formatDate(invoice.date_range_end) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm font-bold text-highlighted">{{ formatMoney(Number(invoice.total_amount)) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ formatDate(invoice.due_date) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span
                      class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
                      :class="{
                        'bg-blue-500/10 text-blue-400': getDisplayStatus(invoice) === 'billable' || getDisplayStatus(invoice) === 'pending',
                        'bg-amber-500/10 text-amber-400': getDisplayStatus(invoice) === 'in_review',
                        'bg-emerald-500/10 text-emerald-400': getDisplayStatus(invoice) === 'signed_awaiting',
                        'bg-sky-500/10 text-sky-400': getDisplayStatus(invoice) === 'in_preview',
                        'bg-green-500/10 text-green-400': getDisplayStatus(invoice) === 'paid',
                        'bg-red-500/10 text-red-400': getDisplayStatus(invoice) === 'chargeback'
                      }"
                    >
                      {{ getStatusLabel(getDisplayStatus(invoice)) }}
                    </span>
                  </td>
                  <td class="px-5 py-3.5">
                    <div class="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <button
                        v-if="getDisplayStatus(invoice) === 'in_review'"
                        class="inline-flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 transition-all hover:bg-green-500/20"
                        @click.stop="handleMarkAsPaid(invoice)"
                      >
                        <UIcon name="i-lucide-check-circle" class="text-xs" />
                        Mark Paid
                      </button>
                      <button
                        v-if="getDisplayStatus(invoice) === 'paid'"
                        class="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20"
                        @click.stop="handleRequestChargeback(invoice)"
                      >
                        <UIcon name="i-lucide-alert-triangle" class="text-xs" />
                        Chargeback
                      </button>
                      <button
                        v-if="isAdminOrSuper"
                        class="inline-flex items-center gap-1 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ap-accent)] transition-all hover:bg-[var(--ap-accent)]/20"
                        @click.stop="editInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-pencil" class="text-xs" />
                        Edit
                      </button>
                      <button
                        class="inline-flex items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-2.5 py-1 text-xs font-medium text-muted transition-all hover:bg-[var(--ap-card-border)] hover:text-highlighted"
                        @click.stop="openInvoicePdf(invoice)"
                      >
                        <UIcon name="i-lucide-file-text" class="text-xs" />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="flex items-center justify-between border-t border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#151515]/80 px-5 py-3 backdrop-blur-xl">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">
                Showing <span class="font-medium text-highlighted">{{ pagedRows.length }}</span> of <span class="font-medium text-highlighted">{{ filteredInvoices.length }}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-white/[0.04] px-3 text-xs font-medium text-default transition-all hover:bg-black/[0.035] dark:hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-30"
                :disabled="page <= 1"
                @click="page = Math.max(1, page - 1)"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
                Prev
              </button>

              <div class="flex h-8 items-center rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3">
                <span class="text-xs font-semibold text-[var(--ap-accent)]">{{ page }}</span>
                <span class="mx-1 text-xs text-muted">/</span>
                <span class="text-xs text-muted">{{ pageCount }}</span>
              </div>

              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-white/[0.04] px-3 text-xs font-medium text-default transition-all hover:bg-black/[0.035] dark:hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-30"
                :disabled="page >= pageCount"
                @click="page = Math.min(pageCount, page + 1)"
              >
                Next
                <UIcon name="i-lucide-chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.invoicing-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.invoicing-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.invoicing-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.invoicing-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
.invoicing-card:hover {
  border-color: rgb(var(--ap-accent-rgb) / 0.24);
  background: rgb(var(--ap-accent-rgb) / 0.055);
  box-shadow: 0 6px 16px rgb(var(--ap-accent-rgb) / 0.08);
}
.invoicing-card__icon {
  background: rgb(var(--ap-accent-rgb) / 0.08);
  color: var(--ap-accent);
  border: 1px solid rgb(var(--ap-accent-rgb) / 0.12);
}
.invoicing-card:hover .invoicing-card__icon {
  background: rgb(var(--ap-accent-rgb) / 0.15);
  border-color: rgb(var(--ap-accent-rgb) / 0.22);
}
</style>
