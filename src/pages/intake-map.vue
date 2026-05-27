<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import usSvgRaw from '../assets/us.svg?raw'

import { useAuth } from '../composables/useAuth'
import {
  COVERAGE_CASE_CATEGORY_OPTIONS,
  COVERAGE_SOL_OPTIONS,
  INSURANCE_OPTIONS,
  LANGUAGE_OPTIONS,
  LIABILITY_OPTIONS,
  MEDICAL_TREATMENT_OPTIONS,
  listBrokerAttorneys,
  updateBrokerAttorney,
  type BrokerAttorneyRow,
  type CoverageCaseCategory,
  type CoverageInsuranceStatus,
  type CoverageLiabilityStatus,
  type CoverageMedicalTreatment,
  type CoverageSolCriteria
} from '../lib/broker-attorneys'
import { US_STATES } from '../lib/us-states'

type CoverageForm = {
  broker_attorney_id: string
  coverage_states: string[]
  coverage_case_category: CoverageCaseCategory
  coverage_sol_criteria: CoverageSolCriteria
  coverage_liability_status: CoverageLiabilityStatus
  coverage_insurance_status: CoverageInsuranceStatus
  coverage_medical_treatment: CoverageMedicalTreatment
  coverage_languages: string[]
  coverage_no_prior_attorney: boolean
  coverage_notes: string
}

const auth = useAuth()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const coverageOpen = ref(false)
const attorneys = ref<BrokerAttorneyRow[]>([])
const selectedAttorneyId = ref('')
const mapRoot = ref<HTMLDivElement | null>(null)

const stateOptions = US_STATES.map(state => ({
  label: `${state.code} - ${state.name}`,
  value: state.code
}))

const multiSelectUi = {
  content: 'min-w-64 max-h-72 overflow-auto'
}

const coverageForm = ref<CoverageForm>({
  broker_attorney_id: '',
  coverage_states: [],
  coverage_case_category: 'Consumer Cases',
  coverage_sol_criteria: '6_12_months',
  coverage_liability_status: 'clear_only',
  coverage_insurance_status: 'insured_only',
  coverage_medical_treatment: 'ongoing',
  coverage_languages: ['English'],
  coverage_no_prior_attorney: true,
  coverage_notes: ''
})

const brokerId = computed(() => auth.state.value.user?.id ?? '')
const attorneyOptions = computed(() =>
  attorneys.value.map(attorney => ({
    label: attorney.firm_name ? `${attorney.attorney_name} - ${attorney.firm_name}` : attorney.attorney_name,
    value: attorney.id
  }))
)

const selectedAttorney = computed(() =>
  attorneys.value.find(attorney => attorney.id === selectedAttorneyId.value) ?? null
)

