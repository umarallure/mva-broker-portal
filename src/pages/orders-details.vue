<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { listOrdersForLawyer, listOpenOrdersForLawyer, type OrderRow } from '../lib/orders'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

// ── All orders ────────────────────────────────────────────────────────────
const allOrders = ref<OrderRow[]>([])
const loadingOrders = ref(false)

// ── State filter from query param (e.g. ?state=AR from map click) ──────────
const stateFilter = computed(() => {
  const s = route.query.state
  return s ? String(s).trim().toUpperCase() : null
})

const visibleOrders = computed(() => {
  if (!stateFilter.value) return allOrders.value
  return allOrders.value.filter(o =>
    (o.target_states ?? []).some(s => String(s || '').trim().toUpperCase() === stateFilter.value)
  )
})

// ── Selected order ─────────────────────────────────────────────────────────
const selectedOrderId = ref<string>(route.params.id as string)
const selectedOrder = computed(() => allOrders.value.find(o => o.id === selectedOrderId.value) ?? null)

// ── Leads/retainers ────────────────────────────────────────────────────────
type Lead = {
  id: string
  clientName: string
  phone: string
  state: string
  date: string
  status: string
  signedDate?: string
}

const leads = ref<Lead[]>([])
const loadingLeads = ref(false)

// ── Helpers ────────────────────────────────────────────────────────────────
const normalizeCaseType = (t: string) => {
  const lower = t.trim().toLowerCase()
  if (lower.includes('motor vehicle') || lower.includes('mva') || lower.includes('consumer')) return 'Consumer Cases (MVA)'
  if (lower.includes('commercial')) return 'Commercial Cases'
  return t.trim()
}

const displayStatus = (order: OrderRow) => {
  if (order.status === 'OPEN') return order.quota_filled > 0 ? 'In Progress' : 'Pending'
  if (order.status === 'FULFILLED') return 'Completed'
  return order.status
}

const statusColor = (order: OrderRow) => {
  const s = displayStatus(order)
  if (s === 'Pending') return 'success'
  if (s === 'In Progress') return 'warning'
  if (s === 'Completed') return 'primary'
  if (s === 'EXPIRED') return 'error'
  return 'neutral'
}

const progressPercent = (order: OrderRow) => {
  const total = Number(order.quota_total ?? 0)
  const filled = Number(order.quota_filled ?? 0)
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((filled / total) * 100)))
}

const expiresLabel = (order: OrderRow) => {
  const d = new Date(order.expires_at || '')
  if (d.getFullYear() >= 2099) return 'No expiry'
  return String(order.expires_at || '').slice(0, 10)
}

// ── Criteria helpers ────────────────────────────────────────────────────────
const criteria = computed(() => {
  const raw = selectedOrder.value?.criteria ?? null
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
})

const toStringArray = (v: unknown) => {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return [] as string[]
}

const criteriaLanguages = computed(() => toStringArray(criteria.value?.languages))
const criteriaInjurySeverities = computed(() => toStringArray(criteria.value?.injury_severity))
const criteriaLiability = computed(() => criteria.value?.liability_status ? String(criteria.value.liability_status) : null)
const criteriaInsurance = computed(() => criteria.value?.insurance_status ? String(criteria.value.insurance_status) : null)
const criteriaMedical = computed(() => criteria.value?.medical_treatment ? String(criteria.value.medical_treatment) : null)
const criteriaNoPriorAttorney = computed(() => {
  const v = criteria.value?.no_prior_attorney
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return null
})

