<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import {
  formatDocumentFileSize,
  getRetainerContractDocumentKind,
  getMultiStateDocumentSignedUrl,
  RETAINER_CONTRACT_DOCUMENT_ACCEPT,
  RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES,
  validateRetainerContractDocument,
  uploadMultiStateDocument,
  getUserDocuments,
  deleteMultiStateDocument,
  updateDocumentNotes,
  US_STATES_OPTIONS,
  getStateName,
  type RetainerContractDocument
} from '../../lib/attorney-profile'

const auth = useAuth()
const toast = useToast()
const router = useRouter()

const userId = computed(() => auth.state.value.user?.id ?? '')

const documents = ref<RetainerContractDocument[]>([])
const loading = ref(false)
const saving = ref(false)
const openingDocument = ref(false)

const showAddForm = ref(false)
const newDocument = ref({
  state: '',
  file: null as File | null,
  notes: ''
})
const fileInput = ref<HTMLInputElement | null>(null)

const editingNotesId = ref<string | null>(null)
const editingNotesValue = ref('')

const usedStates = computed(() => new Set(documents.value.map(d => d.state)))
const availableStates = computed(() => 
  US_STATES_OPTIONS.filter(opt => !usedStates.value.has(opt.value))
)
const canAddMore = computed(() => availableStates.value.length > 0)

const maxFileSizeLabel = `${Math.round(RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB`

const formatUploadedAt = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

const resetNewDocument = () => {
  newDocument.value = { state: '', file: null, notes: '' }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const validationError = validateRetainerContractDocument(file)
  if (validationError) {
    toast.add({
      title: 'Invalid document',
      description: validationError,
      icon: 'i-lucide-file-warning',
      color: 'error'
    })
    input.value = ''
    return
  }

  newDocument.value.file = file
}

