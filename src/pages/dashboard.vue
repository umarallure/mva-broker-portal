<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
// import { useDashboard } from '../composables/useDashboard'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'
import { listInvoices, type InvoiceRow, type InvoiceStatus } from '../lib/invoices'
import { listOrdersForLawyer, type OrderRow } from '../lib/orders'
import DashboardMetricCard from '../components/dashboard/DashboardMetricCard.vue'
import ProductGuideHint from '../components/product-guide/ProductGuideHint.vue'
import { productGuideHints } from '../data/product-guide-hints'
import { VisXYContainer, VisArea, VisLine, VisCrosshair, VisTooltip } from '@unovis/vue'

const router = useRouter()
// const { isNotificationsSlideoverOpen } = useDashboard()
const auth = useAuth()

const items = [[{
  label: 'New mail',
  icon: 'i-lucide-send',
  to: '/inbox'
}, {
  label: 'New retainer',
  icon: 'i-lucide-briefcase',
  to: '/retainers'
}]] satisfies DropdownMenuItem[][]

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const isAdminOrSuper = computed(() => isSuperAdmin.value || isAdmin.value)
const dashboardHints = productGuideHints.dashboard

const loading = ref(true)

type RetainerRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date: string | null
  status: string | null
  assigned_attorney_id: string | null
  created_at: string | null
  invoice_id: string | null
}

type InvoiceRowWithLawyerName = InvoiceRow & { lawyer_name?: string | null }

const retainers = ref<RetainerRow[]>([])
const retainerCount = ref(0)

const orders = ref<OrderRow[]>([])
const orderCount = ref(0)
const orderQuotaTotal = ref(0)
const orderQuotaFilled = ref(0)

const invoices = ref<InvoiceRowWithLawyerName[]>([])

type DashboardInvoiceStage = 'billable' | 'pending' | 'paid' | 'chargeback'

const getDashboardInvoiceStage = (status: InvoiceStatus): DashboardInvoiceStage => {
  if (status === 'paid') return 'paid'
  if (status === 'chargeback') return 'chargeback'
  if (status === 'in_review' || status === 'signed_awaiting' || status === 'in_preview') return 'pending'
  return 'billable'
}

const dashboardInvoiceStageSummary = computed(() => {
  const summary: Record<DashboardInvoiceStage, { count: number; amount: number }> = {
    billable: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    chargeback: { count: 0, amount: 0 }
  }

  invoices.value.forEach((invoice) => {
    const stage = getDashboardInvoiceStage(invoice.status)
    summary[stage].count += 1
    summary[stage].amount += Number(invoice.total_amount) || 0
  })

  return summary
})

const totalInvoiced = computed(() => invoices.value.reduce((s, i) => s + Number(i.total_amount), 0))
const pendingInvoiceAmount = computed(() => dashboardInvoiceStageSummary.value.pending.amount)
const paidInvoiceAmount = computed(() => dashboardInvoiceStageSummary.value.paid.amount)
const pendingReviewInvoiceCount = computed(() => dashboardInvoiceStageSummary.value.pending.count)

const fulfillmentPercent = computed(() => {
  if (!orderQuotaTotal.value) return 0
  return Math.round((orderQuotaFilled.value / orderQuotaTotal.value) * 100)
})

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

const getStatusColor = (status: InvoiceStatus) => {
  const stage = getDashboardInvoiceStage(status)
  if (stage === 'billable') return 'text-blue-400'
  if (stage === 'pending') return 'text-amber-400'
  if (stage === 'paid') return 'text-green-400'
  return 'text-red-400'
}

const getStatusBg = (status: InvoiceStatus) => {
  const stage = getDashboardInvoiceStage(status)
  if (stage === 'billable') return 'bg-blue-500/10'
  if (stage === 'pending') return 'bg-amber-500/10'
  if (stage === 'paid') return 'bg-green-500/10'
  return 'bg-red-500/10'
}

const getStatusIcon = (status: InvoiceStatus) => {
  const stage = getDashboardInvoiceStage(status)
  if (stage === 'billable') return 'i-lucide-file-check'
  if (stage === 'pending') return 'i-lucide-clock'
  if (stage === 'paid') return 'i-lucide-check-circle'
  return 'i-lucide-alert-triangle'
}

const getStatusLabel = (status: InvoiceStatus) => {
  const stage = getDashboardInvoiceStage(status)
  if (stage === 'billable') return 'Billable'
  if (stage === 'pending') return 'Pending'
  if (stage === 'paid') return 'Paid'
  return 'Chargeback'
}

