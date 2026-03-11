<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
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
const selectedStatus = ref<'all' | InvoiceStatus>('all')
const filterVendor = ref('')
const filterAttorney = ref('')
const filterState = ref<'all' | string>('all')
const filterDateStart = ref('')
const filterDueDate = ref<'all' | 'today' | 'yesterday' | 'this_week'>('all')

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

    if (filterDateStart.value) {
      const created = (inv.created_at ?? '').slice(0, 10)
      if (!created) return false
      if (created < filterDateStart.value) return false
    }

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
const paidAmount = computed(() => invoices.value.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const pendingAmount = computed(() => invoices.value.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + Number(inv.total_amount), 0))
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

const getStatusLabel = (status: InvoiceStatus) => {
  if (status === 'billable') return 'Billable'
  if (status === 'pending') return isPublisherMode.value ? 'Billable – Awaiting to be Paid' : 'Billable'
  if (status === 'in_review') return 'In Review'
  if (status === 'signed_awaiting') return 'Signed – Awaiting to be Paid'
  if (status === 'in_preview') return 'In Preview'
  if (status === 'paid') return 'Paid'
  return 'Chargeback'
}

const getStatusIcon = (status: InvoiceStatus) => {
  if (status === 'billable') return 'i-lucide-file-plus'
  if (status === 'pending') return 'i-lucide-clock'
  if (status === 'in_review') return 'i-lucide-eye'
  if (status === 'signed_awaiting') return 'i-lucide-pen-line'
  if (status === 'in_preview') return 'i-lucide-search'
  if (status === 'paid') return 'i-lucide-check-circle'
  return 'i-lucide-alert-triangle'
}

const getStatusColorClass = (status: InvoiceStatus) => {
  if (status === 'billable') return 'text-blue-400'
  if (status === 'pending') return 'text-amber-400'
  if (status === 'in_review') return 'text-violet-400'
  if (status === 'signed_awaiting') return 'text-emerald-400'
  if (status === 'in_preview') return 'text-sky-400'
  if (status === 'paid') return 'text-green-400'
  return 'text-red-400'
}

const handleDragStart = (invoiceId: string) => {
  dragInvoiceId.value = invoiceId
}

const handleDragEnd = () => {
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
  query.value = ''
  selectedStatus.value = 'all'
  filterVendor.value = ''
  filterAttorney.value = ''
  filterState.value = 'all'
  load()
})

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

watch([query, filterVendor, filterAttorney, filterDateStart, filterDueDate], () => {
  page.value = 1
})

watch([filterState], () => {
  page.value = 1
})

watch(canFilterByVendor, (allowed) => {
  if (!allowed && filterVendor.value) filterVendor.value = ''
})

