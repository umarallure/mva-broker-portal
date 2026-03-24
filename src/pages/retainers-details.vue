<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LeadDocumentsTab from '../components/LeadDocumentsTab.vue'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = Record<string, unknown> & {
  id: string
  submission_id: string
  insured_name?: string | null
  client_phone_number?: string | null
  assigned_attorney_id?: string | null
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
  { label: 'Basic Information', icon: 'i-lucide-user', value: 'basic' },
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
    params.set('deal_id', row.value.id)
    router.push(`/invoicing/create?${params.toString()}`)
  } finally {
    actionLoading.value = false
  }
}

const getPaidByLawyer = () => {
  if (!row.value) return
  const params = new URLSearchParams({ mode: 'lawyer', quick: '1' })
  if (row.value.assigned_attorney_id) params.set('lawyer_id', row.value.assigned_attorney_id)
  params.set('deal_id', row.value.id)
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

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.profile?.user_id
    const userRole = auth.state.value.profile?.role

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
      const name = lead.customer_full_name ?? lead.insured_name ?? null
      const phone = lead.phone_number ?? lead.client_phone_number ?? null

      row.value = {
        ...lead,
        insured_name: name ? String(name) : null,
        client_phone_number: phone ? String(phone) : null,
        submission_id: String(lead.submission_id ?? '')
      } as DailyDealFlow
    } else {
      row.value = data as DailyDealFlow
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
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
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
  if (!value) return '—'
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

const basicInfoFields = computed(() => {
  if (!row.value) return []
  return [
    ['insured_name', 'Retainer Name'],
    ['client_phone_number', 'Phone Number'],
    ['email', 'Email'],
    ['street_address', 'Address'],
    ['city', 'City'],
    ['state', 'State'],
    ['zip_code', 'Zip Code']
  ].map(([key, label]) => {
    return { key, label, value: (row.value as Record<string, unknown>)[key] }
  })
})

const accidentDetailsFields = computed(() => {
  if (!row.value) return []
  return [
    ['accident_date', 'Accident Date'],
    ['accident_location', 'Accident Location'],
    ['accident_scenario', 'Accident Scenario'],
    ['prior_attorney_involved', 'Prior Attorney Involved'],
    ['prior_attorney_details', 'Prior Attorney Details'],
    ['medical_attention', 'Medical Attention'],
    ['police_attended', 'Police Attended'],
    ['injuries', 'Injuries'],
    ['other_party_admit_fault', 'Other Party Admit Fault'],
    ['passengers_count', 'Passengers Count']
  ].map(([key, label]) => ({ key, label, value: (row.value as Record<string, unknown>)[key] }))
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

      <div v-else-if="row" class="space-y-4">
        <UTabs v-model="activeTab" :items="tabs">
          <template #content="{ item }">
            <UCard v-if="item.value === 'basic'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in basicInfoFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'accident'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in accidentDetailsFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'documents'">
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
            </UCard>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