const clearSelectedFile = () => {
  newDocument.value.file = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const startAddDocument = () => {
  resetNewDocument()
  showAddForm.value = true
}

const cancelAddDocument = () => {
  resetNewDocument()
  showAddForm.value = false
}

const saveNewDocument = async () => {
  if (!userId.value) return
  if (!newDocument.value.state || !newDocument.value.file) {
    toast.add({
      title: 'Missing information',
      description: 'Please select a state and upload a document.',
      icon: 'i-lucide-alert-circle',
      color: 'warning'
    })
    return
  }

  saving.value = true
  try {
    const doc = await uploadMultiStateDocument(
      userId.value,
      newDocument.value.state,
      newDocument.value.file,
      newDocument.value.notes || undefined
    )
    documents.value.unshift(doc)
    showAddForm.value = false
    resetNewDocument()
    toast.add({
      title: 'Success',
      description: 'Document uploaded successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const openDocument = async (doc: RetainerContractDocument) => {
  openingDocument.value = true
  try {
    const signedUrl = await getMultiStateDocumentSignedUrl(doc.document_path)
    const previewWindow = window.open(signedUrl, '_blank', 'noopener,noreferrer')
    if (!previewWindow) {
      toast.add({
        title: 'Preview blocked',
        description: 'Please allow pop-ups for this site to open the document.',
        icon: 'i-lucide-file-search',
        color: 'warning'
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to open document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    openingDocument.value = false
  }
}

const removeDocument = async (doc: RetainerContractDocument) => {
  if (!confirm(`Are you sure you want to delete the document for ${getStateName(doc.state)}?`)) {
    return
  }

  try {
    await deleteMultiStateDocument(doc.id)
    documents.value = documents.value.filter(d => d.id !== doc.id)
    toast.add({
      title: 'Success',
      description: 'Document deleted successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  }
}

const startEditNotes = (doc: RetainerContractDocument) => {
  editingNotesId.value = doc.id
  editingNotesValue.value = doc.notes || ''
}

const cancelEditNotes = () => {
  editingNotesId.value = null
  editingNotesValue.value = ''
}

const saveNotes = async (doc: RetainerContractDocument) => {
  try {
    const updated = await updateDocumentNotes(doc.id, editingNotesValue.value)
    const index = documents.value.findIndex(d => d.id === doc.id)
    if (index !== -1) {
      documents.value[index] = updated
    }
    editingNotesId.value = null
    editingNotesValue.value = ''
    toast.add({
      title: 'Success',
      description: 'Notes updated successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update notes'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  }
}

const goToPreviousStep = () => {
  router.push('/settings/team-profile')
}

const loadDocuments = async () => {
  if (!userId.value) return
  loading.value = true
  try {
    documents.value = await getUserDocuments(userId.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load documents'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await loadDocuments()
  }
})

const unsavedOpen = ref(false)
const pendingNav = ref<null | (() => void)>(null)

const handleConfirmDiscard = () => {
  unsavedOpen.value = false
  const go = pendingNav.value
  pendingNav.value = null
  go?.()
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((_to, _from, next) => {
  if (showAddForm.value && (newDocument.value.state || newDocument.value.file)) {
    pendingNav.value = () => next()
    unsavedOpen.value = true
    next(false)
    return
  }
  next()
})
</script>

<template>
  <UnsavedChangesModal
    :open="unsavedOpen"
    @update:open="(v) => { unsavedOpen = v }"
    @confirm="handleConfirmDiscard"
    @cancel="handleStay"
  />

  <div class="space-y-6">
    <!-- ═══ Page Header ═══ -->
    <div class="ap-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
          <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
          <div
            class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1a1a] transition-colors"
            :class="showAddForm ? 'bg-[var(--ap-accent)]' : 'bg-emerald-400'"
          />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted tracking-tight">
            Retainer Contract Documents
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Upload retainer agreement documents for different states.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          type="button"
          label="Back"
          icon="i-lucide-arrow-left"
          variant="outline"
          class="group rounded-lg border-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)] transition-colors duration-200"
          :ui="{ leadingIcon: 'text-[var(--ap-accent)] group-hover:text-white transition duration-200 group-hover:-translate-x-0.5' }"
          @click="goToPreviousStep"
        />
        <UButton
          v-if="canAddMore && !showAddForm"
          label="Add Document"
          icon="i-lucide-plus"
          class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
          @click="startAddDocument"
        />
      </div>
    </div>

    <!-- ═══ Add Document Form ═══ -->
    <div v-if="showAddForm" class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex items-center gap-3 px-5 py-3.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
            <UIcon name="i-lucide-plus-circle" class="text-xs text-[var(--ap-accent)]" />
          </div>
          <h3 class="text-[13px] font-semibold text-highlighted">
            Add New Document
          </h3>
        </div>
      </div>

      <div class="relative space-y-4 px-5 py-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              State <span class="text-red-400/80">*</span>
            </label>
            <USelect
              v-model="newDocument.state"
              :items="availableStates"
              placeholder="Select a state"
              class="w-full"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              Document <span class="text-red-400/80">*</span>
            </label>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              :accept="RETAINER_CONTRACT_DOCUMENT_ACCEPT"
              @change="handleFileSelected"
            >
            <div v-if="newDocument.file" class="flex items-center gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.04] px-3 py-2">
                <UIcon name="i-lucide-file-check" class="shrink-0 text-sm text-[var(--ap-accent)]" />
                <span class="truncate text-xs font-medium text-highlighted">{{ newDocument.file.name }}</span>
                <span class="shrink-0 rounded bg-[var(--ap-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--ap-accent)]">
                  {{ formatDocumentFileSize(newDocument.file.size) }}
                </span>
              </div>
              <UButton
                type="button"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                class="rounded-lg"
                @click="clearSelectedFile"
              />
            </div>
            <button
              v-else
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/[0.02] px-4 py-3 text-xs font-medium text-muted transition-colors hover:border-[var(--ap-accent)]/50 hover:bg-[var(--ap-accent)]/[0.06] hover:text-[var(--ap-accent)]"
              @click="openFilePicker"
            >
              <UIcon name="i-lucide-upload" class="text-sm text-[var(--ap-accent)]" />
              Click to upload document
            </button>
            <p class="text-[11px] text-muted">
              Accepted: PDF, DOC, DOCX. Max: {{ maxFileSizeLabel }}
            </p>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-highlighted">
            Notes <span class="text-[11px] font-normal text-muted">(Optional)</span>
          </label>
          <UTextarea
            v-model="newDocument.notes"
            placeholder="Add any notes about this document..."
            :rows="3"
            class="w-full"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <UButton
            type="button"
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelAddDocument"
          />
          <UButton
            type="button"
            label="Save Document"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            :disabled="!newDocument.state || !newDocument.file"
            @click="saveNewDocument"
          />
        </div>
      </div>
    </div>

    <!-- ═══ Documents List ═══ -->
    <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex items-center justify-between px-5 py-3.5">
          <div class="flex items-center gap-3">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-folder-open" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Uploaded Documents
            </h3>
          </div>
          <span v-if="documents.length > 0" class="rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)] tabular-nums">
            {{ documents.length }} {{ documents.length === 1 ? 'document' : 'documents' }}
          </span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="relative px-5 py-16 text-center">
        <UIcon name="i-lucide-loader-2" class="mx-auto mb-2 text-2xl text-[var(--ap-accent)] animate-spin" />
        <p class="text-sm text-muted">Loading documents...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="documents.length === 0 && !showAddForm" class="relative px-5 py-16 text-center">
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
          <UIcon name="i-lucide-file-plus-2" class="text-2xl text-[var(--ap-accent)]" />
        </div>
        <p class="text-sm font-medium text-highlighted">No documents uploaded</p>
        <p class="mt-1 text-xs text-muted">Add your firm's retainer agreement documents for different states.</p>
        <UButton
          v-if="canAddMore"
          label="Add Document"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
          @click="startAddDocument"
        />
      </div>

      <!-- Documents -->
      <div v-else class="relative">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 px-5 py-4 transition-colors duration-200 hover:bg-[var(--ap-accent)]/[0.02]"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
                <span class="text-[11px] font-bold text-[var(--ap-accent)]">{{ doc.state }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ doc.document_name }}
                  </p>
                  <span class="rounded-md bg-[var(--ap-accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ap-accent)]">
                    {{ getRetainerContractDocumentKind(doc.document_mime_type, doc.document_name)?.toUpperCase() }}
                  </span>
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span class="rounded bg-black/[0.03] dark:bg-white/[0.06] px-1.5 py-0.5 text-[11px]">
                    {{ getStateName(doc.state) }}
                  </span>
                  <span>{{ formatDocumentFileSize(doc.document_size_bytes) }}</span>
                  <span class="text-white/20">|</span>
                  <span>{{ formatUploadedAt(doc.created_at) }}</span>
                </div>

                <!-- Notes Section -->
                <div v-if="editingNotesId === doc.id" class="mt-3">
                  <UTextarea
                    v-model="editingNotesValue"
                    placeholder="Add notes..."
                    :rows="2"
                    class="w-full"
                  />
                  <div class="mt-2 flex gap-2">
                    <UButton
                      type="button"
                      label="Save"
                      size="xs"
                      class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
                      @click="saveNotes(doc)"
                    />
                    <UButton
                      type="button"
                      label="Cancel"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      class="rounded-lg"
                      @click="cancelEditNotes"
                    />
                  </div>
                </div>
                <div v-else-if="doc.notes" class="mt-2 rounded-lg bg-[var(--ap-accent)]/[0.04] border border-[var(--ap-accent)]/10 px-3 py-2 text-xs text-muted">
                  <span class="font-medium text-[var(--ap-accent)]">Notes:</span> {{ doc.notes }}
                </div>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <UButton
                type="button"
                icon="i-lucide-eye"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="openingDocument"
                aria-label="View Document"
                class="rounded-lg"
                @click="openDocument(doc)"
              />
              <UButton
                type="button"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Edit Notes"
                class="rounded-lg"
                @click="startEditNotes(doc)"
              />
              <UButton
                type="button"
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Delete Document"
                class="rounded-lg text-red-400 hover:text-red-300"
                @click="removeDocument(doc)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
