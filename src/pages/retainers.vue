<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type CustomerStageKey = 'new_customers_for_review' | '24_hour_approval' | 'customer_approved' | 'customer_rejected'

const STAGES: { key: CustomerStageKey, label: string }[] = [
  { key: 'new_customers_for_review', label: 'My Cases' },
  { key: '24_hour_approval', label: '24 Hour Approval' },
  { key: 'customer_approved', label: 'Customer Approved' },
  { key: 'customer_rejected', label: 'Customer Rejected' }
]

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

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const canSeeAssignments = computed(() => isSuperAdmin.value || isAdmin.value)

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | CustomerStageKey>('all')
const selectedState = ref('all')
const selectedDateRange = ref('all')
const customDate = ref('')

type DateRangeOption = { label: string; value: string }
const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Custom Date', value: 'custom' }
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
  const today = getStartOfDay(now)

  if (range === 'today') {
    return leadDate.getTime() === today.getTime()
  }
  if (range === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return leadDate.getTime() === yesterday.getTime()
  }
  if (range === 'this_week') {
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    return leadDate.getTime() >= weekStart.getTime() && leadDate.getTime() <= today.getTime()
  }
  if (range === 'custom' && customDate.value) {
    const target = getStartOfDay(new Date(customDate.value))
    return leadDate.getTime() === target.getTime()
  }
  return true
}

const filteredLeads = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value
  const stateFilter = selectedState.value

  return leads.value.filter((l) => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false
    if (stateFilter !== 'all' && l.state !== stateFilter) return false
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

const onDragStartLead = (lead: CustomerCard) => {
  dragLeadId.value = lead.id
  dragFromStage.value = lead.stage
}

const onDragEndLead = () => {
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
          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">New for Review</p>
                <p class="mt-1.5 text-3xl font-bold text-blue-400">{{ newReviewCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-user-plus" class="text-xl text-blue-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">24 Hour Approval</p>
                <p class="mt-1.5 text-3xl font-bold text-amber-400">{{ approvalCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="text-xl text-amber-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-green-500/30 hover:bg-green-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Approved</p>
                <p class="mt-1.5 text-3xl font-bold text-green-400">{{ approvedCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-xl text-green-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Rejected</p>
                <p class="mt-1.5 text-3xl font-bold text-red-400">{{ rejectedCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-xl text-red-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-xs"
              icon="i-lucide-search"
              placeholder="Search customers..."
            />

            <USelect
              v-model="selectedStage"
              :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
              class="w-52"
              value-key="value"
              label-key="label"
            />

            <USelect
              v-model="selectedState"
              :items="[{ label: 'All States', value: 'all' }, ...availableStates.map(s => ({ label: s, value: s }))]"
              class="w-40"
              value-key="value"
              label-key="label"
            />

            <USelect
              v-model="selectedDateRange"
              :items="DATE_RANGE_OPTIONS"
              class="w-44"
              value-key="value"
              label-key="label"
            />

            <input
              v-if="selectedDateRange === 'custom'"
              v-model="customDate"
              type="date"
              class="h-9 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-3 text-xs text-highlighted outline-none focus:border-[var(--ap-accent)]/40"
            />
          </div>

          <span class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-border)] px-3 py-1 text-xs font-semibold text-muted">
            {{ filteredLeads.length }} customers
          </span>
        </div>

        <!-- Kanban Board -->
        <div class="min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full gap-4">
            <div
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]"
              @dragover.prevent
              @drop.prevent="onDropToStage(stage.key)"
            >
              <!-- Column Header -->
              <div class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-4 py-3">
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
                <span class="inline-flex items-center rounded-md bg-[var(--ap-card-border)] px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {{ leadsByStage.get(stage.key)?.length ?? 0 }}
                </span>
              </div>

              <!-- Column Cards -->
              <div class="flex-1 space-y-2 overflow-y-auto p-3 retainers-scroll">
                <div
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="group cursor-pointer rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/[0.03]"
                  draggable="true"
                  @dragstart="onDragStartLead(lead)"
                  @dragend="onDragEndLead"
                  @click="openLead(lead)"
                >
                  <!-- Client Name & Initials -->
                  <div class="flex items-start gap-2.5">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-[10px] font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10">
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
                  class="flex items-center justify-center rounded-xl border border-dashed border-[var(--ap-card-border)] px-3 py-8 text-center text-xs text-muted"
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
</style>
