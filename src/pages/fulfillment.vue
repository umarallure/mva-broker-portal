<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { listOrdersForLawyer, type OrderRow } from '../lib/orders'
import { supabase } from '../lib/supabase'

type StageKey = 'returned_back' | 'signed_retainers' | 'dropped_retainers' | 'successful_cases'

const STAGES: { key: StageKey, label: string }[] = [
  { key: 'returned_back', label: 'Returned Back' },
  { key: 'signed_retainers', label: 'Signed Retainers' },
  { key: 'dropped_retainers', label: 'Dropped Retainers' },
  { key: 'successful_cases', label: 'Successfull Cases' }
]

type FulfillmentOrder = {
  id: string
  date: string
  clientName: string
  phone: string
  state: string
  status: string
  stage: StageKey
  reason?: string
  signedDate?: string
}

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')

const selectedOrderId = ref<string | undefined>(undefined)
const ALL_ORDERS_VALUE = '__ALL__'
const orders = ref<OrderRow[]>([])
const leads = ref<FulfillmentOrder[]>([])

const dragLeadId = ref<string | null>(null)
const dragFromStage = ref<StageKey | null>(null)

const auth = useAuth()
const router = useRouter()

const totalOrdersCount = ref(0)

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()

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
      orders.value = []
      selectedOrderId.value = undefined
      leads.value = []
      return
    }

    const data = await listOrdersForLawyer({ lawyerId: userId })
    orders.value = data
    totalOrdersCount.value = data.length

    if (!selectedOrderId.value && data.length) {
      selectedOrderId.value = ALL_ORDERS_VALUE
    }

    const selected = selectedOrderId.value
    if (!selected) {
      leads.value = []
      return
    }

    const orderIdsForScope = selected === ALL_ORDERS_VALUE
      ? data.map(o => o.id)
      : [selected]

    if (!orderIdsForScope.length) {
      leads.value = []
      return
    }

    const { data: fulfillmentRows, error: fulfillmentErr } = await supabase
      .from('order_fulfillments')
      .select('lead_id')
      .in('order_id', orderIdsForScope)
      .limit(1000)

    if (fulfillmentErr) throw fulfillmentErr

    const leadIds = (fulfillmentRows ?? [])
      .map(r => String((r as { lead_id?: string | null }).lead_id ?? '').trim())
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
      .map((leadId) => mappedByKey.get(leadIdToSubmissionId.get(leadId) ?? ''))
      .filter((x): x is FulfillmentOrder => Boolean(x))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {
  })
})

watch(selectedOrderId, (next, prev) => {
  if (next === prev) return
  load().catch(() => {
  })
})

const filteredOrders = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value

  return leads.value.filter((l) => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false
    if (!q) return true
    return [l.clientName, l.phone, l.id, l.status, l.state].some(v => String(v ?? '').toLowerCase().includes(q))
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

const orderOptions = computed(() => {
  return [
    { label: 'All Orders', value: ALL_ORDERS_VALUE },
    ...orders.value.map((o) => {
    const states = (o.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—'
    return {
      label: `${o.case_type} (${states})`,
      value: o.id
    }
    })
  ]
})

const openLead = (lead: FulfillmentOrder) => {
  router.push(`/retainers/${lead.id}`)
}

const toast = useToast()

const onDragStartLead = (lead: FulfillmentOrder) => {
  dragLeadId.value = lead.id
  dragFromStage.value = lead.stage
}

const onDragEndLead = () => {
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
      <UDashboardNavbar title="Fulfillment Centers - Order Processing">
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
          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Total Orders</p>
                <p class="mt-1.5 text-3xl font-bold text-highlighted">{{ totalOrders }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-package" class="text-xl text-[var(--ap-accent)]" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Returned Back</p>
                <p class="mt-1.5 text-3xl font-bold text-amber-400">{{ returnedCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-arrow-left-circle" class="text-xl text-amber-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-green-500/30 hover:bg-green-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Signed Retainers</p>
                <p class="mt-1.5 text-3xl font-bold text-green-400">{{ signedCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-xl text-green-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Dropped</p>
                <p class="mt-1.5 text-3xl font-bold text-red-400">{{ droppedCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-xl text-red-400" />
              </div>
            </div>
          </div>

          <div class="group overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5 transition-all duration-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Successful Cases</p>
                <p class="mt-1.5 text-3xl font-bold text-emerald-400">{{ successfulCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <UIcon name="i-lucide-trophy" class="text-xl text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Filters ═══ -->
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <USelect
              v-model="selectedOrderId"
              :items="orderOptions"
              class="w-[28rem]"
              value-key="value"
              label-key="label"
              placeholder="Select an order"
            />

            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search leads..."
            />

            <USelect
              v-model="selectedStage"
              :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
              class="w-56"
              value-key="value"
              label-key="label"
            />
          </div>

          <span class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-border)] px-3 py-1 text-xs font-semibold text-muted">
            {{ filteredOrders.length }} leads
          </span>
        </div>

        <!-- ═══ Kanban Board ═══ -->
        <div class="min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full gap-4">
            <div
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]"
              @dragover.prevent
              @drop.prevent="onDropToStage(stage.key)"
            >
              <div class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-lg"
                    :class="{
                      'bg-amber-500/10': stage.key === 'returned_back',
                      'bg-green-500/10': stage.key === 'signed_retainers',
                      'bg-red-500/10': stage.key === 'dropped_retainers',
                      'bg-emerald-500/10': stage.key === 'successful_cases'
                    }"
                  >
                    <UIcon
                      :name="stage.key === 'returned_back' ? 'i-lucide-arrow-left-circle' : stage.key === 'signed_retainers' ? 'i-lucide-check-circle' : stage.key === 'dropped_retainers' ? 'i-lucide-x-circle' : 'i-lucide-trophy'"
                      class="text-xs"
                      :class="{
                        'text-amber-400': stage.key === 'returned_back',
                        'text-green-400': stage.key === 'signed_retainers',
                        'text-red-400': stage.key === 'dropped_retainers',
                        'text-emerald-400': stage.key === 'successful_cases'
                      }"
                    />
                  </div>
                  <span class="text-sm font-semibold text-highlighted">{{ stage.label }}</span>
                </div>
                <span class="inline-flex items-center rounded-md bg-[var(--ap-card-border)] px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {{ ordersByStage.get(stage.key)?.length ?? 0 }}
                </span>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-3 fulfillment-scroll">
                <div
                  v-for="order in (ordersByStage.get(stage.key) ?? [])"
                  :key="order.id"
                  class="group cursor-pointer rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/[0.03]"
                  draggable="true"
                  @dragstart="onDragStartLead(order)"
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

                  <div v-if="order.signedDate" class="mt-2 flex items-center gap-1 text-[11px] text-green-400">
                    <UIcon name="i-lucide-check" class="size-3" />
                    <span>Signed: {{ order.signedDate }}</span>
                  </div>
                </div>

                <div
                  v-if="(ordersByStage.get(stage.key)?.length ?? 0) === 0"
                  class="flex items-center justify-center rounded-xl border border-dashed border-[var(--ap-card-border)] px-3 py-8 text-center text-xs text-muted"
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
