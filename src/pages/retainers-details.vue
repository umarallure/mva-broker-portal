<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LeadDocumentsTab from '../components/LeadDocumentsTab.vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = Record<string, unknown> & {
  id: string
  daily_deal_flow_id?: string | null
  submission_id: string
  insured_name?: string | null
  client_phone_number?: string | null
  assigned_attorney_id?: string | null
  assigned_broker_attorney_id?: string | null
  lead_vendor?: string | null
  invoice_id?: string | null
  publisher_invoice_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type AnyRow = Record<string, unknown>

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const id = computed(() => route.params.id as string)

const isAdminOrSuper = computed(() => {
  const role = auth.state.value.profile?.role
  return role === 'admin' || role === 'super_admin' || role === 'accounts'
})

const loading = ref(false)
const error = ref<string | null>(null)
const row = ref<DailyDealFlow | null>(null)
const centerLookupId = ref<string | null>(null)
const actionLoading = ref(false)

const activeTab = ref('basic')

const tabs = [
  { label: 'Personal Information', icon: 'i-lucide-user', value: 'basic' },
  { label: 'Accident Details', icon: 'i-lucide-car', value: 'accident' },
  { label: 'Documents', icon: 'i-lucide-folder-open', value: 'documents' },
]

const headerTitle = computed(() => {
  if (!row.value) return 'Lead details'
  const name = row.value.insured_name || 'Unknown'
  const phone = row.value.client_phone_number || 'N/A'
  return `${name} - ${phone}`
})

const payToPublisher = async () => {
  if (!row.value) return
  actionLoading.value = true
  try {
    // Look up the center by lead_vendor text to get its UUID
    let centerId = centerLookupId.value
    if (!centerId && row.value.lead_vendor) {
      const { data } = await supabase
        .from('centers')
        .select('id')
        .eq('lead_vendor', row.value.lead_vendor)
        .maybeSingle()
      centerId = data?.id ?? null
      centerLookupId.value = centerId
    }
    const params = new URLSearchParams({ mode: 'publisher', quick: '1' })
    if (centerId) params.set('center_id', centerId)
    params.set('deal_id', getCurrentDealId())
    router.push(`/invoicing/create?${params.toString()}`)
  } finally {
    actionLoading.value = false
  }
}

const getPaidByLawyer = () => {
  if (!row.value) return
  const params = new URLSearchParams({ mode: 'lawyer', quick: '1' })
  if (row.value.assigned_attorney_id) params.set('lawyer_id', row.value.assigned_attorney_id)
  params.set('deal_id', getCurrentDealId())
  router.push(`/invoicing/create?${params.toString()}`)
}

const goBack = () => {
  const from = String(route.query.from ?? '').trim()
  if (from) {
    router.push(from)
    return
  }

  if (window.history.length > 1) {
    router.back()
    return
  }

  router.push('/retainers')
}

const stringOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

const mapLeadToDetailRow = (leadRow: AnyRow, dealFlowRow?: AnyRow | null): DailyDealFlow => {
  const name = leadRow.customer_full_name ?? leadRow.insured_name ?? null
  const phone = leadRow.phone_number ?? leadRow.client_phone_number ?? null
  const submissionId = stringOrNull(leadRow.submission_id ?? dealFlowRow?.submission_id) ?? ''
  const leadVendor = stringOrNull(leadRow.lead_vendor ?? dealFlowRow?.lead_vendor)
  const createdAt = stringOrNull(leadRow.created_at ?? dealFlowRow?.created_at)
  const updatedAt = stringOrNull(leadRow.updated_at ?? dealFlowRow?.updated_at)

  return {
    ...(dealFlowRow ?? {}),
    ...leadRow,
    id: String(leadRow.id ?? ''),
    daily_deal_flow_id: stringOrNull(dealFlowRow?.id),
    submission_id: submissionId,
    insured_name: name ? String(name) : null,
    client_phone_number: phone ? String(phone) : null,
    assigned_attorney_id: stringOrNull(leadRow.assigned_attorney_id ?? dealFlowRow?.assigned_attorney_id),
    assigned_broker_attorney_id: stringOrNull(leadRow.assigned_broker_attorney_id ?? dealFlowRow?.assigned_broker_attorney_id),
    lead_vendor: leadVendor,
    invoice_id: stringOrNull(dealFlowRow?.invoice_id),
    publisher_invoice_id: stringOrNull(dealFlowRow?.publisher_invoice_id),
    created_at: createdAt,
    updated_at: updatedAt
  }
}

const getCurrentDealId = () => {
  if (!row.value) return ''
  return String(row.value.daily_deal_flow_id ?? row.value.id ?? '')
}

