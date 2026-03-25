<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { useDragGhost } from '../composables/useDragGhost'
import { listOrdersForLawyer } from '../lib/orders'
import { supabase } from '../lib/supabase'

type StageKey = 'returned_back' | 'signed_retainers' | 'dropped_retainers' | 'successful_cases'

const STAGES: { key: StageKey, label: string }[] = [
  { key: 'signed_retainers', label: 'Signed Retainers' },
  { key: 'returned_back', label: 'Returned Back (14 days window)' },
  { key: 'dropped_retainers', label: 'Dropped Retainers (Unsuccessful cases)' },
  { key: 'successful_cases', label: 'Successful Cases' }
]

type FulfillmentOrder = {
  id: string
  date: string
  clientName: string
  phone: string
  state: string
  status: string
  stage: StageKey
  caseType: string
  reason?: string
  signedDate?: string
}

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')
const showFilters = ref(false)
const filterStates = ref<string[]>([])
const selectedOrderType = ref('all')
const leads = ref<FulfillmentOrder[]>([])

const dragLeadId = ref<string | null>(null)
const dragFromStage = ref<StageKey | null>(null)

const auth = useAuth()
const router = useRouter()

const totalOrdersCount = ref(0)

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()
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

const stageKeyToLabel = (key: StageKey) => {
  const found = STAGES.find(s => s.key === key)
  return found?.label ?? key
}

const getStatusText = (row: Record<string, unknown>) => {
  const raw = row.status ?? row.retainer_status ?? row.deal_status ?? row.lead_status ?? '—'
  const str = String(raw ?? '—')
  const normalized = normalize(str)
  const stageKey = STAGES.find(s => s.key === normalized)?.key
  if (stageKey) return stageKeyToLabel(stageKey)
  return str
}

const getSignedDate = (row: Record<string, unknown>) => {
  return row.signed_date ?? row.retainer_signed_date ?? row.retainer_signed_at ?? row.signed_at ?? null
}

const toStage = (row: Record<string, unknown>) => {
  const status = getStatusText(row)
  const s = normalize(status)
  const signedDate = getSignedDate(row)

  if (signedDate) return 'signed_retainers' as const
  if (s.includes('sign')) return 'signed_retainers' as const

  if (s.includes('successful') || s.includes('success') || s.includes('qualified') || s.includes('won')) return 'successful_cases' as const

  if (s.includes('drop') || s.includes('dropped') || s.includes('cancel')) return 'dropped_retainers' as const

  if (s.includes('return') || s.includes('back')) return 'returned_back' as const
  return 'returned_back' as const
}

const coerceFulfillmentOrder = (r: Record<string, unknown>): FulfillmentOrder | null => {
  const id = String(r.id ?? '').trim()
  if (!id) return null

  const status = getStatusText(r)
  const stage = toStage(r)

  return {
    id,
    date: String(r.date ?? (r.created_at ?? '')).slice(0, 10),
    clientName: String(r.insured_name ?? r.customer_full_name ?? '—'),
    phone: String(r.client_phone_number ?? r.phone_number ?? '—'),
    state: String(r.state ?? r.state_code ?? '—'),
    status,
    stage,
    caseType: '',
    reason: r.reason ? String(r.reason) : undefined,
    signedDate: getSignedDate(r) ? String(getSignedDate(r)).slice(0, 10) : undefined
  }
}