const getRetainerStatusStyle = (status: string | null) => {
  const s = (status ?? '').toLowerCase()
  if (s.includes('sign')) return 'bg-green-500/10 text-green-400'
  if (s.includes('drop') || s.includes('cancel')) return 'bg-red-500/10 text-red-400'
  if (s.includes('return') || s.includes('back')) return 'bg-blue-500/10 text-blue-400'
  if (s.includes('success') || s.includes('qualified') || s.includes('won')) return 'bg-emerald-500/10 text-emerald-400'
  return 'bg-[var(--ap-card-divide)] text-muted'
}

const getFulfillmentRetainerStatusLabel = (status: string | null) => {
  const s = String(status ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('sign')) return 'Signed Retainers'
  if (s.includes('success') || s.includes('qualified') || s.includes('won')) return 'Successful Cases'
  if (s.includes('drop') || s.includes('dropped') || s.includes('cancel')) return 'Dropped Retainers'
  if (s.includes('return') || s.includes('back')) return 'Returned Back'
  return null
}

const getOrderDisplayStatus = (order: OrderRow) => {
  if (order.status === 'OPEN') {
    return order.quota_filled > 0 ? 'In Progress' : 'Pending'
  }
  return order.status
}

const getOrderStatusColor = (status: string) => {
  if (status === 'Pending') return 'text-green-400 bg-green-500/10'
  if (status === 'In Progress') return 'text-amber-400 bg-amber-500/10'
  if (status === 'OPEN') return 'text-[var(--ap-accent)] bg-[var(--ap-accent)]/10'
  if (status === 'FULFILLED') return 'text-green-400 bg-green-500/10'
  return 'text-muted bg-[var(--ap-card-divide)]'
}

const orderFillPercent = (o: OrderRow) => {
  if (!o.quota_total) return 0
  return Math.round((o.quota_filled / o.quota_total) * 100)
}