// ── Load leads for selected order ───────────────────────────────────────────
const loadLeads = async (orderId: string) => {
  if (!orderId) { leads.value = []; return }
  loadingLeads.value = true
  leads.value = []
  try {
    // Step 1: get lead_ids from order_fulfillments
    const { data: fulfillmentRows, error: fErr } = await supabase
      .from('order_fulfillments')
      .select('lead_id')
      .eq('order_id', orderId)
      .limit(500)
    if (fErr) throw fErr

    const leadIds = (fulfillmentRows ?? [])
      .map(r => String((r as { lead_id?: string | null }).lead_id ?? '').trim())
      .filter(Boolean)

    if (!leadIds.length) return

    // Step 2: get submission_ids from leads
    const { data: leadsRows, error: lErr } = await supabase
      .from('leads')
      .select('id,submission_id')
      .in('id', leadIds)
    if (lErr) throw lErr

    const leadIdToSub = new Map<string, string>()
    ;(leadsRows ?? []).forEach((r: Record<string, unknown>) => {
      const lid = String(r.id ?? '').trim()
      const sid = String(r.submission_id ?? '').trim()
      if (lid && sid) leadIdToSub.set(lid, sid)
    })

    const submissionIds = [...new Set([...leadIdToSub.values()].filter(Boolean))]
    if (!submissionIds.length) return

    // Step 3: get deal details from daily_deal_flow
    const { data: ddfRows, error: dErr } = await supabase
      .from('daily_deal_flow')
      .select('*')
      .in('submission_id', submissionIds)
    if (dErr) throw dErr

    const ddfBySub = new Map<string, Record<string, unknown>>()
    ;(ddfRows ?? []).forEach((r: Record<string, unknown>) => {
      const sid = String(r.submission_id ?? '').trim()
      if (sid && !ddfBySub.has(sid)) ddfBySub.set(sid, r)
    })

    const getSignedDate = (r: Record<string, unknown>) =>
      r.date_signed ?? r.signed_date ?? r.retainer_signed_date ?? r.retainer_signed_at ?? r.signed_at ?? null

    leads.value = leadIds
      .map(leadId => {
        const sid = leadIdToSub.get(leadId)
        if (!sid) return null
        const row = ddfBySub.get(sid)
        if (!row) return null
        const signed = getSignedDate(row)
        return {
          id: String(row.id ?? leadId),
          clientName: String(row.insured_name ?? row.customer_full_name ?? '—'),
          phone: String(row.client_phone_number ?? row.phone_number ?? '—'),
          state: String(row.state ?? row.state_code ?? '—'),
          date: String(row.date ?? row.created_at ?? '').slice(0, 10) || '—',
          status: String(row.status ?? row.retainer_status ?? '—'),
          signedDate: signed ? String(signed).slice(0, 10) : undefined,
        } as Lead
      })
      .filter((x): x is Lead => Boolean(x))
  } catch {
    leads.value = []
  } finally {
    loadingLeads.value = false
  }
}

// ── Initial load ────────────────────────────────────────────────────────────
const load = async () => {
  loadingOrders.value = true
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    if (!userId) return

    const [open, closed] = await Promise.all([
      listOpenOrdersForLawyer(userId),
      listOrdersForLawyer({ lawyerId: userId, statuses: ['FULFILLED', 'EXPIRED'] })
    ])
    allOrders.value = [...open, ...closed]

    // Default to route param
    if (!selectedOrderId.value && allOrders.value.length) {
      selectedOrderId.value = allOrders.value[0].id
    }

    if (selectedOrderId.value) {
      await loadLeads(selectedOrderId.value)
    }
  } finally {
    loadingOrders.value = false
  }
}

const selectOrder = async (order: OrderRow) => {
  selectedOrderId.value = order.id
  const query = stateFilter.value ? { state: stateFilter.value } : {}
  router.replace({ path: `/orders/${order.id}`, query })
  await loadLeads(order.id)
}

watch(() => route.params.id, (newId) => {
  if (newId && newId !== selectedOrderId.value) {
    selectedOrderId.value = newId as string
    loadLeads(newId as string)
  }
})

onMounted(load)
</script>