const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    if (!userId) {
      totalOrdersCount.value = 0
      leads.value = []
      return
    }

    const data = await listOrdersForLawyer({ lawyerId: userId })
    totalOrdersCount.value = data.length
    const orderIdsForScope = data.map(o => o.id)

    if (!orderIdsForScope.length) {
      leads.value = []
      return
    }

    const orderTypeById = new Map<string, string>(
      data.map(o => [o.id, normalizeCaseType(String(o.case_type ?? ''))])
    )

    const { data: fulfillmentRows, error: fulfillmentErr } = await supabase
      .from('order_fulfillments')
      .select('lead_id,order_id')
      .in('order_id', orderIdsForScope)
      .limit(1000)

    if (fulfillmentErr) throw fulfillmentErr

    const leadIdToCaseType = new Map<string, string>()
    const leadIds = (fulfillmentRows ?? [])
      .map((r) => {
        const row = r as { lead_id?: string | null, order_id?: string | null }
        const leadId = String(row.lead_id ?? '').trim()
        const orderId = String(row.order_id ?? '').trim()
        if (leadId && !leadIdToCaseType.has(leadId)) {
          leadIdToCaseType.set(leadId, orderTypeById.get(orderId) ?? '')
        }
        return leadId
      })
      .filter(Boolean)

    if (!leadIds.length) {
      leads.value = []
      return
    }

    const { data: leadsRows, error: leadsErr } = await supabase
      .from('leads')
      .select('id,submission_id')
      .in('id', leadIds)

    if (leadsErr) throw leadsErr

    const leadIdToSubmissionId = new Map<string, string>()
    const leadRows = (leadsRows ?? []) as Array<{ id?: string | null, submission_id?: string | null }>
    leadRows.forEach((r) => {
      const leadId = String(r.id ?? '').trim()
      const submissionId = String(r.submission_id ?? '').trim()
      if (!leadId || !submissionId) return
      leadIdToSubmissionId.set(leadId, submissionId)
    })

    const submissionIds = [...new Set([...leadIdToSubmissionId.values()].filter(Boolean))]
    if (!submissionIds.length) {
      leads.value = []
      return
    }

    const { data: ddfRows, error: ddfErr } = await supabase
      .from('daily_deal_flow')
      .select('*')
      .in('submission_id', submissionIds)

    if (ddfErr) throw ddfErr

    const ddf = (ddfRows ?? []) as Array<Record<string, unknown>>

    const mappedByKey = new Map<string, FulfillmentOrder>()
    ddf.forEach((row) => {
      const m = coerceFulfillmentOrder(row)
      if (!m) return
      const keys = [String(row.id ?? '').trim(), String(row.submission_id ?? '').trim()].filter(Boolean)
      keys.forEach((k) => {
        if (!mappedByKey.has(k)) mappedByKey.set(k, m)
      })
    })

    leads.value = leadIds
      .map((leadId) => {
        const mapped = mappedByKey.get(leadIdToSubmissionId.get(leadId) ?? '')
        if (!mapped) return null
        return {
          ...mapped,
          caseType: leadIdToCaseType.get(leadId) ?? ''
        }
      })
      .filter((x): x is FulfillmentOrder => Boolean(x))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {
  })
})

const availableStates = computed(() => {
  const states = new Set<string>()
  leads.value.forEach((lead) => {
    const state = String(lead.state ?? '').trim().toUpperCase()
    if (state && state !== '—') states.add(state)
  })
  return [...states].sort()
})

const stateFilterOptions = computed(() => [
  { label: 'All states', value: '__all__' },
  ...availableStates.value.map(state => ({ label: state, value: state }))
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

const orderTypeOptions = [
  { label: 'All Orders', value: 'all' },
  { label: 'Consumer Cases', value: 'Consumer Cases (MVA)' },
  { label: 'Commercial Cases', value: 'Commercial Cases' }
]

const activeFilterCount = computed(() => {
  let count = 0
  if (filterStates.value.filter(v => v !== '__all__').length > 0) count++
  if (selectedOrderType.value !== 'all') count++
  if (selectedStage.value !== 'all') count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || query.value.trim().length > 0)

const resetAllFilters = () => {
  query.value = ''
  filterStates.value = []
  selectedOrderType.value = 'all'
  selectedStage.value = 'all'
}

const filteredOrders = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value
  const activeStates = filterStates.value.filter(v => v !== '__all__')

  return leads.value.filter((l) => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false
    if (activeStates.length > 0 && !activeStates.includes(String(l.state ?? '').trim().toUpperCase())) return false
    if (selectedOrderType.value !== 'all' && normalizeCaseType(String(l.caseType ?? '')) !== selectedOrderType.value) return false
    if (!q) return true
    return [l.clientName, l.phone, l.id, l.status, l.state, l.caseType].some(v => String(v ?? '').toLowerCase().includes(q))
  })
})

