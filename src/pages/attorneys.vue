<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import {
  CONTACT_METHOD_OPTIONS,
  LANGUAGE_OPTIONS,
  createBrokerAttorney,
  deleteBrokerAttorney,
  listBrokerAttorneys,
  type BrokerAttorneyRow,
  type PreferredContact
} from '../lib/broker-attorneys'

const auth = useAuth()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const createOpen = ref(false)
const search = ref('')
const attorneys = ref<BrokerAttorneyRow[]>([])

const brokerId = computed(() => auth.state.value.user?.id ?? '')

const createForm = ref({
  attorney_name: '',
  primary_email: '',
  direct_phone: '',
  preferred_contact: 'email' as PreferredContact,
  languages: ['English'] as string[]
})

const filteredAttorneys = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return attorneys.value

  return attorneys.value.filter(attorney => {
    return [
      attorney.attorney_name,
      attorney.primary_email,
      attorney.direct_phone
    ].some(value => String(value || '').toLowerCase().includes(q))
  })
})

const getAttorneyInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

const getCoveragePreview = (states: string[]) => states.slice(0, 4)

const getRemainingCoverageCount = (states: string[]) => Math.max(states.length - 4, 0)

const getTransferSolLabel = (attorney: BrokerAttorneyRow) => {
  if (!attorney.transfer_standard_types.includes('sol') && !attorney.transfer_sol_option) {
    return 'Not set'
  }

  const labels: Record<NonNullable<BrokerAttorneyRow['transfer_sol_option']>, string> = {
    '3_months': '3 months',
    '6_months': '6 months',
    '12_months': '12 months'
  }

  return attorney.transfer_sol_option ? labels[attorney.transfer_sol_option] : 'Not set'
}

const resetCreateForm = () => {
  createForm.value = {
    attorney_name: '',
    primary_email: '',
    direct_phone: '',
    preferred_contact: 'email',
    languages: ['English']
  }
}

const loadAttorneys = async () => {
  loading.value = true
  try {
    await auth.init()
    if (!brokerId.value) {
      attorneys.value = []
      return
    }

    attorneys.value = await listBrokerAttorneys(brokerId.value)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load attorneys'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    loading.value = false
  }
}

const openAttorney = (attorneyId: string) => {
  router.push(`/attorneys/${attorneyId}`)
}

