<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date: string | null
  status: string | null
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

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const canSeeAssignments = computed(() => isSuperAdmin.value || isAdmin.value)
const canSeeStatusFilter = computed(() => isSuperAdmin.value || isAdmin.value)

const PENDING_APPROVAL = 'Pending Approval'

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

const leadVendorFilter = ref('All')
const statusFilter = ref(PENDING_APPROVAL)

const pageSize = 25
const currentPage = ref(1)

const totalCount = ref(0)
const availableLeadVendors = ref<string[]>([])
const availableStatuses = ref<string[]>([])

const rows = ref<DailyDealFlow[]>([])

const leadVendorOptions = computed(() => {
  return ['All', ...availableLeadVendors.value]
})

const statusOptions = computed(() => {
  return [PENDING_APPROVAL]
})

const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

const displayPage = computed(() => Math.min(Math.max(1, currentPage.value), pageCount.value))

const pagedRows = computed(() => rows.value)

const canPrev = computed(() => currentPage.value > 1)
const canNext = computed(() => currentPage.value < pageCount.value)

const visibleColumnCount = computed(() => {
  let count = 4
  if (isSuperAdmin.value) count += 1
  if (canSeeAssignments.value) count += 1
  return count
})

const colWidth = computed(() => `${100 / visibleColumnCount.value}%`)

const goPrev = () => {
  if (!canPrev.value) return
  currentPage.value -= 1
}

const goNext = () => {
  if (!canNext.value) return
  currentPage.value += 1
}

const resetPagination = () => {
  currentPage.value = 1
}

const normalizeFilterValue = (value: string | null | undefined) => {
  const v = String(value ?? '').trim()
  return v.length ? v : '—'
}

// Table columns are rendered manually in the template for full design control

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value.length >= 10 ? value.slice(0, 10) : value
  }
}

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
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

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.user?.id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    const q = query.value.trim()
    const from = (displayPage.value - 1) * pageSize
    const to = from + pageSize - 1

    let queryBuilder = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,agent,carrier,created_at', { count: 'exact' })

    queryBuilder = queryBuilder.eq('status', PENDING_APPROVAL)

    if (userRole === 'lawyer' && userId) {
      queryBuilder = queryBuilder.eq('assigned_attorney_id', userId)
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
          queryBuilder = queryBuilder.eq('lead_vendor', centerData.lead_vendor)
        } else {
          rows.value = []
          totalCount.value = 0
          return
        }
      } else {
        rows.value = []
        totalCount.value = 0
        return
      }
    }

    if (isSuperAdmin.value && leadVendorFilter.value !== 'All') {
      const v = normalizeFilterValue(leadVendorFilter.value)
      queryBuilder = v === '—'
        ? queryBuilder.is('lead_vendor', null)
        : queryBuilder.eq('lead_vendor', v)
    }

    statusFilter.value = PENDING_APPROVAL

    if (q) {
      const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
      queryBuilder = queryBuilder.or([
        `submission_id.ilike.${pattern}`,
        `insured_name.ilike.${pattern}`,
        `client_phone_number.ilike.${pattern}`,
        `lead_vendor.ilike.${pattern}`,
        `status.ilike.${pattern}`,
        `agent.ilike.${pattern}`,
        `carrier.ilike.${pattern}`
      ].join(','))
    }

    const { data, count, error: supaError } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(from, to)

    if (supaError) throw supaError

    let dealFlows = (data ?? []) as DailyDealFlow[]
    dealFlows.forEach((r) => {
      r.source = 'daily_deal_flow'
    })

    const effectiveCount = count ?? 0

    if (userRole === 'lawyer' && userId && effectiveCount === 0) {
      let leadsQb = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('assigned_attorney_id', userId)

      if (q) {
        const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
        leadsQb = leadsQb.or([
          `submission_id.ilike.${pattern}`,
          `customer_full_name.ilike.${pattern}`,
          `phone_number.ilike.${pattern}`
        ].join(','))
      }

      const { data: leadsData, count: leadsCount, error: leadsErr } = await leadsQb
        .order('created_at', { ascending: false })
        .range(from, to)

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
          date,
          status: (row.status ? String(row.status) : PENDING_APPROVAL),
          assigned_attorney_id: (row.assigned_attorney_id ? String(row.assigned_attorney_id) : null),
          agent: null,
          carrier: null,
          created_at: createdAt,
          source: 'leads'
        }
      }).filter((r) => Boolean(r.id) && Boolean(r.submission_id))

      rows.value = mapped
      totalCount.value = leadsCount ?? 0
      return
    }

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

        if (attorneysError) throw attorneysError

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

    rows.value = dealFlows
    totalCount.value = effectiveCount
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load retainers'
    error.value = msg
  } finally {
    loading.value = false
  }
}