const ordersByStage = computed(() => {
  const grouped = new Map<StageKey, FulfillmentOrder[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
  filteredOrders.value.forEach((o) => {
    const arr = grouped.get(o.stage) ?? []
    arr.push(o)
    grouped.set(o.stage, arr)
  })
  return grouped
})

const totalOrders = computed(() => totalOrdersCount.value)
const signedCount = computed(() => (ordersByStage.value.get('signed_retainers') ?? []).length)
const droppedCount = computed(() => (ordersByStage.value.get('dropped_retainers') ?? []).length)
const returnedCount = computed(() => (ordersByStage.value.get('returned_back') ?? []).length)
const successfulCount = computed(() => (ordersByStage.value.get('successful_cases') ?? []).length)

const stageHeaderBg = (key: StageKey) => {
  switch (key) {
    case 'signed_retainers':
      return 'bg-gradient-to-r from-blue-500/[0.10] via-blue-500/[0.04] to-transparent dark:from-blue-400/[0.14] dark:via-blue-400/[0.06] dark:to-transparent'
    case 'returned_back':
      return 'bg-gradient-to-r from-amber-500/[0.10] via-amber-500/[0.04] to-transparent dark:from-amber-400/[0.14] dark:via-amber-400/[0.06] dark:to-transparent'
    case 'dropped_retainers':
      return 'bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.04] to-transparent dark:from-red-400/[0.14] dark:via-red-400/[0.06] dark:to-transparent'
    case 'successful_cases':
      return 'bg-gradient-to-r from-emerald-500/[0.10] via-emerald-500/[0.04] to-transparent dark:from-emerald-400/[0.14] dark:via-emerald-400/[0.06] dark:to-transparent'
  }
}

const stageIconName = (key: StageKey) => {
  switch (key) {
    case 'signed_retainers':
      return 'i-lucide-check-circle'
    case 'returned_back':
      return 'i-lucide-arrow-left-circle'
    case 'dropped_retainers':
      return 'i-lucide-x-circle'
    case 'successful_cases':
      return 'i-lucide-trophy'
  }
}

const stageBgClass = (key: StageKey) => {
  switch (key) {
    case 'signed_retainers':
      return 'bg-blue-500/10'
    case 'returned_back':
      return 'bg-amber-500/10'
    case 'dropped_retainers':
      return 'bg-red-500/10'
    case 'successful_cases':
      return 'bg-emerald-500/10'
  }
}

const stageIconClass = (key: StageKey) => {
  switch (key) {
    case 'signed_retainers':
      return 'text-blue-400'
    case 'returned_back':
      return 'text-amber-400'
    case 'dropped_retainers':
      return 'text-red-400'
    case 'successful_cases':
      return 'text-emerald-400'
  }
}

const openLead = (lead: FulfillmentOrder) => {
  router.push(`/retainers/${lead.id}`)
}

const toast = useToast()

const { startDrag, endDrag } = useDragGhost()

const onDragStartLead = (e: DragEvent, lead: FulfillmentOrder) => {
  startDrag(e)
  dragLeadId.value = lead.id
  dragFromStage.value = lead.stage
}

const onDragEndLead = () => {
  endDrag()
  dragLeadId.value = null
  dragFromStage.value = null
}

const onDropToStage = async (targetStage: StageKey) => {
  const leadId = dragLeadId.value
  const fromStage = dragFromStage.value
  if (!leadId || !fromStage) return
  if (fromStage === targetStage) return

  const idx = leads.value.findIndex(l => l.id === leadId)
  if (idx < 0) return

  const prevStage = leads.value[idx].stage
  const prevStatus = leads.value[idx].status

  leads.value[idx] = {
    ...leads.value[idx],
    stage: targetStage,
    status: stageKeyToLabel(targetStage)
  }

  try {
    const { error } = await supabase
      .from('daily_deal_flow')
      .update({ status: targetStage })
      .eq('id', leadId)

    if (error) throw error
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
    onDragEndLead()
  }
}
</script>

<template>
  <UDashboardPanel id="fulfillment">
    <template #header>
      <UDashboardNavbar title="Fulfillment - Order Processing">
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
        <!-- ═══ Stat Cards ═══ -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="ap-fade-in group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-orange-500 dark:bg-orange-600" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-orange-500 dark:text-orange-600">Total Orders</p>
                <p class="mt-1 text-2xl font-bold text-orange-600 tabular-nums">{{ totalOrders }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 dark:bg-orange-600/15">
                <UIcon name="i-lucide-package" class="text-lg text-orange-500 dark:text-orange-600" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">Signed Retainers</p>
                <p class="mt-1 text-2xl font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ signedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-blue-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">Returned Back (14 days window)</p>
                <p class="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">{{ returnedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-arrow-left-circle" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-3 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">Dropped (Unsuccessful cases)</p>
                <p class="mt-1 text-2xl font-bold text-red-500 dark:text-red-400 tabular-nums">{{ droppedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-4 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Successful Cases</p>
                <p class="mt-1 text-2xl font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">{{ successfulCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <UIcon name="i-lucide-trophy" class="text-lg text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Filters ═══ -->
        <div class="ap-fade-in ap-delay-5 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <div class="flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="flex flex-wrap items-center gap-3 min-w-0">
              <UInput
                v-model="query"
                class="max-w-xs"
                icon="i-lucide-search"
                placeholder="Search leads..."
                size="sm"
              />
            </div>

            <div class="ml-auto flex flex-wrap items-center justify-end gap-2.5 text-right">
              <p
                aria-live="polite"
                class="text-sm font-medium text-muted tabular-nums"
              >
                {{ filteredOrders.length }} leads
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
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Orders</label>
                <USelect
                  v-model="selectedOrderType"
                  :items="orderTypeOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="All Orders"
                  size="xs"
                  class="w-full"
                />
              </div>

              <div>
                <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Stages</label>
                <USelect
                  v-model="selectedStage"
                  :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
                  value-key="value"
                  label-key="label"
                  placeholder="All stages"
                  size="xs"
                  class="w-full"
                />
              </div>
            </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Kanban Board ═══ -->
        <div class="min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full gap-4">
            <div
              v-for="(stage, stageIdx) in STAGES"
              :key="stage.key"
              class="ap-fade-in flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm"
              :style="{ animationDelay: `${500 + stageIdx * 100}ms` }"
              @dragover.prevent
              @drop.prevent="onDropToStage(stage.key)"
            >
              <div
                class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-4 py-3"
                :class="stageHeaderBg(stage.key)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-lg"
                    :class="stageBgClass(stage.key)"
                  >
                    <UIcon
                      :name="stageIconName(stage.key)"
                      class="text-xs"
                      :class="stageIconClass(stage.key)"
                    />
                  </div>
                  <span class="text-sm font-semibold text-highlighted">{{ stage.label }}</span>
                </div>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-3 fulfillment-scroll">
                <div
                  v-for="order in (ordersByStage.get(stage.key) ?? [])"
                  :key="order.id"
                  class="group cursor-pointer rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/[0.03] hover:shadow-sm"
                  draggable="true"
                  @dragstart="onDragStartLead($event, order)"
                  @dragend="onDragEndLead"
                  @click="openLead(order)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)] transition-colors">{{ order.clientName }}</div>
                      <div class="mt-0.5 text-[11px] text-muted">{{ order.phone }}</div>
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <span class="inline-flex items-center rounded-md border border-[var(--ap-card-border)] bg-[var(--ap-card-border)] px-2 py-0.5 text-[11px] font-medium text-default">
                      {{ order.state }}
                    </span>
                    <span class="text-[11px] text-muted">{{ order.date }}</span>
                  </div>

                  <div v-if="order.reason" class="mt-2 rounded-lg bg-[var(--ap-card-hover)] px-2.5 py-1.5 text-[11px] text-muted">
                    {{ order.reason }}
                  </div>

                  <div v-if="order.signedDate" class="mt-2 flex items-center gap-1 text-[11px] text-blue-400">
                    <UIcon name="i-lucide-check" class="size-3" />
                    <span>Signed: {{ order.signedDate }}</span>
                  </div>
                </div>

                <div
                  v-if="(ordersByStage.get(stage.key)?.length ?? 0) === 0"
                  class="flex items-center justify-center rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.08] px-3 py-8 text-center text-xs text-muted"
                >
                  No Retainers
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
.fulfillment-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.fulfillment-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.fulfillment-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.fulfillment-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