const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const userId = auth.state.value.profile?.user_id ?? null
    const role = auth.state.value.profile?.role ?? null

    // For lawyers, build name keywords for fallback matching
    let nameKeywords: string[] = []
    if (role === 'lawyer' && userId) {
      const { data: attorneyProfile } = await supabase
        .from('attorney_profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle()

      const fullName = attorneyProfile?.full_name?.trim() || null
      const displayName = auth.state.value.profile?.display_name?.trim() || null
      const email = auth.state.value.profile?.email || null
      const emailName = email ? email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() : null

      const rawName = fullName || displayName || emailName || ''
      nameKeywords = rawName
        .split(/[\s\-_]+/)
        .map((w: string) => w.trim().toLowerCase())
        .filter((w: string) => w.length >= 3)
    }

    const retainerSelect = 'id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,submitted_attorney,created_at,invoice_id'

    let retainerData: RetainerRow[] | null = null
    let rCount: number | null = 0

    if (role === 'lawyer' && userId) {
      // First try by assigned_attorney_id
      const { data: byId, count: byIdCount } = await supabase
        .from('daily_deal_flow')
        .select(retainerSelect, { count: 'exact' })
        .eq('assigned_attorney_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)

      retainerData = byId
      rCount = byIdCount

      // Fallback: match by any name keyword in submitted_attorney
      if ((!retainerData || retainerData.length === 0) && nameKeywords.length > 0) {
        const orFilter = nameKeywords
          .map((kw: string) => `submitted_attorney.ilike.%${kw}%`)
          .join(',')

        const { data: byName, count: byNameCount } = await supabase
          .from('daily_deal_flow')
          .select(retainerSelect, { count: 'exact' })
          .or(orFilter)
          .order('created_at', { ascending: false })
          .limit(5)

        retainerData = byName
        rCount = byNameCount
      }
    } else {
      const { data, count } = await supabase
        .from('daily_deal_flow')
        .select(retainerSelect, { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5)

      retainerData = data
      rCount = count
    }
    retainers.value = (retainerData ?? []) as RetainerRow[]
    retainerCount.value = rCount ?? 0

    if (userId) {
      const ordersData = await listOrdersForLawyer({ lawyerId: userId })
      orders.value = ordersData.slice(0, 5)
      orderCount.value = ordersData.length
      orderQuotaTotal.value = ordersData.reduce((sum, order) => sum + order.quota_total, 0)
      orderQuotaFilled.value = ordersData.reduce((sum, order) => sum + order.quota_filled, 0)
    } else {
      orders.value = []
      orderCount.value = 0
      orderQuotaTotal.value = 0
      orderQuotaFilled.value = 0
    }

    const invFilters: { lawyer_id?: string; status?: InvoiceStatus; invoice_type?: 'lawyer' | 'publisher' } = {
      invoice_type: 'lawyer'
    }
    if (role === 'lawyer' && userId) {
      invFilters.lawyer_id = userId
    }
    const invData = (await listInvoices(invFilters)) as InvoiceRowWithLawyerName[]

    if (role === 'super_admin' || role === 'admin') {
      const lawyerIds = [...new Set(invData.map(d => d.lawyer_id).filter(Boolean))]
      if (lawyerIds.length) {
        const { data: profiles } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', lawyerIds)

        const profileRows = (profiles ?? []) as Array<{ user_id?: string | null, full_name?: string | null }>
        const nameMap = new Map(profileRows.map(p => [String(p.user_id ?? ''), String(p.full_name ?? '').trim()]))

        const { data: appUsers } = await supabase
          .from('app_users')
          .select('user_id,display_name,email')
          .in('user_id', lawyerIds)

        const appUserRows = (appUsers ?? []) as Array<{ user_id?: string | null, display_name?: string | null, email?: string | null }>
        const fallbackMap = new Map(appUserRows.map(u => [String(u.user_id ?? ''), String(u.display_name || u.email || '').trim()]))

        invData.forEach((inv: InvoiceRowWithLawyerName) => {
          inv.lawyer_name = nameMap.get(inv.lawyer_id ?? '') || fallbackMap.get(inv.lawyer_id ?? '') || null
        })
      }
    }

    invoices.value = invData
  } catch (e) {
    console.error('[dashboard] load error', e)
  } finally {
    loading.value = false
  }
}

const openRetainer = (row: RetainerRow) => router.push(`/retainers/${row.id}`)
const openRetainerInvoice = (row: RetainerRow) => {
  if (!row.invoice_id) return
  const url = router.resolve(`/invoicing/${row.invoice_id}/pdf`).href
  window.open(url, '_blank')
}
const openOrder = (order: OrderRow) => router.push(`/orders/${order.id}`)
const openInvoicePdf = (invoice: InvoiceRow) => {
  const url = router.resolve(`/invoicing/${invoice.id}/pdf`).href
  window.open(url, '_blank')
}

const latestInvoices = computed(() => invoices.value.slice(0, 5))

onMounted(() => {
  load()
})

// ── New computed properties for redesigned dashboard ──

const activeWorkbenchTab = ref('retainers')
const workbenchTabs = computed(() => [
  { key: 'retainers', label: 'Retainers', icon: 'i-lucide-briefcase', count: retainerCount.value },
  { key: 'orders', label: 'Orders', icon: 'i-lucide-shopping-cart', count: orderCount.value },
  { key: 'invoices', label: 'Invoices', icon: 'i-lucide-receipt', count: invoices.value.length }
])

type InvoiceTrendPoint = {
  month: string
  monthKey: string
  amount: number
  count: number
}

const INVOICE_TREND_MONTHS = 6

const parseInvoiceDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getMonthKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const formatMonthLabel = (monthKey: string) => {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
}

const getRecentMonthKeys = (count: number) => {
  const currentMonth = new Date()
  currentMonth.setDate(1)
  currentMonth.setHours(0, 0, 0, 0)

  return Array.from({ length: count }, (_, idx) => {
    const date = new Date(currentMonth)
    date.setMonth(currentMonth.getMonth() - (count - idx - 1))
    return getMonthKey(date)
  })
}

// Receivables pipeline — group invoices by due month and bucket into paid/pending/at-risk.
const invoiceTrendData = computed<InvoiceTrendPoint[]>(() => {
  const monthKeys = getRecentMonthKeys(INVOICE_TREND_MONTHS)

  const byMonth = new Map<string, Omit<InvoiceTrendPoint, 'month' | 'monthKey'>>()

  invoices.value.forEach((invoice) => {
    const createdAt = parseInvoiceDate(invoice.created_at)
    if (!createdAt) return

    const monthKey = getMonthKey(createdAt)
    const amount = Number(invoice.total_amount) || 0

    const existing = byMonth.get(monthKey) || {
      amount: 0,
      count: 0
    }

    existing.amount += amount
    existing.count += 1

    byMonth.set(monthKey, existing)
  })

  return monthKeys.map((monthKey) => {
    const data = byMonth.get(monthKey) || { amount: 0, count: 0 }

    return {
      month: formatMonthLabel(monthKey),
      monthKey,
      ...data
    }
  })
})

// Chart accessors
const trendX = (_: InvoiceTrendPoint, i: number) => i
const trendY = (d: InvoiceTrendPoint) => d.amount
const trendTemplate = (d: InvoiceTrendPoint) =>
  d.count
    ? `${d.month}: ${formatMoney(d.amount)} across ${d.count} ${d.count === 1 ? 'invoice' : 'invoices'}`
    : `${d.month}: No invoices yet`

// Invoice status distribution
const invoiceStatusBreakdown = computed(() => {
  const billable = dashboardInvoiceStageSummary.value.billable.count
  const pending = dashboardInvoiceStageSummary.value.pending.count
  const paid = dashboardInvoiceStageSummary.value.paid.count
  const chargeback = dashboardInvoiceStageSummary.value.chargeback.count
  const total = invoices.value.length || 1
  return [
    { label: 'Billable', count: billable, pct: Math.round((billable / total) * 100), color: 'bg-blue-400', text: 'text-blue-400' },
    { label: 'Pending', count: pending, pct: Math.round((pending / total) * 100), color: 'bg-amber-400', text: 'text-amber-400' },
    { label: 'Paid', count: paid, pct: Math.round((paid / total) * 100), color: 'bg-green-400', text: 'text-green-400' },
    { label: 'Chargeback', count: chargeback, pct: Math.round((chargeback / total) * 100), color: 'bg-red-400', text: 'text-red-400' }
  ]
})

// Fulfillment stats
const totalQuota = computed(() => orderQuotaTotal.value)
const filledQuota = computed(() => orderQuotaFilled.value)

const trendChartMax = computed(() => {
  return Math.max(...invoiceTrendData.value.map(point => point.amount), 1)
})

const monthGrowth = computed(() => {
  const lastIndex = invoiceTrendData.value.length - 1
  const prev = lastIndex > 0 ? invoiceTrendData.value[lastIndex - 1]?.amount ?? 0 : 0
  const curr = lastIndex >= 0 ? invoiceTrendData.value[lastIndex]?.amount ?? 0 : 0

  if (!prev) return curr > 0 ? 100 : 0
  if (curr === prev) return 0
  return Math.round(((curr - prev) / prev) * 100)
})

const showMonthGrowth = computed(() =>
  invoiceTrendData.value.slice(-2).some(point => point.count > 0)
)
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            size="sm"
            :loading="loading"
            class="rounded-lg"
            @click="load"
          />

          <!-- Notifications panel – commented out for later use
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>
          -->

          <UDropdownMenu :items="items">
            <UButton icon="i-lucide-plus" size="md" class="rounded-full" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- ═══ KPI Strip ═══ -->
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4 kpi-strip">
          <div class="ap-fade-in">
            <DashboardMetricCard
              title="Retainers"
              :value="retainerCount"
              icon="i-lucide-briefcase"
              accent="orange-light"
              :loading="loading"
              :hint-title="dashboardHints.retainersCard.title"
              :hint-description="dashboardHints.retainersCard.description"
              :hint-guide-target="dashboardHints.retainersCard.guideTarget"
              clickable
              @click="router.push('/retainers')"
            >
              <div class="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <UIcon name="i-lucide-arrow-right" class="text-[10px] transition-transform duration-200 group-hover:translate-x-0.5" />
                <span class="group-hover:text-orange-400 transition-colors">View all retainers</span>
              </div>
            </DashboardMetricCard>
          </div>

          <div class="ap-fade-in ap-delay-1">
            <DashboardMetricCard
              title="Active Orders"
              :value="orderCount"
              icon="i-lucide-shopping-cart"
              accent="blue"
              :loading="loading"
              :progress="fulfillmentPercent"
              progress-label="Fulfillment"
              :hint-title="dashboardHints.activeOrdersCard.title"
              :hint-description="dashboardHints.activeOrdersCard.description"
              :hint-guide-target="dashboardHints.activeOrdersCard.guideTarget"
              clickable
              @click="router.push('/fulfillment')"
            />
          </div>

          <div class="ap-fade-in ap-delay-2">
            <DashboardMetricCard
              title="Total Invoiced"
              :value="formatMoney(totalInvoiced)"
              icon="i-lucide-circle-dollar-sign"
              accent="green"
              :loading="loading"
              :hint-title="dashboardHints.totalInvoicedCard.title"
              :hint-description="dashboardHints.totalInvoicedCard.description"
              :hint-guide-target="dashboardHints.totalInvoicedCard.guideTarget"
              clickable
              @click="router.push('/invoicing')"
            >
              <div class="mt-3 flex items-center gap-3 text-xs">
                <span class="text-green-500 dark:text-green-400">{{ formatMoney(paidInvoiceAmount) }} paid</span>
                <span class="text-muted">·</span>
                <span class="text-amber-500 dark:text-amber-400">{{ formatMoney(pendingInvoiceAmount) }} pending</span>
              </div>
            </DashboardMetricCard>
          </div>

          <div class="ap-fade-in ap-delay-3">
            <DashboardMetricCard
              title="Pending Invoices"
              :value="pendingReviewInvoiceCount"
              icon="i-lucide-clock"
              accent="amber"
              :loading="loading"
              :hint-title="dashboardHints.pendingInvoicesCard.title"
              :hint-description="dashboardHints.pendingInvoicesCard.description"
              :hint-guide-target="dashboardHints.pendingInvoicesCard.guideTarget"
              clickable
              @click="router.push('/invoicing')"
            >
              <div class="mt-3 flex items-center gap-1.5 text-xs text-muted">
                <UIcon name="i-lucide-arrow-right" class="text-[10px] transition-transform duration-200 group-hover:translate-x-0.5" />
                <span class="group-hover:text-amber-400 transition-colors">Review invoices</span>
              </div>
            </DashboardMetricCard>
          </div>
        </div>

        <!-- ═══ Main Row — Trend Chart + Action Center ═══ -->
        <div class="grid gap-5 lg:grid-cols-3">
          <!-- Invoice Trend -->
          <div class="lg:col-span-2 ap-fade-in ap-delay-4 flex flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
            <div class="flex flex-col gap-4 border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-trending-up" class="text-sm text-[var(--ap-accent)]" />
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <h3 class="text-sm font-semibold text-highlighted">Invoice Trend</h3>
                    <ProductGuideHint
                      :title="dashboardHints.invoiceTrend.title"
                      :description="dashboardHints.invoiceTrend.description"
                      :guide-target="dashboardHints.invoiceTrend.guideTarget"
                    />
                  </div>
                  <p class="text-[11px] text-muted">Last 6 months</p>
                </div>
              </div>

              <!-- Month-over-month growth -->
              <div
                v-if="showMonthGrowth"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 xl:justify-end"
                :class="monthGrowth >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'"
              >
                <UIcon
                  :name="monthGrowth >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
                  class="text-sm"
                  :class="monthGrowth >= 0 ? 'text-green-400' : 'text-red-400'"
                />
                <span
                  class="text-xs font-semibold tabular-nums"
                  :class="monthGrowth >= 0 ? 'text-green-400' : 'text-red-400'"
                >
                  {{ monthGrowth > 0 ? '+' : '' }}{{ monthGrowth }}%
                </span>
                <span class="text-[10px] text-muted">vs last month</span>
              </div>
            </div>

            <div v-if="loading" class="flex flex-1 items-center justify-center p-16">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-[var(--ap-accent)]" />
            </div>
            <div v-else class="flex flex-1 flex-col">
              <!-- Chart area — grows to fill available space -->
              <div class="flex-1 min-h-[200px] pt-13.5">
                <svg class="absolute" width="0" height="0">
                  <defs>
                    <linearGradient
                      id="invoiceTrendGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stop-color="#ae4010" stop-opacity="0.24" />
                      <stop offset="100%" stop-color="#ae4010" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                </svg>

                <div class="h-full">
                  <VisXYContainer
                    :data="invoiceTrendData"
                    :padding="{ top: 16, bottom: 0, left: 0, right: 0 }"
                    :y-domain="[0, trendChartMax]"
                    :prevent-empty-domain="true"
                  >
                    <VisArea
                      :x="trendX"
                      :y="trendY"
                      color="url(#invoiceTrendGradient)"
                      :opacity="1"
                      :curve-type="'monotoneX'"
                    />
                    <VisLine
                      :x="trendX"
                      :y="trendY"
                      color="var(--ap-accent)"
                      :line-width="2"
                      :curve-type="'monotoneX'"
                    />
                    <VisCrosshair
                      :template="trendTemplate"
                      color="var(--ap-accent)"
                    />
                    <VisTooltip />
                  </VisXYContainer>
                </div>
              </div>

              <!-- Monthly strip — pinned to bottom of card -->
              <div
                class="grid border-t border-black/[0.04] bg-white/90 dark:border-white/[0.04] dark:bg-[#1a1a1a]/60"
                :style="{ gridTemplateColumns: `repeat(${invoiceTrendData.length}, minmax(0, 1fr))` }"
              >
                <div
                  v-for="(point, idx) in invoiceTrendData"
                  :key="point.monthKey"
                  class="flex flex-col items-center gap-1 py-3 transition-colors duration-150 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  :class="idx < invoiceTrendData.length - 1 ? 'border-r border-black/[0.04] dark:border-white/[0.04]' : ''"
                >
                  <span class="text-[10px] font-medium uppercase tracking-wider text-muted">{{ point.month }}</span>
                  <span class="text-[12px] font-semibold text-[var(--ap-accent)] tabular-nums">
                    {{ formatMoney(point.amount) }}
                  </span>
                  <span
                    class="text-[10px]"
                    :class="point.count ? 'text-muted' : 'text-muted/75 italic'"
                  >
                    {{ point.count ? `${point.count} ${point.count === 1 ? 'invoice' : 'invoices'}` : 'No invoices yet' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Center + Distribution -->
          <div class="ap-fade-in ap-delay-5 flex flex-col gap-5">
            <!-- Quick Actions -->
            <div class="overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm p-5">
              <div class="mb-4 flex items-center gap-1.5">
                <h3 class="text-sm font-semibold text-highlighted">Quick Actions</h3>
                <ProductGuideHint
                  :title="dashboardHints.quickActions.title"
                  :description="dashboardHints.quickActions.description"
                  :guide-target="dashboardHints.quickActions.guideTarget"
                />
              </div>
              <div class="space-y-2.5">
                <button
                  class="flex w-full items-center gap-3 rounded-lg border border-[var(--ap-accent)]/15 px-3.5 py-3 text-sm text-left transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.06] hover:border-[var(--ap-accent)]/30 group"
                  @click="router.push('/intake-map?action=create-order')"
                >
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10 transition-colors group-hover:bg-[var(--ap-accent)]/20">
                    <UIcon name="i-lucide-plus" class="text-sm text-[var(--ap-accent)]" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <span class="font-medium text-highlighted text-[13px]">Place New Order</span>
                    <p class="text-[11px] text-muted mt-0.5">
                      Create a new case order
                    </p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="text-xs text-muted/50 transition-all duration-200 group-hover:text-[var(--ap-accent)] group-hover:translate-x-0.5" />
                </button>
                <button
                  v-if="isAdminOrSuper"
                  class="flex w-full items-center gap-3 rounded-lg border border-amber-400/15 px-3.5 py-3 text-sm text-left transition-all duration-200 hover:bg-amber-500/[0.06] hover:border-amber-400/30 group"
                  @click="router.push('/invoicing/create')"
                >
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 transition-colors group-hover:bg-amber-500/20">
                    <UIcon name="i-lucide-receipt" class="text-sm text-amber-400" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <span class="font-medium text-highlighted text-[13px]">Create Invoice</span>
                    <p class="text-[11px] text-muted mt-0.5">
                      Generate a new invoice
                    </p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="text-xs text-muted/50 transition-all duration-200 group-hover:text-amber-400 group-hover:translate-x-0.5" />
                </button>
                <button
                  class="flex w-full items-center gap-3 rounded-lg border border-orange-300/15 dark:border-orange-400/15 px-3.5 py-3 text-sm text-left transition-all duration-200 hover:bg-orange-400/[0.06] hover:border-orange-300/30 dark:hover:border-orange-400/30 group"
                  @click="router.push('/retainers')"
                >
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-400/10 transition-colors group-hover:bg-orange-400/20">
                    <UIcon name="i-lucide-briefcase" class="text-sm text-orange-400" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <span class="font-medium text-highlighted text-[13px]">View Retainers</span>
                    <p class="text-[11px] text-muted mt-0.5">
                      Browse your case retainers
                    </p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="text-xs text-muted/50 transition-all duration-200 group-hover:text-orange-400 group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>

            <!-- Invoice Breakdown -->
            <div class="overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm p-5">
              <div class="mb-4 flex items-center justify-between gap-3">
                <div class="flex items-center gap-1.5">
                  <h3 class="text-sm font-semibold text-highlighted">Invoice Breakdown</h3>
                  <ProductGuideHint
                    :title="dashboardHints.invoiceBreakdown.title"
                    :description="dashboardHints.invoiceBreakdown.description"
                    :guide-target="dashboardHints.invoiceBreakdown.guideTarget"
                  />
                </div>
                <span class="inline-flex items-center rounded-lg bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold text-muted dark:bg-white/[0.06]">
                  {{ invoices.length }} total
                </span>
              </div>

              <!-- Status bar -->
              <div v-if="invoices.length" class="flex h-2 w-full overflow-hidden rounded-full mb-4">
                <div
                  v-for="seg in invoiceStatusBreakdown"
                  :key="seg.label"
                  :class="seg.color"
                  :style="{ width: `${seg.pct}%` }"
                  class="transition-all duration-500"
                />
              </div>

              <div class="space-y-3">
                <div
                  v-for="seg in invoiceStatusBreakdown"
                  :key="seg.label"
                  class="flex items-center justify-between"
                >
                  <div class="flex items-center gap-2">
                    <div class="h-2.5 w-2.5 rounded-full" :class="seg.color" />
                    <span class="text-xs text-muted">{{ seg.label }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold" :class="seg.text">{{ seg.count }}</span>
                    <span class="text-[10px] text-muted">({{ seg.pct }}%)</span>
                  </div>
                </div>
              </div>

              <!-- Fulfillment summary -->
              <div v-if="orders.length" class="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-muted">Order Fulfillment</span>
                  <span class="text-xs font-semibold text-highlighted">{{ filledQuota }}/{{ totalQuota }}</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <div
                    class="h-full rounded-full bg-[var(--ap-accent)] transition-all duration-700 ease-out"
                    :style="{ width: `${fulfillmentPercent}%` }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Tabbed Workbench ═══ -->
        <div class="ap-fade-in ap-delay-6 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <!-- Tab Header -->
          <div class="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5">
            <div class="flex items-center gap-4">
              <div class="hidden sm:flex items-center gap-1.5">
                <span class="text-xs font-semibold uppercase tracking-wider text-muted">Workbench</span>
                <ProductGuideHint
                  :title="dashboardHints.workbench.title"
                  :description="dashboardHints.workbench.description"
                  :guide-target="dashboardHints.workbench.guideTarget"
                />
              </div>
              <div class="flex items-center gap-1 -mb-px">
              <button
                v-for="tab in workbenchTabs"
                :key="tab.key"
                class="relative flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors duration-200"
                :class="activeWorkbenchTab === tab.key
                  ? 'text-[var(--ap-accent)]'
                  : 'text-muted hover:text-highlighted'"
                @click="activeWorkbenchTab = tab.key"
              >
                <UIcon :name="tab.icon" class="text-sm" />
                <span>{{ tab.label }}</span>
                <span
                  class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold"
                  :class="activeWorkbenchTab === tab.key
                    ? 'bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]'
                    : 'bg-black/[0.04] dark:bg-white/[0.04] text-muted'"
                >
                  {{ tab.count }}
                </span>
                <!-- Active indicator -->
                <div
                  v-if="activeWorkbenchTab === tab.key"
                  class="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-[var(--ap-accent)]"
                />
              </button>
              </div>
            </div>

            <button
              class="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)]"
              @click="router.push(
                activeWorkbenchTab === 'retainers' ? '/retainers'
                : activeWorkbenchTab === 'orders' ? '/fulfillment'
                  : '/invoicing'
              )"
            >
              See All
              <UIcon name="i-lucide-arrow-right" class="text-[10px]" />
            </button>
          </div>

          <!-- Loading State -->
          <div v-if="loading" class="flex items-center justify-center p-16">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-[var(--ap-accent)]" />
          </div>

          <!-- ── Retainers Tab ── -->
          <template v-else-if="activeWorkbenchTab === 'retainers'">
            <div v-if="!retainers.length" class="flex items-center justify-center p-16">
              <div class="text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 mb-3">
                  <UIcon name="i-lucide-inbox" class="text-xl text-[var(--ap-accent)]/50" />
                </div>
                <p class="text-sm text-muted">
                  No retainers found
                </p>
              </div>
            </div>
            <div v-else class="overflow-auto dash-scroll">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-black/[0.04] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01]">
                    <th class="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Client
                    </th>
                    <th class="hidden px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted sm:table-cell">
                      Phone
                    </th>
                    <th class="hidden px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted sm:table-cell">
                      Status
                    </th>
                    <th class="px-5 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Invoice
                    </th>
                    <th class="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, idx) in retainers"
                    :key="row.id"
                    class="ap-fade-in-row group cursor-pointer border-b border-black/[0.03] dark:border-white/[0.03] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.05]"
                    :style="{ animationDelay: `${idx * 60}ms` }"
                    @click="openRetainer(row)"
                  >
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-[10px] font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10">
                          {{ getInitials(row.insured_name) }}
                        </div>
                        <div class="min-w-0">
                          <div class="text-sm font-medium text-highlighted truncate max-w-[160px] group-hover:text-[var(--ap-accent)] transition-colors">
                            {{ row.insured_name ?? 'Unknown' }}
                          </div>
                          <div class="mt-0.5 flex flex-col items-start gap-1 text-[11px] text-muted sm:hidden">
                            <span class="tabular-nums">{{ formatPhone(row.client_phone_number) }}</span>
                            <span
                              v-if="getFulfillmentRetainerStatusLabel(row.status)"
                              class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                              :class="getRetainerStatusStyle(getFulfillmentRetainerStatusLabel(row.status))"
                            >
                              {{ getFulfillmentRetainerStatusLabel(row.status) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="hidden px-5 py-3 sm:table-cell">
                      <span class="text-sm text-default tabular-nums">{{ formatPhone(row.client_phone_number) }}</span>
                    </td>
                    <td class="hidden px-5 py-3 sm:table-cell">
                      <span
                        v-if="getFulfillmentRetainerStatusLabel(row.status)"
                        class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold"
                        :class="getRetainerStatusStyle(getFulfillmentRetainerStatusLabel(row.status))"
                      >
                        {{ getFulfillmentRetainerStatusLabel(row.status) }}
                      </span>
                      <span v-else class="text-xs text-muted/40">—</span>
                    </td>
                    <td class="px-5 py-3 text-center">
                      <button
                        v-if="row.invoice_id"
                        class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 transition-all hover:bg-amber-500/20 hover:scale-110"
                        title="View linked invoice"
                        @click.stop="openRetainerInvoice(row)"
                      >
                        <UIcon name="i-lucide-receipt" class="text-sm" />
                      </button>
                      <span v-else class="text-xs text-muted/40">—</span>
                    </td>
                    <td class="px-5 py-3 text-right">
                      <UIcon name="i-lucide-chevron-right" class="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- ── Orders Tab ── -->
          <template v-else-if="activeWorkbenchTab === 'orders'">
            <div v-if="!orders.length" class="flex items-center justify-center p-16">
              <div class="text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 mb-3">
                  <UIcon name="i-lucide-shopping-cart" class="text-xl text-[var(--ap-accent)]/50" />
                </div>
                <p class="text-sm text-muted">
                  No orders placed yet
                </p>
              </div>
            </div>
            <div v-else class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div
                v-for="(order, idx) in orders"
                :key="order.id"
                class="ap-fade-in group cursor-pointer rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#1a1a1a]/40 p-4 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-white dark:hover:bg-[#1f1f1f] hover:shadow-md"
                :style="{ animationDelay: `${idx * 80}ms` }"
                @click="openOrder(order)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-highlighted truncate group-hover:text-[var(--ap-accent)] transition-colors">
                      {{ order.case_type }}
                    </p>
                    <p class="mt-0.5 text-[11px] text-muted">
                      {{ (order.target_states || []).map(s => s.toUpperCase()).join(', ') || '—' }}
                    </p>
                  </div>
                  <span
                    class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="getOrderStatusColor(getOrderDisplayStatus(order))"
                  >
                    {{ getOrderDisplayStatus(order) }}
                  </span>
                </div>

                <div class="mt-3">
                  <div class="flex items-center justify-between text-[11px] mb-1">
                    <span class="text-muted">{{ order.quota_filled }}/{{ order.quota_total }} filled</span>
                    <span class="font-semibold" :class="orderFillPercent(order) >= 100 ? 'text-green-400' : 'text-[var(--ap-accent)]'">
                      {{ orderFillPercent(order) }}%
                    </span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="orderFillPercent(order) >= 100 ? 'bg-green-400' : 'bg-[var(--ap-accent)]'"
                      :style="{ width: `${Math.min(orderFillPercent(order), 100)}%` }"
                    />
                  </div>
                </div>

                <div class="mt-2.5 flex items-center justify-between text-[11px] text-muted">
                  <span>Created {{ formatDate(order.created_at) }}</span>
                  <span>Exp. {{ formatDate(order.expires_at) }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- ── Invoices Tab ── -->
          <template v-else-if="activeWorkbenchTab === 'invoices'">
            <div v-if="!invoices.length" class="flex items-center justify-center p-16">
              <div class="text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 mb-3">
                  <UIcon name="i-lucide-receipt" class="text-xl text-amber-400/50" />
                </div>
                <p class="text-sm text-muted">
                  No invoices yet
                </p>
                <UButton
                  v-if="isAdminOrSuper"
                  color="primary"
                  size="xs"
                  class="mt-3"
                  icon="i-lucide-plus"
                  @click="router.push('/invoicing/create')"
                >
                  Create Invoice
                </UButton>
              </div>
            </div>
            <div v-else class="overflow-auto dash-scroll">
              <div class="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                <div
                  v-for="(inv, idx) in latestInvoices"
                  :key="inv.id"
                  class="ap-fade-in-row group flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-all duration-200 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                  :style="{ animationDelay: `${idx * 60}ms` }"
                  @click="openInvoicePdf(inv)"
                >
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="getStatusBg(inv.status)">
                    <UIcon :name="getStatusIcon(inv.status)" class="text-sm" :class="getStatusColor(inv.status)" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-sm font-semibold text-highlighted truncate group-hover:text-[var(--ap-accent)] transition-colors">
                        {{ inv.invoice_number }}
                      </span>
                      <span class="text-sm font-bold text-highlighted shrink-0">{{ formatMoney(Number(inv.total_amount)) }}</span>
                    </div>
                    <div class="mt-0.5 flex items-center justify-between gap-2">
                      <span v-if="isAdminOrSuper && inv.lawyer_name" class="text-[11px] text-muted truncate">{{ inv.lawyer_name }}</span>
                      <span v-else class="text-[11px] text-muted">{{ formatDate(inv.due_date) }}</span>
                      <span
                        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                        :class="[getStatusBg(inv.status), getStatusColor(inv.status)]"
                      >
                        {{ getStatusLabel(inv.status) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Quick Create -->
              <div v-if="isAdminOrSuper" class="border-t border-black/[0.06] dark:border-white/[0.06] px-5 py-3">
                <button
                  class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] px-3 py-2.5 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.05] hover:text-[var(--ap-accent)]"
                  @click="router.push('/invoicing/create')"
                >
                  <UIcon name="i-lucide-plus" class="text-sm" />
                  Create Invoice
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* ── KPI strip: force equal-height cards ── */
.kpi-strip > div {
  display: flex;
}
.kpi-strip > div > * {
  flex: 1;
}


/* ── Scrollbar ── */
.dash-scroll::-webkit-scrollbar {
  width: 4px;
}
.dash-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.dash-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.15);
  border-radius: 999px;
}
.dash-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.25);
}
</style>