const loadFilterOptions = async () => {
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    if (userRole !== 'super_admin') {
      availableLeadVendors.value = []
      leadVendorFilter.value = 'All'
    }

    availableStatuses.value = [PENDING_APPROVAL]
    statusFilter.value = PENDING_APPROVAL

    let qb = supabase
      .from('daily_deal_flow')
      .select('lead_vendor,status')
      .order('created_at', { ascending: false })
      .limit(1000)

    qb = qb.eq('status', PENDING_APPROVAL)

    if (userRole === 'lawyer' && userId) {
      qb = qb.eq('assigned_attorney_id', userId)
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
          qb = qb.eq('lead_vendor', centerData.lead_vendor)
        } else {
          availableLeadVendors.value = ['—']
          availableStatuses.value = ['—']
          return
        }
      } else {
        availableLeadVendors.value = ['—']
        availableStatuses.value = ['—']
        return
      }
    }

    const { data, error: optErr } = await qb
    if (optErr) throw optErr

    const vendorSet = new Set<string>()
    const statusSet = new Set<string>()
    for (const r of (data ?? []) as Array<{ lead_vendor: string | null; status: string | null }>) {
      vendorSet.add(normalizeFilterValue(r.lead_vendor))
      statusSet.add(normalizeFilterValue(r.status))
    }

    const vendors = Array.from(vendorSet)
    const statuses = Array.from(statusSet)
    vendors.sort((a, b) => a.localeCompare(b))
    statuses.sort((a, b) => a.localeCompare(b))

    if (userRole === 'super_admin') {
      availableLeadVendors.value = vendors
    }
    availableStatuses.value = [PENDING_APPROVAL]
  } catch {
    return
  }
}

onMounted(async () => {
  await loadFilterOptions()
  await load()
})

watch([query, leadVendorFilter, statusFilter], () => {
  if (currentPage.value !== 1) {
    resetPagination()
    return
  }
  load().catch(() => {
  })
})

watch(currentPage, () => {
  load().catch(() => {
  })
})

watch(pageCount, () => {
  if (currentPage.value > pageCount.value) currentPage.value = pageCount.value
})

const openRow = (row: DailyDealFlow) => {
  router.push(`/retainers/${row.id}`)
}

const dropOpen = ref(false)
const dropTarget = ref<DailyDealFlow | null>(null)
const dropBusy = ref(false)

const openDrop = (row: DailyDealFlow) => {
  if (row.source === 'leads') return
  dropTarget.value = row
  dropOpen.value = true
}

const handleDropOpenUpdate = (v: boolean) => {
  dropOpen.value = v
  if (!v) {
    dropTarget.value = null
    dropBusy.value = false
  }
}