const loadDealFlowBySubmission = async (submissionId: string | null) => {
  if (!submissionId) return null

  const { data, error: dealFlowError } = await supabase
    .from('daily_deal_flow')
    .select('*')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (dealFlowError) throw dealFlowError

  return (data ?? null) as AnyRow | null
}

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.profile?.user_id
    const userRole = auth.state.value.profile?.role

    if (userRole === 'broker' && !userId) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    if (userRole === 'broker' && userId) {
      const { data: brokerAttorneyRows, error: brokerAttorneyError } = await supabase
        .from('broker_attorneys')
        .select('id')
        .eq('broker_id', userId)

      if (brokerAttorneyError) throw brokerAttorneyError

      const brokerAttorneyIds = ((brokerAttorneyRows ?? []) as Array<{ id: string | null }>)
        .map(row => row.id)
        .filter((attorneyId): attorneyId is string => Boolean(attorneyId))

      if (brokerAttorneyIds.length === 0) {
        error.value = 'Lead not found'
        row.value = null
        return
      }

      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id.value)
        .eq('is_active', true)
        .in('assigned_broker_attorney_id', brokerAttorneyIds)
        .maybeSingle()

      if (leadErr) throw leadErr

      if (!leadRow) {
        error.value = 'Lead not found'
        row.value = null
        return
      }

      const lead = (leadRow ?? {}) as AnyRow
      const dealFlowRow = await loadDealFlowBySubmission(stringOrNull(lead.submission_id))
      row.value = mapLeadToDetailRow(lead, dealFlowRow)
      return
    }

    // For lawyers, build name keywords for fallback matching
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
      const emailName = email ? email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim() : null

      const rawName = fullName || displayName || emailName || ''
      nameKeywords = rawName
        .split(/[\s\-_]+/)
        .map((w: string) => w.trim().toLowerCase())
        .filter((w: string) => w.length >= 3)
    }

    if (userRole && userRole !== 'lawyer') {
      const { data: leadById, error: leadByIdErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id.value)
        .maybeSingle()

      if (leadByIdErr) throw leadByIdErr

      if (leadById) {
        const lead = (leadById ?? {}) as AnyRow
        const dealFlowRow = await loadDealFlowBySubmission(stringOrNull(lead.submission_id))
        row.value = mapLeadToDetailRow(lead, dealFlowRow)
        return
      }
    }

    let data = null

    if (userRole === 'lawyer' && userId) {
      // First try by assigned_attorney_id
      const { data: byId, error: byIdErr } = await supabase
        .from('daily_deal_flow')
        .select('*')
        .eq('id', id.value)
        .eq('assigned_attorney_id', userId)
        .maybeSingle()

      if (byIdErr) throw byIdErr
      data = byId

      // Fallback: match by any name keyword in submitted_attorney
      if (!data && nameKeywords.length > 0) {
        const orFilter = nameKeywords
          .map((kw: string) => `submitted_attorney.ilike.%${kw}%`)
          .join(',')

        const { data: byName, error: byNameErr } = await supabase
          .from('daily_deal_flow')
          .select('*')
          .eq('id', id.value)
          .or(orFilter)
          .maybeSingle()

        if (byNameErr) throw byNameErr
        data = byName
      }
    } else if (!userRole) {
      // If no role, filter by lead vendor matching user's center
      const { data: userData, error: userErr } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId || '')
        .maybeSingle()

      if (userErr) throw userErr

      if (userData?.center_id) {
        const { data: centerData, error: centerErr } = await supabase
          .from('centers')
          .select('lead_vendor')
          .eq('id', userData.center_id)
          .maybeSingle()

        if (centerErr) throw centerErr

        if (centerData?.lead_vendor) {
          const { data: vendorData, error: vendorErr } = await supabase
            .from('daily_deal_flow')
            .select('*')
            .eq('id', id.value)
            .eq('lead_vendor', centerData.lead_vendor)
            .maybeSingle()

          if (vendorErr) throw vendorErr
          data = vendorData
        } else {
          error.value = 'Lead not found'
          row.value = null
          return
        }
      } else {
        error.value = 'Lead not found'
        row.value = null
        return
      }
    } else {
      // Admin and agent roles can view all leads (no filter)
      const { data: allData, error: allErr } = await supabase
        .from('daily_deal_flow')
        .select('*')
        .eq('id', id.value)
        .maybeSingle()

      if (allErr) throw allErr
      data = allData
    }

    if (!data) {
      let leadsQb = supabase
        .from('leads')
        .select('*')
        .eq('id', id.value)

      if (userRole === 'lawyer' && userId) {
        leadsQb = leadsQb.eq('assigned_attorney_id', userId)
      }

      const { data: leadRow, error: leadErr } = await leadsQb.maybeSingle()
      if (leadErr) throw leadErr

      if (!leadRow) {
        error.value = 'Lead not found'
        row.value = null
        return
      }

      const lead = (leadRow ?? {}) as AnyRow
      const dealFlowRow = await loadDealFlowBySubmission(stringOrNull(lead.submission_id))
      row.value = mapLeadToDetailRow(lead, dealFlowRow)
    } else {
      const flow = (data ?? {}) as AnyRow
      const submissionId = stringOrNull(flow.submission_id)

      if (submissionId) {
        let leadBySubmissionQb = supabase
          .from('leads')
          .select('*')
          .eq('submission_id', submissionId)

        if (userRole === 'lawyer' && userId) {
          leadBySubmissionQb = leadBySubmissionQb.eq('assigned_attorney_id', userId)
        }

        const { data: leadBySubmission, error: leadBySubmissionErr } = await leadBySubmissionQb.maybeSingle()
        if (leadBySubmissionErr) throw leadBySubmissionErr

        if (leadBySubmission) {
          row.value = mapLeadToDetailRow((leadBySubmission ?? {}) as AnyRow, flow)
          return
        }
      }

      row.value = {
        ...flow,
        id: String(flow.id ?? ''),
        submission_id: submissionId ?? ''
      } as DailyDealFlow
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load lead'
    error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
}

