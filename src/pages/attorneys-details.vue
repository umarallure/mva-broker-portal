<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import {
  CONTACT_METHOD_OPTIONS,
  INJURY_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  TRANSFER_SOL_OPTIONS,
  getBrokerAttorney,
  updateBrokerAttorney,
  type BrokerAttorneyInput,
  type BrokerAttorneyRow,
  type PreferredContact,
  type TransferSolOption,
  type TransferStandardType
} from '../lib/broker-attorneys'
import { US_STATES } from '../lib/us-states'
import {
  BROKER_RETAINER_DOCUMENT_ACCEPT,
  BROKER_RETAINER_DOCUMENT_MAX_SIZE_BYTES,
  BROKER_RETAINER_DOCUMENT_STATE_OPTIONS,
  deleteBrokerRetainerDocument,
  formatBrokerRetainerDocumentFileSize,
  getBrokerRetainerDocumentKind,
  getBrokerRetainerDocumentSignedUrl,
  getBrokerRetainerDocumentStateName,
  listBrokerRetainerDocuments,
  updateBrokerRetainerDocumentNotes,
  uploadBrokerRetainerDocument,
  validateBrokerRetainerDocument,
  type BrokerAttorneyRetainerDocument
} from '../lib/broker-attorney-documents'

type AttorneyForm = {
  attorney_name: string
  firm_name: string
  bio: string
  years_experience: number | null
  languages: string[]
  primary_email: string
  personal_email: string
  direct_phone: string
  office_address: string
  website_url: string
  preferred_contact: PreferredContact
  assistant_name: string
  assistant_email: string
  transfer_standard_types: TransferStandardType[]
  transfer_sol_option: TransferSolOption
  transfer_sol_other: string
  transfer_injury_types: string[]
  transfer_injury_other: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const openingDocumentId = ref<string | null>(null)
const uploadingDocument = ref(false)
const attorney = ref<BrokerAttorneyRow | null>(null)
const documents = ref<BrokerAttorneyRetainerDocument[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const usesSol = ref(false)
const usesInjuryTypes = ref(false)
const editingNotesId = ref<string | null>(null)
const editingNotesValue = ref('')

const attorneyId = computed(() => String(route.params.id || ''))
const brokerId = computed(() => auth.state.value.user?.id ?? '')

const addressStateOptions = US_STATES.map(s => ({ label: s.code, value: s.code }))

const addressStreet = ref('')
const addressSuite = ref('')
const addressCity = ref('')
const addressState = ref('')
const addressZip = ref('')

const parseAddress = (raw: string) => {
  addressStreet.value = ''
  addressSuite.value = ''
  addressCity.value = ''
  addressState.value = ''
  addressZip.value = ''
  if (!raw) return
  const parts = raw.split(',').map(p => p.trim())
  if (parts.length >= 3) {
    addressStreet.value = parts[0] ?? ''
    const last = parts[parts.length - 1] ?? ''
    const stateZipMatch = last.match(/^([A-Za-z]{2})\s+(.+)$/)
    if (stateZipMatch) {
      addressState.value = stateZipMatch[1].toUpperCase()
      addressZip.value = stateZipMatch[2]
    } else {
      addressState.value = last
    }
    addressCity.value = parts[parts.length - 2] ?? ''
    if (parts.length >= 4) {
      addressSuite.value = parts.slice(1, parts.length - 2).join(', ')
    }
  } else {
    addressStreet.value = raw
  }
}

const buildAddress = () => {
  const parts = [addressStreet.value.trim()]
  if (addressSuite.value.trim()) parts.push(addressSuite.value.trim())
  if (addressCity.value.trim()) parts.push(addressCity.value.trim())
  const stateZip = [addressState.value.trim(), addressZip.value.trim()].filter(Boolean).join(' ')
  if (stateZip) parts.push(stateZip)
  return parts.filter(Boolean).join(', ')
}

const form = ref<AttorneyForm>({
  attorney_name: '',
  firm_name: '',
  bio: '',
  years_experience: null,
  languages: ['English'],
  primary_email: '',
  personal_email: '',
  direct_phone: '',
  office_address: '',
  website_url: '',
  preferred_contact: 'email',
  assistant_name: '',
  assistant_email: '',
  transfer_standard_types: [],
  transfer_sol_option: '3_months',
  transfer_sol_other: '',
  transfer_injury_types: [],
  transfer_injury_other: ''
})

const newDocument = ref({
  state: '',
  file: null as File | null,
  notes: ''
})

const usedDocumentStates = computed(() => new Set(documents.value.map(doc => doc.state)))
const availableDocumentStates = computed(() =>
  BROKER_RETAINER_DOCUMENT_STATE_OPTIONS.filter(option => !usedDocumentStates.value.has(option.value))
)
const canAddDocument = computed(() => availableDocumentStates.value.length > 0)
const maxFileSizeLabel = `${Math.round(BROKER_RETAINER_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB`
const hasOtherInjuryType = computed(() => form.value.transfer_injury_types.includes('Other'))

watch([usesSol, usesInjuryTypes], () => {
  const selected: TransferStandardType[] = []
  if (usesSol.value) selected.push('sol')
  if (usesInjuryTypes.value) selected.push('injury_type')
  form.value.transfer_standard_types = selected
})

watch(usesSol, (enabled) => {
  if (!enabled) {
    form.value.transfer_sol_option = '3_months'
    form.value.transfer_sol_other = ''
  } else if (!form.value.transfer_sol_option) {
    form.value.transfer_sol_option = '3_months'
  }
})

watch(usesInjuryTypes, (enabled) => {
  if (!enabled) {
    form.value.transfer_injury_types = []
    form.value.transfer_injury_other = ''
  }
})

watch(
  () => form.value.transfer_injury_types.slice(),
  (types) => {
    if (!types.includes('Other')) {
      form.value.transfer_injury_other = ''
    }
  }
)

watch([addressStreet, addressSuite, addressCity, addressState, addressZip], () => {
  form.value.office_address = buildAddress()
})

const hydrateForm = (row: BrokerAttorneyRow) => {
  form.value = {
    attorney_name: row.attorney_name || '',
    firm_name: row.firm_name || '',
    bio: row.bio || '',
    years_experience: row.years_experience,
    languages: row.languages?.length ? row.languages : ['English'],
    primary_email: row.primary_email || '',
    personal_email: row.personal_email || '',
    direct_phone: row.direct_phone || '',
    office_address: row.office_address || '',
    website_url: row.website_url || '',
    preferred_contact: row.preferred_contact || 'email',
    assistant_name: row.assistant_name || '',
    assistant_email: row.assistant_email || '',
    transfer_standard_types: row.transfer_standard_types || [],
    transfer_sol_option: row.transfer_sol_option ?? '3_months',
    transfer_sol_other: row.transfer_sol_other || '',
    transfer_injury_types: row.transfer_injury_types || [],
    transfer_injury_other: row.transfer_injury_other || ''
  }
  usesSol.value = form.value.transfer_standard_types.includes('sol')
  usesInjuryTypes.value = form.value.transfer_standard_types.includes('injury_type')
  parseAddress(form.value.office_address)
}

const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const row = await getBrokerAttorney(attorneyId.value)
    if (!row) {
      toast.add({ title: 'Attorney not found', color: 'warning', icon: 'i-lucide-alert-triangle' })
      router.push('/attorneys')
      return
    }

    attorney.value = row
    hydrateForm(row)
    documents.value = await listBrokerRetainerDocuments(row.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load attorney'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    loading.value = false
  }
}

const buildPayload = (): BrokerAttorneyInput => ({
  attorney_name: form.value.attorney_name.trim(),
  firm_name: form.value.firm_name.trim() || null,
  bio: form.value.bio.trim() || null,
  years_experience: form.value.years_experience === null ? null : Number(form.value.years_experience),
  languages: form.value.languages,
  primary_email: form.value.primary_email.trim() || null,
  personal_email: form.value.personal_email.trim() || null,
  direct_phone: form.value.direct_phone.trim() || null,
  office_address: form.value.office_address.trim() || null,
  website_url: form.value.website_url.trim() || null,
  preferred_contact: form.value.preferred_contact,
  assistant_name: form.value.assistant_name.trim() || null,
  assistant_email: form.value.assistant_email.trim() || null,
  transfer_standard_types: form.value.transfer_standard_types,
  transfer_sol_option: usesSol.value ? form.value.transfer_sol_option : null,
  transfer_sol_other: usesSol.value && form.value.transfer_sol_option === 'other'
    ? form.value.transfer_sol_other.trim() || null
    : null,
  transfer_injury_types: usesInjuryTypes.value ? form.value.transfer_injury_types : [],
  transfer_injury_other: usesInjuryTypes.value && hasOtherInjuryType.value
    ? form.value.transfer_injury_other.trim() || null
    : null
})

const saveAttorney = async () => {
  if (!attorney.value) return

  if (!form.value.attorney_name.trim()) {
    toast.add({ title: 'Attorney name required', color: 'warning', icon: 'i-lucide-alert-triangle' })
    return
  }

  saving.value = true
  try {
    const updated = await updateBrokerAttorney(attorney.value.id, buildPayload())
    attorney.value = updated
    hydrateForm(updated)
    toast.add({ title: 'Attorney saved', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to save attorney'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    saving.value = false
  }
}

const resetNewDocument = () => {
  newDocument.value = { state: '', file: null, notes: '' }
  if (fileInput.value) fileInput.value.value = ''
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const validationError = validateBrokerRetainerDocument(file)
  if (validationError) {
    toast.add({ title: 'Invalid document', description: validationError, color: 'error', icon: 'i-lucide-file-warning' })
    input.value = ''
    return
  }

  newDocument.value.file = file
}

const uploadDocument = async () => {
  if (!brokerId.value || !attorney.value) return

  if (!newDocument.value.state || !newDocument.value.file) {
    toast.add({
      title: 'Missing document details',
      description: 'Select a state and upload a file.',
      color: 'warning',
      icon: 'i-lucide-alert-triangle'
    })
    return
  }

  uploadingDocument.value = true
  try {
    const doc = await uploadBrokerRetainerDocument({
      brokerId: brokerId.value,
      brokerAttorneyId: attorney.value.id,
      state: newDocument.value.state,
      file: newDocument.value.file,
      notes: newDocument.value.notes
    })
    documents.value = [doc, ...documents.value]
    resetNewDocument()
    toast.add({ title: 'Document uploaded', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to upload document'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    uploadingDocument.value = false
  }
}

const openDocument = async (doc: BrokerAttorneyRetainerDocument) => {
  openingDocumentId.value = doc.id
  try {
    const signedUrl = await getBrokerRetainerDocumentSignedUrl(doc.document_path)
    const previewWindow = window.open(signedUrl, '_blank', 'noopener,noreferrer')
    if (!previewWindow) {
      toast.add({ title: 'Preview blocked', description: 'Allow pop-ups to open the document.', color: 'warning' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to open document'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    openingDocumentId.value = null
  }
}

const removeDocument = async (doc: BrokerAttorneyRetainerDocument) => {
  if (!confirm(`Delete the ${getBrokerRetainerDocumentStateName(doc.state)} document?`)) return

  try {
    await deleteBrokerRetainerDocument(doc.id)
    documents.value = documents.value.filter(item => item.id !== doc.id)
    toast.add({ title: 'Document deleted', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to delete document'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  }
}

const startEditNotes = (doc: BrokerAttorneyRetainerDocument) => {
  editingNotesId.value = doc.id
  editingNotesValue.value = doc.notes || ''
}

const saveNotes = async (doc: BrokerAttorneyRetainerDocument) => {
  try {
    const updated = await updateBrokerRetainerDocumentNotes(doc.id, editingNotesValue.value)
    const index = documents.value.findIndex(item => item.id === doc.id)
    if (index !== -1) documents.value[index] = updated
    editingNotesId.value = null
    editingNotesValue.value = ''
    toast.add({ title: 'Notes saved', color: 'success', icon: 'i-lucide-check' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to save notes'
    toast.add({ title: 'Error', description: message, color: 'error', icon: 'i-lucide-x' })
  }
}

const formatUploadedAt = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(load)
</script>

<template>
  <UDashboardPanel id="attorney-detail">
    <template #header>
      <UDashboardNavbar :title="attorney?.attorney_name || 'Attorney Profile'" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            class="rounded-lg"
            @click="router.push('/attorneys')"
          >
            Back
          </UButton>
          <UButton
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            @click="saveAttorney"
          >
            Save
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="flex items-center justify-center py-20">
        <UIcon name="i-lucide-loader-2" class="size-7 animate-spin text-[var(--ap-accent)]" />
      </div>

      <div v-else class="space-y-6">
        <!-- Row 1: Core Identity + Contact Details -->
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">

          <!-- ── Core Identity ── -->
          <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
              <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
              <div class="relative flex items-center gap-3 px-5 py-3.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
                  <UIcon name="i-lucide-fingerprint" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <h3 class="text-[13px] font-semibold text-highlighted">Core Identity</h3>
              </div>
            </div>

            <div class="relative p-5 space-y-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Attorney Name <span class="text-red-400/80">*</span>
                  </label>
                  <UInput
                    v-model="form.attorney_name"
                    placeholder="Jane Doe, Esq."
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Firm Name
                  </label>
                  <UInput
                    v-model="form.firm_name"
                    placeholder="Doe & Associates"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Years Experience
                  </label>
                  <UInput
                    v-model.number="form.years_experience"
                    type="number"
                    min="0"
                    placeholder="10"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Languages
                  </label>
                  <UInputMenu
                    v-model="form.languages"
                    :items="LANGUAGE_OPTIONS"
                    multiple
                    searchable
                    placeholder="Select languages"
                    class="w-full"
                    :ui="{ tagsItem: 'hidden' }"
                  />
                  <div v-if="form.languages.length" class="flex flex-wrap gap-1.5 pt-0.5">
                    <span
                      v-for="lang in form.languages"
                      :key="lang"
                      class="rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90"
                    >
                      {{ lang }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-medium text-highlighted">
                  Bio
                </label>
                <UTextarea
                  v-model="form.bio"
                  :rows="3"
                  placeholder="Brief profile description for this attorney..."
                  autocomplete="off"
                  class="w-full"
                />
                <p class="text-[11px] text-muted">
                  Optional — what clients should know about this attorney.
                </p>
              </div>
            </div>
          </div>

          <!-- ── Contact Details ── -->
          <div class="ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

            <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
              <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
              <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
              <div class="relative flex items-center gap-3 px-5 py-3.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
                  <UIcon name="i-lucide-phone" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <h3 class="text-[13px] font-semibold text-highlighted">Contact Details</h3>
              </div>
            </div>

            <div class="relative p-5 space-y-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Primary Email
                  </label>
                  <UInput
                    v-model="form.primary_email"
                    type="email"
                    placeholder="attorney@firm.com"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Personal Email
                  </label>
                  <UInput
                    v-model="form.personal_email"
                    type="email"
                    placeholder="attorney@gmail.com"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Direct Phone
                  </label>
                  <UInput
                    v-model="form.direct_phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Preferred Contact
                  </label>
                  <USelect
                    v-model="form.preferred_contact"
                    :items="CONTACT_METHOD_OPTIONS"
                    value-key="value"
                    label-key="label"
                    placeholder="Select method"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-xs font-medium text-highlighted">
                  Office Address
                </label>
                <div class="grid grid-cols-3 gap-2.5">
                  <UInput
                    v-model="addressStreet"
                    placeholder="Street Address"
                    autocomplete="off"
                    size="md"
                  />
                  <UInput
                    v-model="addressSuite"
                    placeholder="Suite / Unit"
                    autocomplete="off"
                    size="md"
                  />
                  <UInput
                    v-model="addressCity"
                    placeholder="City"
                    autocomplete="off"
                    size="md"
                  />
                </div>
                <div class="grid grid-cols-2 gap-2.5">
                  <USelect
                    v-model="addressState"
                    :items="addressStateOptions"
                    value-key="value"
                    label-key="label"
                    placeholder="State"
                  />
                  <UInput
                    v-model="addressZip"
                    placeholder="ZIP Code"
                    autocomplete="off"
                    size="md"
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-medium text-highlighted">
                  Website URL
                </label>
                <UInput
                  v-model="form.website_url"
                  type="url"
                  placeholder="https://firm.com"
                  autocomplete="off"
                  size="md"
                  class="w-full"
                />
              </div>

              <!-- Support Staff -->
              <div class="relative mt-1 rounded-xl border border-[var(--ap-accent)]/20 overflow-hidden">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="relative flex items-center gap-2 border-b border-[var(--ap-accent)]/10 px-4 py-2.5">
                  <UIcon name="i-lucide-users" class="text-xs text-[var(--ap-accent)]" />
                  <span class="text-xs font-semibold text-highlighted">Support Staff</span>
                  <span class="text-[11px] text-muted">(optional)</span>
                </div>
                <div class="p-4">
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div class="space-y-1.5">
                      <label class="text-xs font-medium text-highlighted">
                        Assistant Name
                      </label>
                      <UInput
                        v-model="form.assistant_name"
                        placeholder="Jane Smith"
                        autocomplete="off"
                        size="md"
                        class="w-full"
                      />
                    </div>
                    <div class="space-y-1.5">
                      <label class="text-xs font-medium text-highlighted">
                        Assistant Email
                      </label>
                      <UInput
                        v-model="form.assistant_email"
                        type="email"
                        placeholder="assistant@firm.com"
                        autocomplete="off"
                        size="md"
                        class="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Row 2: Transfer Standards + Retainer Documents (side-by-side) -->
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">

        <div class="ap-fade-in ap-delay-3 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
            <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
                  <UIcon name="i-lucide-shield-check" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <h3 class="text-[13px] font-semibold text-highlighted">Transfer Standards</h3>
              </div>
              <p class="hidden sm:block text-[11px] text-muted">
                Define when this attorney accepts cases.
              </p>
            </div>
          </div>

          <div class="relative p-5 space-y-5">
            <div class="grid gap-4">
              <!-- SOL standard -->
              <div
                class="relative overflow-hidden rounded-xl border transition-colors"
                :class="usesSol ? 'border-[var(--ap-accent)]/35 bg-[var(--ap-accent)]/[0.03]' : 'border-black/[0.06] dark:border-white/[0.08]'"
              >
                <div class="relative flex items-center justify-between gap-3 border-b px-4 py-3"
                  :class="usesSol ? 'border-[var(--ap-accent)]/15' : 'border-black/[0.06] dark:border-white/[0.06]'">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-6 w-6 items-center justify-center rounded-md border-[0.5px] border-[var(--ap-accent)]/35 bg-[var(--ap-accent)]/10">
                      <UIcon name="i-lucide-clock-3" class="text-[10px] text-[var(--ap-accent)]" />
                    </div>
                    <div>
                      <p class="text-xs font-semibold text-highlighted">Statute of Limitations</p>
                      <p class="mt-0.5 text-[11px] text-muted">Accept cases within an SOL window.</p>
                    </div>
                  </div>
                  <UCheckbox v-model="usesSol" />
                </div>

                <div v-if="usesSol" class="space-y-4 p-4">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">SOL Standard</label>
                    <USelect
                      v-model="form.transfer_sol_option"
                      :items="TRANSFER_SOL_OPTIONS"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                    />
                  </div>
                  <div v-if="form.transfer_sol_option === 'other'" class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Other SOL</label>
                    <UInput
                      v-model="form.transfer_sol_other"
                      placeholder="Custom SOL"
                      autocomplete="off"
                      size="md"
                      class="w-full"
                    />
                  </div>
                </div>
              </div>

              <!-- Injury types -->
              <div
                class="relative overflow-hidden rounded-xl border transition-colors"
                :class="usesInjuryTypes ? 'border-[var(--ap-accent)]/35 bg-[var(--ap-accent)]/[0.03]' : 'border-black/[0.06] dark:border-white/[0.08]'"
              >
                <div class="relative flex items-center justify-between gap-3 border-b px-4 py-3"
                  :class="usesInjuryTypes ? 'border-[var(--ap-accent)]/15' : 'border-black/[0.06] dark:border-white/[0.06]'">
                  <div class="flex items-center gap-2.5">
                    <div class="flex h-6 w-6 items-center justify-center rounded-md border-[0.5px] border-[var(--ap-accent)]/35 bg-[var(--ap-accent)]/10">
                      <UIcon name="i-lucide-stethoscope" class="text-[10px] text-[var(--ap-accent)]" />
                    </div>
                    <div>
                      <p class="text-xs font-semibold text-highlighted">Types of Injury</p>
                      <p class="mt-0.5 text-[11px] text-muted">Restrict to specific injury categories.</p>
                    </div>
                  </div>
                  <UCheckbox v-model="usesInjuryTypes" />
                </div>

                <div v-if="usesInjuryTypes" class="space-y-4 p-4">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Accepted Injury Types</label>
                    <UInputMenu
                      v-model="form.transfer_injury_types"
                      :items="INJURY_TYPE_OPTIONS"
                      multiple
                      searchable
                      placeholder="Select injury types"
                      class="w-full"
                      :ui="{ tagsItem: 'hidden' }"
                    />
                    <div v-if="form.transfer_injury_types.length" class="flex flex-wrap gap-1.5 pt-0.5">
                      <span
                        v-for="type in form.transfer_injury_types"
                        :key="type"
                        class="rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90"
                      >
                        {{ type }}
                      </span>
                    </div>
                  </div>
                  <div v-if="hasOtherInjuryType" class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Other Injury Type</label>
                    <UInput
                      v-model="form.transfer_injury_other"
                      placeholder="Custom injury type"
                      autocomplete="off"
                      size="md"
                      class="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Row 3: Retainer Contract Documents (kept) -->
        <div class="ap-fade-in ap-delay-4 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
            <div class="relative flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-3">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
                  <UIcon name="i-lucide-file-text" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <div>
                  <h3 class="text-[13px] font-semibold text-highlighted">Retainer Contract Documents</h3>
                  <p class="mt-0.5 text-[11px] text-muted">Documents are scoped by broker and attorney profile.</p>
                </div>
              </div>
              <span class="text-xs text-muted">{{ documents.length }} {{ documents.length === 1 ? 'document' : 'documents' }}</span>
            </div>
          </div>

          <div class="relative p-5">
              <div class="space-y-4">
                <div v-if="canAddDocument" class="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-start">
                  <UFormField label="State">
                    <USelect
                      v-model="newDocument.state"
                      :items="availableDocumentStates"
                      placeholder="Select state"
                    />
                  </UFormField>

                  <UFormField label="Document">
                    <input
                      ref="fileInput"
                      type="file"
                      class="hidden"
                      :accept="BROKER_RETAINER_DOCUMENT_ACCEPT"
                      @change="handleFileSelected"
                    >
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--ap-accent)]/30 px-3 py-2 text-xs font-medium text-muted transition hover:border-[var(--ap-accent)]/60 hover:text-[var(--ap-accent)]"
                        @click="openFilePicker"
                      >
                        <UIcon name="i-lucide-upload" class="size-4 text-[var(--ap-accent)]" />
                        <span class="truncate">{{ newDocument.file?.name || `Upload PDF, DOC, or DOCX (${maxFileSizeLabel} max)` }}</span>
                      </button>
                      <UButton
                        v-if="newDocument.file"
                        icon="i-lucide-x"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        @click="newDocument.file = null"
                      />
                    </div>
                  </UFormField>

                  <UButton
                    icon="i-lucide-check"
                    :loading="uploadingDocument"
                    :disabled="!newDocument.state || !newDocument.file"
                    class="mt-6 rounded-lg"
                    @click="uploadDocument"
                  >
                    Upload
                  </UButton>

                  <UFormField class="lg:col-span-3" label="Notes">
                    <UTextarea v-model="newDocument.notes" :rows="2" placeholder="Optional document notes" />
                  </UFormField>
                </div>

                <div v-if="!documents.length" class="rounded-lg border border-dashed border-black/[0.08] p-8 text-center dark:border-white/[0.08]">
                  <UIcon name="i-lucide-file-plus-2" class="mx-auto size-7 text-muted" />
                  <p class="mt-2 text-sm font-medium text-highlighted">No documents uploaded</p>
                </div>

                <div v-else class="divide-y divide-black/[0.06] rounded-xl border border-black/[0.06] px-4 dark:divide-white/[0.06] dark:border-white/[0.08]">
                  <div
                    v-for="doc in documents"
                    :key="doc.id"
                    class="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div class="min-w-0 flex gap-3">
                      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 text-[11px] font-bold text-[var(--ap-accent)]">
                        {{ doc.state }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="truncate text-sm font-medium text-highlighted">{{ doc.document_name }}</p>
                          <span class="rounded-md bg-[var(--ap-accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ap-accent)]">
                            {{ getBrokerRetainerDocumentKind(doc.document_mime_type, doc.document_name).toUpperCase() }}
                          </span>
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>{{ getBrokerRetainerDocumentStateName(doc.state) }}</span>
                          <span>{{ formatBrokerRetainerDocumentFileSize(doc.document_size_bytes) }}</span>
                          <span>{{ formatUploadedAt(doc.created_at) }}</span>
                        </div>

                        <div v-if="editingNotesId === doc.id" class="mt-3 space-y-2">
                          <UTextarea v-model="editingNotesValue" :rows="2" />
                          <div class="flex gap-2">
                            <UButton
                              size="xs"
                              @click="saveNotes(doc)"
                            >
                              Save
                            </UButton>
                            <UButton
                              size="xs"
                              color="neutral"
                              variant="ghost"
                              @click="editingNotesId = null"
                            >
                              Cancel
                            </UButton>
                          </div>
                        </div>
                        <p v-else-if="doc.notes" class="mt-2 rounded-lg bg-[var(--ap-accent)]/[0.04] px-3 py-2 text-xs text-muted">
                          {{ doc.notes }}
                        </p>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-1">
                      <UButton
                        icon="i-lucide-eye"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :loading="openingDocumentId === doc.id"
                        :aria-label="`Open ${doc.document_name}`"
                        @click="openDocument(doc)"
                      />
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :aria-label="`Edit notes for ${doc.document_name}`"
                        @click="startEditNotes(doc)"
                      />
                      <UButton
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="text-red-400 hover:text-red-300"
                        :aria-label="`Delete ${doc.document_name}`"
                        @click="removeDocument(doc)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