watch(isPublisherMode, () => {
  page.value = 1
  load()
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
            <div class="hidden items-center gap-1.5 rounded-full border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3 py-1 sm:flex">
              <span class="h-1.5 w-1.5 rounded-full bg-[var(--ap-accent)] animate-pulse" />
              <span class="text-xs font-medium text-[var(--ap-accent)]">{{ invoices.length }} total</span>
            </div>

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
              variant="ghost"
              icon="i-lucide-refresh-cw"
              size="sm"
              :loading="loading"
              class="rounded-lg"
              @click="load"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-5">
        <!-- Stats Cards -->
        <div class="grid gap-4 sm:grid-cols-4">
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Total Invoiced</p>
                <p class="mt-1 text-2xl font-bold text-highlighted">{{ formatMoney(totalAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-receipt" class="text-lg text-[var(--ap-accent)]" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Paid</p>
                <p class="mt-1 text-2xl font-bold text-green-400">{{ formatMoney(paidAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-green-400" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Pending</p>
                <p class="mt-1 text-2xl font-bold text-amber-400">{{ formatMoney(pendingAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Chargeback</p>
                <p class="mt-1 text-2xl font-bold text-red-400">{{ formatMoney(chargebackAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-alert-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-1 flex-wrap items-center gap-2.5">
            <div class="relative max-w-xs flex-1">
              <UInput
                v-model="query"
                class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:pl-10 [&_input]:backdrop-blur-sm"
                icon="i-lucide-search"
                placeholder="Search invoices..."
              />
            </div>

            <USelect
              v-model="selectedStatus"
              :items="isPublisherMode
                ? [
                    { label: 'All Statuses', value: 'all' },
                    { label: 'Billable – Awaiting to be Paid', value: 'pending' },
                    { label: 'In Review', value: 'in_review' },
                    { label: 'Paid', value: 'paid' },
                    { label: 'Chargeback', value: 'chargeback' }
                  ]
                : [
                    { label: 'All Statuses', value: 'all' },
                    { label: 'Billable', value: 'pending' },
                    { label: 'In Review', value: 'in_review' },
                    { label: 'Paid', value: 'paid' },
                    { label: 'Chargeback', value: 'chargeback' }
                  ]"
              value-key="value"
              label-key="label"
              class="w-44 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
            />

            <UInputMenu
              v-if="canFilterByVendor"
              v-model="filterVendor"
              :items="vendorOptions"
              create-item
              class="w-44 [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
              placeholder="Filter by vendor..."
            />

            <UButton
              v-if="canFilterByVendor && filterVendor"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              class="rounded-xl"
              title="Clear vendor filter"
              @click="filterVendor = ''"
            />

            <UInputMenu
              v-if="canFilterByAttorney"
              v-model="filterAttorney"
              :items="attorneyOptions"
              create-item
              class="w-44 [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
              placeholder="Filter by attorney..."
            />

            <USelect
              v-if="!isPublisherMode"
              v-model="filterState"
              :items="stateSelectItems"
              class="w-44 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
              value-key="value"
              label-key="label"
            />

            <UButton
              v-if="!isPublisherMode && filterState !== 'all'"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              class="rounded-xl"
              title="Clear state filter"
              @click="filterState = 'all'"
            />

            <UInput
              v-model="filterDateStart"
              type="date"
              class="w-38 [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
              title="Created date start"
            />

            <USelect
              v-model="filterDueDate"
              :items="[
                { label: 'Due: Any', value: 'all' },
                { label: 'Due: Today', value: 'today' },
                { label: 'Due: Yesterday', value: 'yesterday' },
                { label: 'Due: This Week', value: 'this_week' }
              ]"
              class="w-44 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
              value-key="value"
              label-key="label"
            />
          </div>

          <div class="flex items-center gap-2.5">
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
          <div class="flex h-full gap-3 overflow-x-auto">
            <div
              v-for="status in kanbanStatuses"
              :key="status"
              class="flex min-w-[260px] flex-1 flex-col rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] transition-colors"
              :class="dragInvoiceId ? 'border-dashed' : ''"
              @dragover="handleDragOver"
              @drop="status === 'pending' ? undefined : handleDrop($event, status)"
            >
              <div class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon :name="getStatusIcon(status)" class="text-sm" :class="getStatusColorClass(status)" />
                  <span class="text-sm font-semibold text-highlighted">{{ getStatusLabel(status) }}</span>
                </div>
                <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ap-card-border)] px-1.5 text-[10px] font-bold text-muted">
                  {{ invoicesByStatus.get(status)?.length ?? 0 }}
                </span>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-2 invoicing-scroll">
                <div
                  v-for="deal in (status === 'pending' ? filteredQualifiedDeals : [])"
                  :key="`deal-${deal.id}`"
                  class="group cursor-pointer rounded-xl border border-dashed border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.04]"
                  @click="openLeadDetails(deal)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)]">
                        {{ deal.insured_name || '—' }}
                      </div>
                      <div v-if="isAdminOrSuper && isPublisherMode" class="mt-0.5 text-xs text-muted">
                        {{ qualifiedDealVendorNameMap.get(String(deal.lead_vendor ?? '')) ?? deal.lead_vendor ?? '—' }}
                      </div>
                      <div v-if="!isPublisherMode" class="mt-0.5 text-xs text-muted">
                        {{ deal.lead_vendor || '—' }}
                      </div>
                      <div v-if="!isPublisherMode" class="mt-0.5 text-xs text-muted">
                        Attorney: {{ qualifiedDealLawyerNameMap.get(String(deal.assigned_attorney_id ?? '')) || 'Unassigned' }}
                      </div>
                      <div v-if="deal.client_phone_number" class="mt-0.5 text-xs text-muted">
                        {{ deal.client_phone_number }}
                      </div>
                      <div v-if="deal.created_at" class="mt-0.5 text-xs text-muted">
                        {{ formatDate(deal.created_at) }}
                      </div>
                    </div>
                    <div class="shrink-0 text-[10px] font-semibold text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1">
                      Retainer
                    </div>
                  </div>

                  <div class="mt-2 flex justify-end">
                    <button
                      class="rounded-lg px-2 py-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 opacity-0 transition-all hover:bg-blue-500/20 group-hover:opacity-100"
                      title="Create Invoice"
                      @click.stop="openQualifiedDeal(deal)"
                    >
                      + Invoice
                    </button>
                  </div>
                </div>

                <div
                  v-for="invoice in (invoicesByStatus.get(status) ?? [])"
                  :key="invoice.id"
                  draggable="true"
                  class="group cursor-pointer rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.04]"
                  :class="dragInvoiceId === invoice.id ? 'opacity-50 scale-95' : ''"
                  @dragstart="handleDragStart(invoice.id)"
                  @dragend="handleDragEnd"
                  @click="openInvoicePdf(invoice)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)]">
                        {{ invoice.invoice_number }}
                      </div>
                      <div v-if="isAdminOrSuper" class="mt-0.5 text-xs text-muted">
                        {{ isPublisherMode ? invoice.vendor_name : invoice.lawyer_name }}
                      </div>
                    </div>
                    <div class="shrink-0 text-sm font-bold text-highlighted">
                      {{ formatMoney(Number(invoice.total_amount)) }}
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{{ formatDate(invoice.date_range_start) }} - {{ formatDate(invoice.date_range_end) }}</span>
                  </div>

                  <div class="mt-2 flex items-center justify-between">
                    <span v-if="invoice.due_date" class="text-xs text-muted">
                      Due: {{ formatDate(invoice.due_date) }}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button
                        v-if="getDisplayStatus(invoice) === 'in_review'"
                        class="rounded-lg px-2 py-1 text-[10px] font-semibold text-green-400 bg-green-500/10 opacity-0 transition-all hover:bg-green-500/20 group-hover:opacity-100"
                        title="Mark as Paid"
                        @click.stop="handleMarkAsPaid(invoice)"
                      >
                        Paid
                      </button>
                      <button
                        v-if="getDisplayStatus(invoice) === 'paid'"
                        class="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 opacity-0 transition-all hover:bg-red-500/20 group-hover:opacity-100"
                        title="Request Chargeback"
                        @click.stop="handleRequestChargeback(invoice)"
                      >
                        Chargeback
                      </button>
                      <button
                        v-if="isAdminOrSuper"
                        class="rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-[var(--ap-card-border)] hover:text-highlighted group-hover:opacity-100"
                        title="Edit invoice"
                        @click.stop="editInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-pencil" class="text-xs" />
                      </button>
                      <button
                        v-if="isSuperAdmin"
                        class="rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-[var(--ap-card-border)] hover:text-red-300 group-hover:opacity-100"
                        title="Delete invoice"
                        @click.stop="requestDeleteInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-trash" class="text-xs" />
                      </button>
                      <button
                        class="rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-[var(--ap-card-border)] hover:text-highlighted group-hover:opacity-100"
                        title="View PDF"
                        @click.stop="openInvoicePdf(invoice)"
                      >
                        <UIcon name="i-lucide-external-link" class="text-xs" />
                      </button>
                    </div>
                  </div>

                  <div class="mt-2 text-[10px] text-muted">
                    {{ invoice.items?.length ?? 0 }} item{{ (invoice.items?.length ?? 0) === 1 ? '' : 's' }}
                    · Created {{ formatDate(invoice.created_at) }}
                  </div>
                </div>

                <div
                  v-if="(invoicesByStatus.get(status)?.length ?? 0) === 0 && !(status === 'pending' && filteredQualifiedDeals.length > 0)"
                  class="rounded-xl border border-dashed border-[var(--ap-card-border)] px-3 py-8 text-center text-xs text-muted"
                >
                  No {{ getStatusLabel(status).toLowerCase() }} invoices
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- List View -->
        <div v-else class="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
          <div class="flex-1 min-h-0 overflow-y-auto invoicing-scroll">
            <table class="w-full">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] backdrop-blur-xl">
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
                  class="group cursor-pointer border-b border-[var(--ap-card-hover)] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
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
                        'bg-blue-500/10 text-blue-400': getDisplayStatus(invoice) === 'billable',
                        'bg-amber-500/10 text-amber-400': getDisplayStatus(invoice) === 'pending',
                        'bg-violet-500/10 text-violet-400': getDisplayStatus(invoice) === 'in_review',
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
          <div class="flex items-center justify-between border-t border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3 backdrop-blur-xl">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">
                Showing <span class="font-medium text-highlighted">{{ pagedRows.length }}</span> of <span class="font-medium text-highlighted">{{ filteredInvoices.length }}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
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
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
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
</style>