function formatFieldValue(key: string, value: unknown) {
  if (key === 'created_at' || key === 'updated_at' || key.endsWith('_at')) {
    return formatDateTime(typeof value === 'string' ? value : null)
  }

  if (key === 'date' || key.endsWith('_date')) {
    return formatDateOnly(typeof value === 'string' ? value : null)
  }

  return formatValue(value)
}

const formatPhoneNumber = (value: string | null | undefined) => {
  if (!value) return '-'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return value
}

const getInitials = (name: string | null | undefined) => {
  if (!name) return '?'
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const formatStatusLabel = (value: unknown) => {
  const status = String(value ?? '').trim()
  if (!status) return '-'
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

const statusPillClass = computed(() => {
  const status = String(row.value?.status ?? '').toLowerCase()
  if (status.includes('approved') || status.includes('payable') || status.includes('qualified')) {
    return 'border-green-500/25 bg-green-500/10 text-green-600 dark:text-green-400'
  }
  if (status.includes('rejected') || status.includes('declined')) {
    return 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400'
  }
  if (status.includes('review')) {
    return 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400'
  }
  return 'border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] text-muted'
})

const leadName = computed(() => row.value?.insured_name || 'Unknown Client')
const createdDateLabel = computed(() => formatDateTime(row.value?.created_at))

const leadContactSummary = computed(() => {
  if (!row.value) return []
  return [
    { icon: 'i-lucide-phone', label: formatPhoneNumber(row.value.client_phone_number) },
    { icon: 'i-lucide-mail', label: formatValue(row.value.email) },
    { icon: 'i-lucide-map-pin', label: formatValue(row.value.state) }
  ].filter(item => item.label !== '-')
})

const basicInfoFields = computed(() => {
  if (!row.value) return []
  return [
    ['insured_name', 'Client Name', 'i-lucide-user'],
    ['client_phone_number', 'Phone Number', 'i-lucide-phone'],
    ['email', 'Email', 'i-lucide-mail'],
    ['street_address', 'Address', 'i-lucide-map'],
    ['city', 'City', 'i-lucide-building'],
    ['state', 'State', 'i-lucide-map-pin'],
    ['zip_code', 'Zip Code', 'i-lucide-mailbox']
  ].map(([key, label, icon]) => {
    return { key, label, icon, value: (row.value as Record<string, unknown>)[key] }
  })
})

const accidentDetailsFields = computed(() => {
  if (!row.value) return []
  return [
    ['accident_date', 'Accident Date', 'i-lucide-calendar-days'],
    ['accident_location', 'Accident Location', 'i-lucide-map-pinned'],
    ['accident_scenario', 'Accident Scenario', 'i-lucide-file-text'],
    ['was_client_driver', 'Was This Client the Driver?', 'i-lucide-car'],
    ['prior_attorney_involved', 'Prior Attorney Involved', 'i-lucide-scale'],
    ['prior_attorney_details', 'Prior Attorney Details', 'i-lucide-file-user'],
    ['medical_attention', 'Medical Attention', 'i-lucide-heart-pulse'],
    ['police_attended', 'Police Attended', 'i-lucide-shield-check'],
    ['injuries', 'Injuries', 'i-lucide-bandage'],
    ['other_party_admit_fault', 'Other Party Admit Fault', 'i-lucide-message-square-warning'],
    ['passengers_count', 'Passengers Count ("Excluding the Driver")', 'i-lucide-users']
  ].map(([key, label, icon]) => ({ key, label, icon, value: (row.value as Record<string, unknown>)[key] }))
})
</script>

<template>
  <UDashboardPanel id="retainer-details">
    <template #header>
      <UDashboardNavbar :title="headerTitle">
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="goBack"
          >
            Back
          </UButton>
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <template v-if="isAdminOrSuper && row">
              <UButton
                color="info"
                variant="soft"
                icon="i-lucide-send"
                size="sm"
                :disabled="!!row.publisher_invoice_id"
                :title="row.publisher_invoice_id ? 'Already paid to publisher' : 'Pay to Publisher'"
                @click="payToPublisher"
              >
                {{ row.publisher_invoice_id ? 'Paid to Publisher' : 'Pay to Publisher' }}
              </UButton>
              <UButton
                color="primary"
                variant="soft"
                icon="i-lucide-wallet"
                size="sm"
                :disabled="!!row.invoice_id"
                :title="row.invoice_id ? 'Already paid by lawyer' : 'Get Paid by Lawyer'"
                @click="getPaidByLawyer"
              >
                {{ row.invoice_id ? 'Paid by Lawyer' : 'Get Paid by Lawyer' }}
              </UButton>
            </template>
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
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Unable to load lead"
        :description="error"
      />

      <div v-else-if="loading" class="flex h-full min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <div v-else-if="row" class="space-y-5">
        <section class="overflow-hidden rounded-xl border border-[var(--ap-card-border)] bg-white/90 shadow-lg backdrop-blur-sm dark:bg-[#1a1a1a]/60">
          <div class="relative border-b border-[var(--ap-card-border)] px-5 py-5">
            <div class="absolute inset-y-0 left-0 w-1 bg-[var(--ap-accent)]" />
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex min-w-0 items-start gap-4">
                <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--ap-accent)]/25 bg-[var(--ap-accent)]/10 text-lg font-bold text-[var(--ap-accent)]">
                  {{ getInitials(leadName) }}
                </div>
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Lead Information
                  </p>
                  <h2 class="mt-1 truncate text-2xl font-semibold text-highlighted">
                    {{ leadName }}
                  </h2>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="item in leadContactSummary"
                      :key="item.icon"
                      class="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-2.5 py-1 text-xs font-medium text-muted"
                    >
                      <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                      <span class="truncate">{{ item.label }}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                <span
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                  :class="statusPillClass"
                >
                  <UIcon name="i-lucide-activity" class="size-3.5" />
                  {{ formatStatusLabel(row.status) }}
                </span>
                <div
                  v-if="createdDateLabel !== '-'"
                  class="mt-10 flex items-center gap-1.5 text-xs font-medium text-muted"
                >
                  <UIcon name="i-lucide-calendar-clock" class="size-3.5" />
                  <span>Created {{ createdDateLabel }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <UTabs v-model="activeTab" :items="tabs">
          <template #content="{ item }">
            <section
              v-if="item.value === 'basic'"
              class="overflow-hidden rounded-xl border border-[var(--ap-card-border)] bg-white/90 shadow-lg backdrop-blur-sm dark:bg-[#1a1a1a]/60"
            >
              <div class="flex items-center gap-2 border-b border-[var(--ap-card-border)] px-5 py-3">
                <UIcon name="i-lucide-user" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Personal Information
                </h3>
              </div>
              <div class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="field in basicInfoFields"
                  :key="field.key"
                  class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3"
                >
                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <UIcon :name="field.icon" class="size-3.5 shrink-0" />
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </section>

            <section
              v-else-if="item.value === 'accident'"
              class="overflow-hidden rounded-xl border border-[var(--ap-card-border)] bg-white/90 shadow-lg backdrop-blur-sm dark:bg-[#1a1a1a]/60"
            >
              <div class="flex items-center gap-2 border-b border-[var(--ap-card-border)] px-5 py-3">
                <UIcon name="i-lucide-car" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Accident Details
                </h3>
              </div>
              <div class="grid gap-3 p-4 md:grid-cols-2">
                <div
                  v-for="field in accidentDetailsFields"
                  :key="field.key"
                  class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] p-3"
                >
                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <UIcon :name="field.icon" class="size-3.5 shrink-0" />
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </section>

            <section
              v-else-if="item.value === 'documents'"
              class="overflow-hidden rounded-xl border border-[var(--ap-card-border)] bg-white/90 shadow-lg backdrop-blur-sm dark:bg-[#1a1a1a]/60"
            >
              <div class="flex items-center gap-2 border-b border-[var(--ap-card-border)] px-5 py-3">
                <UIcon name="i-lucide-folder-open" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Documents
                </h3>
              </div>
              <div class="p-4">
                <LeadDocumentsTab
                  v-if="row.submission_id"
                  :submission-id="String(row.submission_id || '')"
                />
                <UAlert
                  v-else
                  color="neutral"
                  variant="subtle"
                  title="No submission ID"
                  description="No submission ID available to load documents."
                />
              </div>
            </section>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