<template>
  <UDashboardPanel id="order-details">
    <template #header>
      <UDashboardNavbar title="Order Details">
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="router.push('/intake-map')"
          >
            Order Map
          </UButton>
        </template>
        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loadingOrders"
            @click="load"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loadingOrders && !allOrders.length" class="flex h-full min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <div v-else class="flex h-full gap-0">

        <!-- ══ Left: Orders List ══ -->
        <div class="w-72 shrink-0 border-r border-[var(--ap-card-border)] flex flex-col overflow-hidden">
          <div class="border-b border-[var(--ap-card-border)] px-4 py-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">
                {{ stateFilter ? `Orders — ${stateFilter}` : 'All Orders' }}
              </p>
              <UButton
                v-if="stateFilter"
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="router.replace(`/orders/${selectedOrderId}`)"
              />
            </div>
            <p class="mt-0.5 text-[11px] text-muted">{{ visibleOrders.length }} / {{ allOrders.length }}</p>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div
              v-for="order in visibleOrders"
              :key="order.id"
              class="cursor-pointer border-b border-[var(--ap-card-border)] px-4 py-3 transition-colors"
              :class="selectedOrderId === order.id
                ? 'bg-[var(--ap-accent)]/10 border-l-2 border-l-[var(--ap-accent)]'
                : 'hover:bg-[var(--ap-card-divide)]'"
              @click="selectOrder(order)"
            >
              <div class="text-xs font-semibold text-highlighted truncate">
                {{ normalizeCaseType(order.case_type || '') }}
              </div>
              <div class="mt-1 text-[11px] text-muted">
                {{ (order.target_states || []).map(s => String(s).toUpperCase()).join(', ') || '—' }}
              </div>
              <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span
                  class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="{
                    'bg-green-500/10 text-green-400': displayStatus(order) === 'Pending',
                    'bg-amber-500/10 text-amber-400': displayStatus(order) === 'In Progress',
                    'bg-blue-500/10 text-blue-400': displayStatus(order) === 'Completed',
                    'bg-red-500/10 text-red-400': order.status === 'EXPIRED',
                  }"
                >
                  {{ displayStatus(order) }}
                </span>
                <span class="text-[10px] text-muted tabular-nums">{{ order.quota_filled }}/{{ order.quota_total }}</span>
              </div>
            </div>

            <div v-if="!allOrders.length" class="flex flex-col items-center justify-center p-8 text-center">
              <UIcon name="i-lucide-inbox" class="mb-2 text-2xl text-muted/40" />
              <p class="text-xs text-muted">No orders yet</p>
            </div>
          </div>
        </div>

        <!-- ══ Right: Order Detail ══ -->
        <div class="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-5">
          <div v-if="!selectedOrder" class="flex h-full min-h-48 items-center justify-center">
            <p class="text-sm text-muted">Select an order from the list</p>
          </div>

          <template v-else>
            <!-- Header card -->
            <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="text-xs text-muted uppercase tracking-wider">Case Type</div>
                  <div class="mt-1 text-xl font-bold text-highlighted">
                    {{ normalizeCaseType(selectedOrder.case_type || '') }}
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <UBadge :color="statusColor(selectedOrder)" variant="subtle" :label="displayStatus(selectedOrder)" />
                    <UBadge color="neutral" variant="subtle" :label="`Expires: ${expiresLabel(selectedOrder)}`" />
                    <UBadge color="neutral" variant="subtle" :label="`Created: ${String(selectedOrder.created_at || '').slice(0, 10)}`" />
                  </div>
                </div>

                <div>
                  <div class="text-xs text-muted uppercase tracking-wider mb-1">Target States</div>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge
                      v-for="s in (selectedOrder.target_states || []).map(x => String(x || '').toUpperCase()).filter(Boolean)"
                      :key="s"
                      color="primary"
                      variant="subtle"
                      :label="s"
                    />
                    <span v-if="!(selectedOrder.target_states || []).length" class="text-sm text-muted">—</span>
                  </div>
                </div>

                <!-- Quota progress -->
                <div class="w-full sm:w-56">
                  <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="text-muted">Quota Progress</span>
                    <span class="font-semibold tabular-nums text-highlighted">{{ selectedOrder.quota_filled }}/{{ selectedOrder.quota_total }}</span>
                  </div>
                  <div class="h-2 w-full overflow-hidden rounded-full bg-[var(--ap-card-border)]">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="progressPercent(selectedOrder) >= 100 ? 'bg-green-400' : 'bg-[var(--ap-accent)]'"
                      :style="{ width: `${progressPercent(selectedOrder)}%` }"
                    />
                  </div>
                  <div class="mt-1 text-right text-[11px] text-muted">{{ progressPercent(selectedOrder) }}%</div>
                </div>
              </div>
            </div>

            <!-- Criteria -->
            <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
              <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sliders-horizontal" class="text-sm text-muted" />
                  <span class="text-xs font-semibold uppercase tracking-wider text-muted">Order Criteria</span>
                </div>
              </div>
              <div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Languages</div>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge v-for="l in criteriaLanguages" :key="l" color="primary" variant="subtle" size="sm" :label="l" />
                    <span v-if="!criteriaLanguages.length" class="text-xs text-muted">—</span>
                  </div>
                </div>
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Injury Severity</div>
                  <div class="flex flex-wrap gap-1.5">
                    <UBadge v-for="s in criteriaInjurySeverities" :key="s" color="warning" variant="subtle" size="sm" :label="s" />
                    <span v-if="!criteriaInjurySeverities.length" class="text-xs text-muted">—</span>
                  </div>
                </div>
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Liability Status</div>
                  <UBadge v-if="criteriaLiability" color="neutral" variant="subtle" size="sm" :label="criteriaLiability" />
                  <span v-else class="text-xs text-muted">—</span>
                </div>
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Insurance Status</div>
                  <UBadge v-if="criteriaInsurance" color="neutral" variant="subtle" size="sm" :label="criteriaInsurance" />
                  <span v-else class="text-xs text-muted">—</span>
                </div>
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Medical Treatment</div>
                  <UBadge v-if="criteriaMedical" color="neutral" variant="subtle" size="sm" :label="criteriaMedical" />
                  <span v-else class="text-xs text-muted">—</span>
                </div>
                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3">
                  <div class="text-[11px] text-muted mb-1.5">Client Requirements</div>
                  <UBadge
                    v-if="criteriaNoPriorAttorney !== null"
                    :color="criteriaNoPriorAttorney ? 'success' : 'neutral'"
                    variant="subtle"
                    size="sm"
                    :label="criteriaNoPriorAttorney ? 'No prior attorney' : 'Prior attorney allowed'"
                  />
                  <span v-else class="text-xs text-muted">—</span>
                </div>
              </div>
            </div>

            <!-- Leads / Retainers -->
            <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
              <div class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-5 py-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-users" class="text-sm text-[var(--ap-accent)]" />
                  <span class="text-xs font-semibold uppercase tracking-wider text-muted">Leads / Retainers</span>
                </div>
                <span class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-2.5 py-1 text-[11px] font-semibold text-muted">
                  {{ leads.length }} assigned
                </span>
              </div>

              <!-- Loading -->
              <div v-if="loadingLeads" class="flex items-center justify-center p-8">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-dimmed" />
              </div>

              <!-- Empty -->
              <div v-else-if="!leads.length" class="flex flex-col items-center justify-center p-8 text-center">
                <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-users" class="text-lg text-[var(--ap-accent)]/50" />
                </div>
                <p class="text-sm text-muted">No leads assigned to this order yet</p>
              </div>

              <!-- Table -->
              <div v-else class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-[var(--ap-card-border)]">
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">Client</th>
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">Phone</th>
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">State</th>
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">Date</th>
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">Status</th>
                      <th class="px-4 py-2.5 text-left font-semibold text-muted uppercase tracking-wider">Signed</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[var(--ap-card-divide)]">
                    <tr
                      v-for="lead in leads"
                      :key="lead.id"
                      class="transition-colors hover:bg-[var(--ap-card-divide)]"
                    >
                      <td class="px-4 py-3 font-medium text-highlighted">{{ lead.clientName }}</td>
                      <td class="px-4 py-3 text-muted tabular-nums">{{ lead.phone }}</td>
                      <td class="px-4 py-3">
                        <UBadge color="primary" variant="subtle" size="sm" :label="lead.state.toUpperCase()" />
                      </td>
                      <td class="px-4 py-3 text-muted tabular-nums">{{ lead.date }}</td>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize"
                          :class="lead.status.toLowerCase().includes('sign')
                            ? 'bg-green-500/10 text-green-400'
                            : lead.status.toLowerCase().includes('drop') || lead.status.toLowerCase().includes('cancel')
                              ? 'bg-red-500/10 text-red-400'
                              : lead.status.toLowerCase().includes('success') || lead.status.toLowerCase().includes('qualif')
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-[var(--ap-card-divide)] text-muted'"
                        >
                          {{ lead.status }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-muted tabular-nums">{{ lead.signedDate ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