const confirmDrop = async () => {
  const target = dropTarget.value
  if (!target?.id) return
  if (target.source === 'leads') return

  dropBusy.value = true
  try {
    const { error: updateErr } = await supabase
      .from('daily_deal_flow')
      .update({ status: 'Dropped' })
      .eq('id', target.id)

    if (updateErr) throw updateErr

    await load()
    dropOpen.value = false
    dropTarget.value = null
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to drop retainer'
    error.value = msg
  } finally {
    dropBusy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="retainers">
    <template #header>
      <UDashboardNavbar title="My Customers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <div class="hidden items-center gap-1.5 rounded-full border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3 py-1 sm:flex">
              <span class="h-1.5 w-1.5 rounded-full bg-[var(--ap-accent)] animate-pulse" />
              <span class="text-xs font-medium text-[var(--ap-accent)]">{{ totalCount }} total</span>
            </div>
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
        <!-- Drop Retainer Modal -->
        <UModal
          :open="dropOpen"
          title="Drop retainer"
          :dismissible="false"
          @update:open="handleDropOpenUpdate"
        >
          <template #body="{ close }">
            <div class="space-y-5">
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                  <UIcon name="i-lucide-alert-triangle" class="text-lg text-red-400" />
                </div>
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Are you sure?
                  </p>
                  <p class="mt-0.5 text-sm text-muted">
                    This will permanently mark the retainer as dropped.
                  </p>
                </div>
              </div>

              <div class="rounded-xl border border-default bg-elevated/40 p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ap-accent)]/15 text-xs font-bold text-[var(--ap-accent)]">
                    {{ getInitials(dropTarget?.insured_name ?? null) }}
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-highlighted">
                      {{ dropTarget?.insured_name ?? '—' }}
                    </div>
                    <div class="text-xs text-muted">
                      {{ formatPhone(dropTarget?.client_phone_number ?? null) }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 pt-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="dropBusy"
                  class="rounded-lg"
                  @click="() => { close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  variant="solid"
                  :loading="dropBusy"
                  icon="i-lucide-trash-2"
                  class="rounded-lg"
                  @click="confirmDrop"
                >
                  Drop retainer
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- Toolbar -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-1 flex-wrap items-center gap-2.5">
            <div class="relative max-w-xs flex-1">
              <UInput
                v-model="query"
                class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:pl-10 [&_input]:backdrop-blur-sm"
                icon="i-lucide-search"
                placeholder="Search retainers..."
              />
            </div>

            <USelect
              v-if="isSuperAdmin"
              v-model="leadVendorFilter"
              :items="leadVendorOptions"
              class="w-44 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
            />

            <USelect
              v-if="canSeeStatusFilter"
              v-model="statusFilter"
              :items="statusOptions"
              class="w-44 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
            />
          </div>
        </div>

        <!-- Error Alert -->
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Unable to load retainers"
          :description="error"
          class="rounded-xl"
        />

        <!-- Table Card -->
        <div class="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
          <!-- Loading Skeleton -->
          <div v-if="loading && !rows.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
              <span class="text-sm text-muted">Loading retainers...</span>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="!loading && !rows.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3 text-center">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-inbox" class="text-2xl text-[var(--ap-accent)]/60" />
              </div>
              <div>
                <p class="text-sm font-medium text-highlighted">
                  No retainers found
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  Try adjusting your search or filters
                </p>
              </div>
            </div>
          </div>

          <!-- Table Content -->
          <div v-else class="flex-1 min-h-0 overflow-y-auto retainers-scroll">
            <table class="w-full table-fixed">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] backdrop-blur-xl">
                  <th :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Client
                  </th>
                  <th :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Phone
                  </th>
                  <th :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Date
                  </th>
                  <th v-if="isSuperAdmin" :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Vendor
                  </th>
                  <th v-if="canSeeAssignments" :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Attorney
                  </th>
                  <th :style="{ width: colWidth }" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedRows"
                  :key="row.id"
                  class="group cursor-pointer border-b border-[var(--ap-card-hover)] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
                  @click="openRow(row)"
                >
                  <!-- Client -->
                  <td :style="{ width: colWidth }" class="px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-xs font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10 transition-all duration-200 group-hover:ring-[var(--ap-accent)]/30 group-hover:shadow-[0_0_12px_var(--ap-accent-shadow)]">
                        {{ getInitials(row.insured_name) }}
                      </div>
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-highlighted transition-colors duration-200 group-hover:text-[var(--ap-accent)]">
                          {{ row.insured_name ?? 'Unknown Client' }}
                        </p>
                      </div>
                    </div>
                  </td>

                  <!-- Phone -->
                  <td :style="{ width: colWidth }" class="px-5 py-3.5">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-phone" class="shrink-0 text-xs text-muted" />
                      <span class="text-sm text-default tabular-nums">{{ formatPhone(row.client_phone_number) }}</span>
                    </div>
                  </td>

                  <!-- Date -->
                  <td :style="{ width: colWidth }" class="px-5 py-3.5">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-calendar" class="shrink-0 text-xs text-muted" />
                      <span class="text-sm text-default">{{ formatDate(row.date) }}</span>
                    </div>
                  </td>

                  <!-- Lead Vendor (super admin only) -->
                  <td v-if="isSuperAdmin" :style="{ width: colWidth }" class="px-5 py-3.5">
                    <span
                      v-if="row.lead_vendor"
                      class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-2.5 py-1 text-xs font-medium text-default"
                    >
                      {{ row.lead_vendor }}
                    </span>
                    <span v-else class="text-xs text-muted">—</span>
                  </td>

                  <!-- Assigned Attorney (admin+) -->
                  <td v-if="canSeeAssignments" :style="{ width: colWidth }" class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ row.assigned_attorney_name ?? '—' }}</span>
                  </td>

                  <!-- Actions -->
                  <td :style="{ width: colWidth }" class="px-5 py-3.5">
                    <div class="flex items-center justify-start gap-1.5">
                      <button
                        class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--ap-accent)] transition-all hover:bg-[var(--ap-accent)]/20 hover:border-[var(--ap-accent)]/40"
                        @click.stop="openRow(row)"
                      >
                        <UIcon name="i-lucide-eye" class="text-sm" />
                        View
                      </button>
                      <button
                        class="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
                        :disabled="row.source === 'leads'"
                        @click.stop="openDrop(row)"
                      >
                        <UIcon name="i-lucide-ban" class="text-sm" />
                        Drop
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer -->
          <div class="flex items-center justify-between border-t border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3 backdrop-blur-xl">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">
                Showing <span class="font-medium text-highlighted">{{ pagedRows.length }}</span> of <span class="font-medium text-highlighted">{{ totalCount }}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
                :disabled="!canPrev"
                @click="goPrev"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
                Prev
              </button>

              <div class="flex h-8 items-center rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3">
                <span class="text-xs font-semibold text-[var(--ap-accent)]">{{ displayPage }}</span>
                <span class="mx-1 text-xs text-muted">/</span>
                <span class="text-xs text-muted">{{ pageCount }}</span>
              </div>

              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
                :disabled="!canNext"
                @click="goNext"
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
.retainers-scroll::-webkit-scrollbar {
  width: 4px;
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