const submitCreate = async () => {
  if (!brokerId.value) return

  const attorneyName = createForm.value.attorney_name.trim()
  if (!attorneyName) {
    toast.add({
      title: 'Attorney name required',
      description: 'Add the attorney name before creating the profile.',
      color: 'warning',
      icon: 'i-lucide-alert-triangle'
    })
    return
  }

  saving.value = true
  try {
    const attorney = await createBrokerAttorney(brokerId.value, {
      attorney_name: attorneyName,
      primary_email: createForm.value.primary_email.trim() || null,
      direct_phone: createForm.value.direct_phone.trim() || null,
      preferred_contact: createForm.value.preferred_contact,
      languages: createForm.value.languages
    })

    attorneys.value = [attorney, ...attorneys.value].sort((a, b) => a.attorney_name.localeCompare(b.attorney_name))
    createOpen.value = false
    resetCreateForm()
    toast.add({ title: 'Attorney created', color: 'success', icon: 'i-lucide-check' })
    router.push(`/attorneys/${attorney.id}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to create attorney'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    saving.value = false
  }
}

const removeAttorney = async (attorney: BrokerAttorneyRow) => {
  if (!confirm(`Delete ${attorney.attorney_name}?`)) return

  deletingId.value = attorney.id
  try {
    await deleteBrokerAttorney(attorney.id)
    attorneys.value = attorneys.value.filter(item => item.id !== attorney.id)
    toast.add({ title: 'Attorney deleted', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to delete attorney'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    deletingId.value = null
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(loadAttorneys)
</script>

<template>
  <UDashboardPanel id="attorneys">
    <template #header>
      <UDashboardNavbar title="My Attorneys" :ui="{ right: 'gap-3' }">
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
            @click="loadAttorneys"
          />
          <UButton
            icon="i-lucide-plus"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            @click="createOpen = true"
          >
            Add Attorney
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Broker-managed attorneys
            </h2>
            <p class="mt-1 text-sm text-muted">
              These profiles are managed by your broker account and do not have login access.
            </p>
          </div>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search attorneys"
            class="w-full sm:w-72"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            class="group relative flex min-h-56 flex-col overflow-hidden rounded-xl border border-dashed border-[var(--ap-accent)]/35 bg-white/80 text-left shadow-lg backdrop-blur-sm transition duration-300 hover:border-[var(--ap-accent)]/60 hover:shadow-xl dark:bg-[#1a1a1a]/60"
            @click="createOpen = true"
          >
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.07] via-transparent to-transparent" />
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent opacity-70" />
            <div class="relative flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-xl border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 text-[var(--ap-accent)] transition group-hover:bg-[var(--ap-accent)]/15">
                <UIcon name="i-lucide-user-plus" class="size-5" />
              </div>
              <p class="mt-4 text-sm font-semibold text-highlighted">
                Add Attorney
              </p>
              <p class="mt-1 text-xs text-muted">
                Managed broker attorney profile
              </p>
            </div>
          </button>

          <div
            v-for="attorney in filteredAttorneys"
            :key="attorney.id"
            class="ap-fade-in group relative flex min-h-56 flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60"
          >
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
              <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
              <div class="relative flex items-center justify-between gap-3 px-5 py-4">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="openAttorney(attorney.id)">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 text-xs font-bold text-[var(--ap-accent)] dark:border-[var(--ap-accent)]/40">
                    {{ getAttorneyInitials(attorney.attorney_name) }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-highlighted transition-colors group-hover:text-[var(--ap-accent)]">
                      {{ attorney.attorney_name }}
                    </p>
                    <p class="mt-0.5 text-[11px] font-medium text-muted">
                      Broker attorney
                    </p>
                  </div>
                </button>
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="rounded-lg text-muted hover:bg-red-500/10 hover:text-red-400"
                  :loading="deletingId === attorney.id"
                  :aria-label="`Delete ${attorney.attorney_name}`"
                  @click="removeAttorney(attorney)"
                />
              </div>
            </div>

            <button type="button" class="relative flex flex-1 flex-col gap-4 p-5 text-left" @click="openAttorney(attorney.id)">
              <div>
                <div class="mb-2 flex items-center gap-2 text-[11px] font-semibold text-muted">
                  <UIcon name="i-lucide-map-pin" class="size-3.5 text-[var(--ap-accent)]" />
                  Coverage
                </div>
                <div v-if="attorney.coverage_states.length" class="flex flex-wrap gap-1.5">
                  <span
                    v-for="state in getCoveragePreview(attorney.coverage_states)"
                    :key="state"
                    class="rounded-md border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--ap-accent)]"
                  >
                    {{ state }}
                  </span>
                  <span
                    v-if="getRemainingCoverageCount(attorney.coverage_states)"
                    class="rounded-md border-[0.5px] border-black/[0.06] bg-black/[0.03] px-2 py-0.5 text-[11px] font-medium text-muted dark:border-white/[0.08] dark:bg-white/[0.05]"
                  >
                    +{{ getRemainingCoverageCount(attorney.coverage_states) }}
                  </span>
                </div>
                <div v-else class="rounded-lg border border-dashed border-[var(--ap-accent)]/25 bg-[var(--ap-accent)]/[0.03] px-3 py-2 text-xs text-muted">
                  No coverage states set
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <div class="rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <span class="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                    <UIcon name="i-lucide-timer" class="size-3.5 text-[var(--ap-accent)]" />
                    Transfer SOL
                  </span>
                  <p class="mt-1 truncate text-xs font-semibold text-highlighted">
                    {{ getTransferSolLabel(attorney) }}
                  </p>
                </div>
                <div class="rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <span class="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                    <UIcon name="i-lucide-languages" class="size-3.5 text-[var(--ap-accent)]" />
                    Languages
                  </span>
                  <p class="mt-1 truncate text-xs font-semibold text-highlighted">
                    {{ attorney.coverage_languages.length ? attorney.coverage_languages.join(', ') : 'Not set' }}
                  </p>
                </div>
              </div>
            </button>

            <div class="relative flex items-center justify-between border-t border-black/[0.06] px-5 py-3 text-[11px] text-muted dark:border-white/[0.06]">
              <span>Updated {{ formatDate(attorney.updated_at) }}</span>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-[var(--ap-accent)] transition hover:bg-[var(--ap-accent)]/10"
                @click="openAttorney(attorney.id)"
              >
                Manage
                <UIcon name="i-lucide-arrow-right" class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-[var(--ap-accent)]" />
        </div>

        <div v-else-if="!filteredAttorneys.length && attorneys.length" class="rounded-xl border border-black/[0.06] bg-white/90 p-8 text-center dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
          <p class="text-sm font-medium text-highlighted">
            No matching attorneys
          </p>
          <p class="mt-1 text-xs text-muted">
            Clear the search to see every attorney profile.
          </p>
        </div>
      </div>

      <UModal
        v-model:open="createOpen"
        title="Add Attorney"
        :dismissible="!saving"
        @after:leave="resetCreateForm"
      >
        <template #body>
          <div class="space-y-6">
            <section class="space-y-3">
              <div class="flex items-center gap-2.5">
                <span class="flex size-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]">
                  <UIcon name="i-lucide-scale" class="size-4" />
                </span>
                <h3 class="text-sm font-semibold text-highlighted">
                  Attorney
                </h3>
              </div>

              <UFormField label="Attorney Name" required>
                <UInput
                  v-model="createForm.attorney_name"
                  icon="i-lucide-user"
                  placeholder="McDonald Worly"
                  autocomplete="off"
                  size="lg"
                />
              </UFormField>
            </section>

            <section class="space-y-3 border-t border-black/[0.06] pt-5 dark:border-white/[0.06]">
              <div class="flex items-center gap-2.5">
                <span class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <UIcon name="i-lucide-phone-call" class="size-4" />
                </span>
                <h3 class="text-sm font-semibold text-highlighted">
                  Contact
                </h3>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Primary Email">
                  <UInput
                    v-model="createForm.primary_email"
                    icon="i-lucide-mail"
                    type="email"
                    placeholder="attorney@example.com"
                    autocomplete="off"
                  />
                </UFormField>
                <UFormField label="Direct Phone">
                  <UInput
                    v-model="createForm.direct_phone"
                    icon="i-lucide-phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autocomplete="off"
                  />
                </UFormField>
              </div>
            </section>

            <section class="space-y-3 border-t border-black/[0.06] pt-5 dark:border-white/[0.06]">
              <div class="flex items-center gap-2.5">
                <span class="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <UIcon name="i-lucide-route" class="size-4" />
                </span>
                <h3 class="text-sm font-semibold text-highlighted">
                  Routing
                </h3>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Preferred Contact">
                  <USelect
                    v-model="createForm.preferred_contact"
                    :items="CONTACT_METHOD_OPTIONS"
                    value-key="value"
                    label-key="label"
                  />
                </UFormField>
                <UFormField label="Languages">
                  <UInputMenu
                    v-model="createForm.languages"
                    :items="LANGUAGE_OPTIONS"
                    multiple
                    searchable
                    placeholder="Select languages"
                    :ui="{ tagsItem: 'hidden' }"
                  />
                </UFormField>
              </div>
            </section>

            <div class="flex justify-end gap-2 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="saving"
                @click="createOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                icon="i-lucide-check"
                :loading="saving"
                :disabled="!createForm.attorney_name.trim()"
                @click="submitCreate"
              >
                Create Attorney
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