const coveredStateRows = computed(() =>
  (selectedAttorney.value?.coverage_states ?? [])
    .map(code => ({ code, name: US_STATES.find(state => state.code === code)?.name ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name))
)

const coverageFormStateRows = computed(() =>
  coverageForm.value.coverage_states
    .map(code => ({ code, name: US_STATES.find(state => state.code === code)?.name ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name))
)

const networkCoverageCounts = computed(() => {
  const counts = new Map<string, number>()
  attorneys.value.forEach(attorney => {
    ;(attorney.coverage_states ?? []).forEach(code => {
      const normalized = String(code || '').trim().toUpperCase()
      if (!normalized) return
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    })
  })
  return counts
})

const coveredStateCount = computed(() => networkCoverageCounts.value.size)
const highTrafficCount = computed(() => {
  let n = 0
  networkCoverageCounts.value.forEach(v => { if (v >= 2) n++ })
  return n
})
const moderateTrafficCount = computed(() => {
  let n = 0
  networkCoverageCounts.value.forEach(v => { if (v === 1) n++ })
  return n
})
const noCoverageCount = computed(() => US_STATES.length - networkCoverageCounts.value.size)

const normalizeStateCode = (value: unknown) => String(value || '').trim().toUpperCase()

const normalizeCoverageSolCriteria = (value?: string | null): CoverageSolCriteria => {
  if (value === '12_plus_months') return '12_plus_months'
  return '6_12_months'
}

const hydrateCoverageForm = (attorney: BrokerAttorneyRow) => {
  coverageForm.value = {
    broker_attorney_id: attorney.id,
    coverage_states: [...(attorney.coverage_states ?? [])],
    coverage_case_category: attorney.coverage_case_category ?? 'Consumer Cases',
    coverage_sol_criteria: normalizeCoverageSolCriteria(attorney.coverage_sol_criteria),
    coverage_liability_status: attorney.coverage_liability_status ?? 'clear_only',
    coverage_insurance_status: attorney.coverage_insurance_status ?? 'insured_only',
    coverage_medical_treatment: attorney.coverage_medical_treatment ?? 'ongoing',
    coverage_languages: attorney.coverage_languages?.length ? [...attorney.coverage_languages] : ['English'],
    coverage_no_prior_attorney: attorney.coverage_no_prior_attorney ?? true,
    coverage_notes: attorney.coverage_notes ?? ''
  }
}

const applyMapColors = async () => {
  await nextTick()
  const root = mapRoot.value
  if (!root) return

  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (svg) {
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }

  root.querySelectorAll<SVGPathElement>('path[data-id]').forEach((path) => {
    const code = normalizeStateCode(path.dataset.id)
    const selectedInForm = coverageOpen.value && coverageForm.value.coverage_states.includes(code)
    const networkCount = networkCoverageCounts.value.get(code) ?? 0

    let fill = '#ef4444'
    if (selectedInForm) fill = '#f59e0b'
    else if (networkCount >= 2) fill = '#22c55e'
    else if (networkCount === 1) fill = '#eab308'

    path.style.fill = fill
    path.style.stroke = '#0b0b0b'
    path.style.strokeWidth = '0.8'
    path.style.cursor = selectedAttorney.value ? 'pointer' : 'default'
    path.style.transition = 'fill 160ms ease, opacity 160ms ease'
    path.style.opacity = selectedAttorney.value ? '1' : '0.55'
  })

  applyStateLabels()
}

const applyStateLabels = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return

  const old = svg.querySelector('#state-labels')
  if (old) old.remove()

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('id', 'state-labels')
  g.setAttribute('pointer-events', 'none')

  svg.querySelectorAll<SVGPathElement>('path[data-id]').forEach((path) => {
    const code = normalizeStateCode(path.dataset.id)
    if (!code) return

    let bbox: DOMRect
    try {
      bbox = path.getBBox()
    } catch {
      return
    }

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    const fontSize = Math.max(7, Math.min(14, Math.min(bbox.width, bbox.height) / 4))

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = code
    text.setAttribute('x', String(cx))
    text.setAttribute('y', String(cy))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.style.setProperty('font-size', `${fontSize}px`, 'important')
    text.style.setProperty('font-weight', '700', 'important')
    text.style.setProperty('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', 'important')
    text.style.setProperty('fill', '#111827', 'important')
    text.style.setProperty('paint-order', 'stroke', 'important')
    text.style.setProperty('stroke', 'rgba(255,255,255,0.92)', 'important')
    text.style.setProperty('stroke-width', '2', 'important')
    text.style.setProperty('stroke-linejoin', 'round', 'important')

    g.appendChild(text)
  })

  svg.appendChild(g)
}

const loadAttorneys = async () => {
  loading.value = true
  try {
    await auth.init()
    if (!brokerId.value) {
      attorneys.value = []
      selectedAttorneyId.value = ''
      return
    }

    attorneys.value = await listBrokerAttorneys(brokerId.value)
    if (!selectedAttorneyId.value || !attorneys.value.some(attorney => attorney.id === selectedAttorneyId.value)) {
      selectedAttorneyId.value = attorneys.value[0]?.id ?? ''
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load attorneys'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    loading.value = false
    applyMapColors()
  }
}

const openCoverageEditor = () => {
  if (!selectedAttorney.value) {
    toast.add({
      title: 'Add an attorney first',
      description: 'Create a broker-managed attorney profile before adding coverage.',
      color: 'warning',
      icon: 'i-lucide-alert-triangle'
    })
    return
  }

  hydrateCoverageForm(selectedAttorney.value)
  coverageOpen.value = true
}

const toggleCoverageState = (stateCode: string) => {
  const code = normalizeStateCode(stateCode)
  if (!code) return

  const selected = new Set(coverageForm.value.coverage_states)
  if (selected.has(code)) selected.delete(code)
  else selected.add(code)

  coverageForm.value.coverage_states = Array.from(selected).sort()
}

const handleMapClick = (event: MouseEvent) => {
  const target = event.target as Element | null
  const path = target?.closest?.('path[data-id]') as SVGPathElement | null
  const code = normalizeStateCode(path?.dataset.id)
  if (!code) return

  if (!selectedAttorney.value) {
    toast.add({
      title: 'No attorney selected',
      description: 'Select or add an attorney before editing coverage.',
      color: 'warning',
      icon: 'i-lucide-alert-triangle'
    })
    return
  }

  if (!coverageOpen.value) {
    hydrateCoverageForm(selectedAttorney.value)
    coverageOpen.value = true
  }

  toggleCoverageState(code)
}

const saveCoverage = async () => {
  const attorneyId = coverageForm.value.broker_attorney_id
  if (!attorneyId) return

  saving.value = true
  try {
    const updated = await updateBrokerAttorney(attorneyId, {
      coverage_states: coverageForm.value.coverage_states,
      coverage_case_category: coverageForm.value.coverage_case_category,
      coverage_sol_criteria: normalizeCoverageSolCriteria(coverageForm.value.coverage_sol_criteria),
      coverage_liability_status: coverageForm.value.coverage_liability_status,
      coverage_insurance_status: coverageForm.value.coverage_insurance_status,
      coverage_medical_treatment: coverageForm.value.coverage_medical_treatment,
      coverage_languages: coverageForm.value.coverage_languages,
      coverage_no_prior_attorney: coverageForm.value.coverage_no_prior_attorney,
      coverage_notes: coverageForm.value.coverage_notes.trim() || null
    })

    const index = attorneys.value.findIndex(attorney => attorney.id === updated.id)
    if (index !== -1) attorneys.value[index] = updated
    selectedAttorneyId.value = updated.id
    coverageOpen.value = false
    toast.add({ title: 'Coverage saved', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to save coverage'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    saving.value = false
    applyMapColors()
  }
}

watch(selectedAttorneyId, () => {
  if (selectedAttorney.value && coverageOpen.value) hydrateCoverageForm(selectedAttorney.value)
  applyMapColors()
})

watch(
  () => coverageForm.value.broker_attorney_id,
  (attorneyId) => {
    const nextAttorney = attorneys.value.find(attorney => attorney.id === attorneyId)
    if (nextAttorney) {
      selectedAttorneyId.value = nextAttorney.id
      hydrateCoverageForm(nextAttorney)
    }
  }
)

watch(
  () => coverageForm.value.coverage_states.slice(),
  () => applyMapColors()
)

watch(coverageOpen, () => applyMapColors())

onMounted(loadAttorneys)
</script>

<template>
  <UDashboardPanel id="intake-map">
    <template #header>
      <UDashboardNavbar title="Order Map" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            class="rounded-lg"
            @click="loadAttorneys"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4">
        <!-- ═══ Attorney toolbar ═══ -->
        <div class="ap-fade-in flex flex-col gap-3 rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <!-- Left side: attorney info + My Attorneys link inline -->
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]">
              <UIcon name="i-lucide-scale" class="size-5" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-highlighted">
                {{ selectedAttorney?.attorney_name || 'No attorney selected' }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ selectedAttorney?.firm_name || 'Select or add an attorney to begin' }}
              </p>
            </div>
            <div class="hidden h-8 w-px bg-[var(--ap-card-border)] mx-1 sm:block" />
            <button
              type="button"
              class="group hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[var(--ap-card-border)] bg-white/40 dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-highlighted transition-all hover:border-[var(--ap-accent)]/40 hover:bg-[var(--ap-accent)]/[0.06] hover:text-[var(--ap-accent)]"
              @click="router.push('/attorneys')"
            >
              <UIcon name="i-lucide-users" class="size-3.5" />
              My Attorneys
              <UIcon name="i-lucide-arrow-up-right" class="size-3 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--ap-accent)]" />
            </button>
          </div>

          <!-- Right side: selector + edit -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-users"
              class="rounded-lg sm:hidden"
              @click="router.push('/attorneys')"
            >
              My Attorneys
            </UButton>
            <USelect
              v-model="selectedAttorneyId"
              :items="attorneyOptions"
              value-key="value"
              label-key="label"
              placeholder="Select attorney"
              icon="i-lucide-user"
              class="w-full sm:w-72"
              :disabled="!attorneyOptions.length"
            />
            <UButton
              :disabled="!selectedAttorney"
              icon="i-lucide-pencil"
              variant="solid"
              color="primary"
              class="rounded-lg"
              @click="openCoverageEditor"
            >
              Edit Coverage
            </UButton>
          </div>
        </div>

        <!-- ═══ Full-width map with glass overlays ═══ -->
        <section class="ap-fade-in relative overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
          <!-- Loading state -->
          <div v-if="loading" class="flex h-[640px] items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="size-7 animate-spin text-[var(--ap-accent)]" />
          </div>

          <!-- Empty state -->
          <div v-else-if="!attorneys.length" class="flex h-[640px] items-center justify-center px-6 text-center">
            <div>
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]">
                <UIcon name="i-lucide-scale" class="size-7" />
              </div>
              <p class="mt-4 text-sm font-semibold text-highlighted">No attorneys yet</p>
              <p class="mt-1 text-xs text-muted">Add an attorney profile before configuring coverage.</p>
              <UButton class="mt-4 rounded-lg" icon="i-lucide-plus" @click="router.push('/attorneys')">
                Add Attorney
              </UButton>
            </div>
          </div>

          <!-- Map -->
          <div v-else class="relative">
            <div
              ref="mapRoot"
              class="w-full px-2 py-4 sm:px-4 sm:py-6 [&_svg]:h-[640px] [&_svg]:w-full"
              @click="handleMapClick"
              v-html="usSvgRaw"
            />

            <!-- ── Glass strip stat cards: top-left ── -->
            <div class="ap-fade-in-left absolute top-3 left-3 z-[5] w-40 overflow-hidden rounded-xl border border-black/[0.08] bg-white/75 shadow-lg backdrop-blur-md dark:border-white/[0.08] dark:bg-[#1a1a1a]/65">
              <div class="flex flex-col divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                <div class="relative px-3 py-2.5 pl-5" style="animation-delay: 400ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-[var(--ap-accent)]" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-[var(--ap-accent)]">Covered States</div>
                  <div class="mt-0.5 text-lg font-bold text-[var(--ap-accent)] tabular-nums">{{ coveredStateCount }}</div>
                </div>
                <div class="relative px-3 py-2.5 pl-5" style="animation-delay: 500ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-green-500" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-green-600 dark:text-green-400">High Traffic</div>
                  <div class="mt-0.5 text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{{ highTrafficCount }}</div>
                </div>
                <div class="relative px-3 py-2.5 pl-5" style="animation-delay: 600ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-yellow-500" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-yellow-600 dark:text-yellow-400">Moderate Traffic</div>
                  <div class="mt-0.5 text-lg font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">{{ moderateTrafficCount }}</div>
                </div>
                <div class="relative px-3 py-2.5 pl-5" style="animation-delay: 700ms">
                  <div class="absolute inset-y-0 left-0 w-1 bg-red-500" />
                  <div class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">No Coverage</div>
                  <div class="mt-0.5 text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{{ noCoverageCount }}</div>
                </div>
              </div>
            </div>

            <!-- ── Glass active states card: bottom-left ── -->
            <div class="absolute bottom-3 left-3 z-[5] w-56 overflow-hidden rounded-xl border border-black/[0.08] bg-white/75 shadow-lg backdrop-blur-md dark:border-white/[0.08] dark:bg-[#1a1a1a]/65">
              <div class="flex items-center justify-between border-b border-black/[0.06] px-3 py-2 dark:border-white/[0.08]">
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-map-pin" class="size-3 text-[var(--ap-accent)]" />
                  <span class="text-[11px] font-semibold text-highlighted">Active States</span>
                </div>
                <span class="inline-flex items-center rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {{ coveredStateRows.length }}
                </span>
              </div>
              <div class="max-h-40 overflow-y-auto px-2.5 py-2">
                <div v-if="!coveredStateRows.length" class="flex flex-col items-center justify-center gap-1 px-2 py-4 text-center">
                  <UIcon name="i-lucide-map" class="size-4 text-muted/50" />
                  <p class="text-[10px] text-muted">No states selected.</p>
                </div>
                <div v-else class="flex flex-wrap gap-1">
                  <span
                    v-for="row in coveredStateRows"
                    :key="row.code"
                    class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                    :title="row.name"
                  >
                    <span class="size-1 rounded-full bg-emerald-500" />
                    {{ row.code }}
                  </span>
                </div>
              </div>
            </div>

            <!-- ── Glass bottom legend (centered) ── -->
            <div class="pointer-events-none absolute bottom-3 right-3 z-[5] px-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
              <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-xl border border-black/[0.08] bg-white/85 px-4 py-2 shadow-lg backdrop-blur-md dark:border-white/[0.08] dark:bg-[#1a1a1a]/75">
                <div class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-full bg-green-500" />
                  <span class="text-[10px] font-medium text-gray-600 dark:text-gray-300">High Traffic</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-full bg-yellow-500" />
                  <span class="text-[10px] font-medium text-gray-600 dark:text-gray-300">Moderate Traffic</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-full bg-red-500" />
                  <span class="text-[10px] font-medium text-gray-600 dark:text-gray-300">No Coverage</span>
                </div>
                <div v-if="coverageOpen" class="hidden h-3 w-px bg-black/[0.08] dark:bg-white/[0.08] sm:block" />
                <div v-if="coverageOpen" class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
                  <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400">Editing</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Notes (only when present) -->
        <div
          v-if="selectedAttorney?.coverage_notes"
          class="ap-fade-in rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-4"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sticky-note" class="size-3.5 text-amber-500" />
            <span class="text-xs font-semibold text-highlighted">Notes for {{ selectedAttorney.attorney_name }}</span>
          </div>
          <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
            {{ selectedAttorney.coverage_notes }}
          </p>
        </div>
      </div>

      <UModal
        v-model:open="coverageOpen"
        title="General Coverage"
        description="Save coverage criteria to the selected broker attorney profile."
        :dismissible="!saving"
        :ui="{ content: 'sm:max-w-3xl' }"
      >
        <template #body>
          <div class="space-y-5">
            <section class="rounded-xl border border-[var(--ap-card-border)] bg-white/70 p-4 dark:bg-white/[0.03]">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-end">
                <UFormField label="Attorney">
                  <USelect
                    v-model="coverageForm.broker_attorney_id"
                    :items="attorneyOptions"
                    value-key="value"
                    label-key="label"
                    placeholder="Select attorney"
                    icon="i-lucide-scale"
                    class="w-full"
                  />
                </UFormField>

                <div class="rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 py-2">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-map-pinned" class="size-4 text-[var(--ap-accent)]" />
                    <span class="text-[11px] font-medium text-muted">Selected States</span>
                  </div>
                  <div class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
                    {{ coverageForm.coverage_states.length }}
                  </div>
                </div>
              </div>
            </section>

            <section class="space-y-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-map" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Territory
                </h3>
              </div>

              <UFormField label="States">
                <USelect
                  v-model="coverageForm.coverage_states"
                  :items="stateOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="Select states"
                  class="w-full"
                  :ui="multiSelectUi"
                />
              </UFormField>

              <div class="min-h-12 rounded-lg border border-dashed border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] p-3">
                <div v-if="coverageFormStateRows.length" class="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  <span
                    v-for="state in coverageFormStateRows"
                    :key="state.code"
                    class="inline-flex items-center gap-1 rounded-md border border-[var(--ap-accent)]/25 bg-[var(--ap-accent)]/10 px-2 py-1 text-[11px] font-medium text-highlighted"
                  >
                    <span class="font-semibold text-[var(--ap-accent)]">{{ state.code }}</span>
                    <span class="text-muted">{{ state.name }}</span>
                  </span>
                </div>
                <div v-else class="flex items-center gap-2 text-xs text-muted">
                  <UIcon name="i-lucide-info" class="size-4" />
                  No states selected
                </div>
              </div>
            </section>

            <section class="space-y-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-list-checks" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Case Criteria
                </h3>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Case Category">
                  <USelect
                    v-model="coverageForm.coverage_case_category"
                    :items="COVERAGE_CASE_CATEGORY_OPTIONS"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="SOL">
                  <USelect
                    v-model="coverageForm.coverage_sol_criteria"
                    :items="COVERAGE_SOL_OPTIONS"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Liability">
                  <USelect
                    v-model="coverageForm.coverage_liability_status"
                    :items="LIABILITY_OPTIONS"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Insurance">
                  <USelect
                    v-model="coverageForm.coverage_insurance_status"
                    :items="INSURANCE_OPTIONS"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Medical Treatment" class="sm:col-span-2">
                  <USelect
                    v-model="coverageForm.coverage_medical_treatment"
                    :items="MEDICAL_TREATMENT_OPTIONS"
                    value-key="value"
                    label-key="label"
                    class="w-full"
                  />
                </UFormField>
              </div>

              <div class="flex items-center gap-3 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] p-3">
                <UCheckbox v-model="coverageForm.coverage_no_prior_attorney" label="No prior attorney" />
              </div>
            </section>

            <section class="space-y-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-message-square-text" class="size-4 text-[var(--ap-accent)]" />
                <h3 class="text-sm font-semibold text-highlighted">
                  Communication
                </h3>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Languages">
                  <USelect
                    v-model="coverageForm.coverage_languages"
                    :items="LANGUAGE_OPTIONS"
                    multiple
                    placeholder="Select languages"
                    class="w-full"
                    :ui="multiSelectUi"
                  />
                </UFormField>

                <UFormField label="Notes" class="sm:col-span-2">
                  <UTextarea
                    v-model="coverageForm.coverage_notes"
                    :rows="4"
                    placeholder="Notes for this attorney coverage..."
                    class="w-full"
                  />
                </UFormField>
              </div>
            </section>

            <div class="flex flex-col-reverse gap-2 border-t border-black/[0.06] pt-4 dark:border-white/[0.06] sm:flex-row sm:justify-end">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="saving"
                class="justify-center rounded-lg"
                @click="coverageOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                icon="i-lucide-check"
                :loading="saving"
                :disabled="!coverageForm.broker_attorney_id"
                class="justify-center rounded-lg"
                @click="saveCoverage"
              >
                Save Coverage
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
