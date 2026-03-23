<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile, type AttorneyProfileState } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import {
  deleteRetainerContractDocument,
  formatDocumentFileSize,
  getRetainerContractDocumentKind,
  getRetainerContractDocumentSignedUrl,
  RETAINER_CONTRACT_DOCUMENT_ACCEPT,
  RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES,
  uploadRetainerContractDocument,
  validateRetainerContractDocument
} from '../../lib/attorney-profile'

const RETAINER_CONTRACT_FIELDS: Array<keyof AttorneyProfileState> = [
  'retainerContractDocumentPath',
  'retainerContractDocumentName',
  'retainerContractDocumentMimeType',
  'retainerContractDocumentSizeBytes',
  'retainerContractDocumentUploadedAt'
]

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const toast = useToast()
const router = useRouter()

const saving = ref(false)
const openingDocument = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const removeExistingDocument = ref(false)

const userId = computed(() => auth.state.value.user?.id ?? '')
const isEditing = computed(() => attorneyProfile.isEditing.value)
const hasSavedDocument = computed(() => Boolean(attorneyProfile.state.value.retainerContractDocumentPath))
const hasPendingChanges = computed(() => Boolean(selectedFile.value) || removeExistingDocument.value)
const hasUnsavedChanges = computed(() => attorneyProfile.isDirty.value || hasPendingChanges.value)

const currentDocumentPath = computed(() => attorneyProfile.state.value.retainerContractDocumentPath ?? '')
const currentDocumentName = computed(() => attorneyProfile.state.value.retainerContractDocumentName ?? '')
const currentDocumentMimeType = computed(() => attorneyProfile.state.value.retainerContractDocumentMimeType ?? '')
const currentDocumentSizeBytes = computed(() => attorneyProfile.state.value.retainerContractDocumentSizeBytes)
const currentDocumentUploadedAt = computed(() => attorneyProfile.state.value.retainerContractDocumentUploadedAt ?? '')

const documentKindLabel = computed(() => {
  const kind = getRetainerContractDocumentKind(
    selectedFile.value?.type || currentDocumentMimeType.value,
    selectedFile.value?.name || currentDocumentName.value
  )

  if (kind === 'pdf') return 'PDF'
  if (kind === 'word') return 'Word'
  return 'Document'
})

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

const resetLocalDocumentChanges = () => {
  selectedFile.value = null
  removeExistingDocument.value = false

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const startEditing = () => {
  attorneyProfile.startEditing()
}

const cancelEditing = () => {
  resetLocalDocumentChanges()
  attorneyProfile.cancelEditing()
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const clearSelectedFile = () => {
  selectedFile.value = null

  if (fileInput.value) {
    fileInput.value.value = ''
  }
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

  selectedFile.value = file
  removeExistingDocument.value = false
}

const markDocumentForRemoval = () => {
  clearSelectedFile()
  removeExistingDocument.value = true
}

const undoRemoveDocument = () => {
  removeExistingDocument.value = false
}

const openSelectedFilePreview = () => {
  if (!selectedFile.value) return

  const previewUrl = URL.createObjectURL(selectedFile.value)
  const previewWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer')

  if (!previewWindow) {
    URL.revokeObjectURL(previewUrl)
    toast.add({
      title: 'Preview blocked',
      description: 'Please allow pop-ups for this site to preview the selected document.',
      icon: 'i-lucide-file-search',
      color: 'warning'
    })
    return
  }

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000)
}

const openSavedDocument = async () => {
  if (!currentDocumentPath.value) return

  openingDocument.value = true
  try {
    const signedUrl = await getRetainerContractDocumentSignedUrl(currentDocumentPath.value)
    const previewWindow = window.open(signedUrl, '_blank', 'noopener,noreferrer')

    if (!previewWindow) {
      toast.add({
        title: 'Preview blocked',
        description: 'Please allow pop-ups for this site to open the saved document.',
        icon: 'i-lucide-file-search',
        color: 'warning'
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to open retainer contract document'
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

const persistDocumentChanges = async () => {
  if (!userId.value) return

  if (removeExistingDocument.value) {
    const pathToDelete = currentDocumentPath.value

    attorneyProfile.draft.value.retainerContractDocumentPath = ''
    attorneyProfile.draft.value.retainerContractDocumentName = ''
    attorneyProfile.draft.value.retainerContractDocumentMimeType = ''
    attorneyProfile.draft.value.retainerContractDocumentSizeBytes = undefined
    attorneyProfile.draft.value.retainerContractDocumentUploadedAt = ''

    await attorneyProfile.commitEditing(userId.value, RETAINER_CONTRACT_FIELDS)

    if (pathToDelete) {
      try {
        await deleteRetainerContractDocument(pathToDelete)
      } catch (deleteError) {
        const deleteMessage = deleteError instanceof Error ? deleteError.message : 'The document metadata was removed, but storage cleanup failed.'
        toast.add({
          title: 'Document metadata removed',
          description: deleteMessage,
          icon: 'i-lucide-triangle-alert',
          color: 'warning'
        })
      }
    }

    toast.add({
      title: 'Success',
      description: 'Your retainer contract document has been removed.',
      icon: 'i-lucide-check',
      color: 'success'
    })

    resetLocalDocumentChanges()
    return
  }

  if (!selectedFile.value) {
    resetLocalDocumentChanges()
    attorneyProfile.cancelEditing()
    return
  }

  const hadSavedDocument = hasSavedDocument.value
  const uploadedDocument = await uploadRetainerContractDocument(userId.value, selectedFile.value)

  attorneyProfile.draft.value.retainerContractDocumentPath = uploadedDocument.path
  attorneyProfile.draft.value.retainerContractDocumentName = uploadedDocument.name
  attorneyProfile.draft.value.retainerContractDocumentMimeType = uploadedDocument.mimeType
  attorneyProfile.draft.value.retainerContractDocumentSizeBytes = uploadedDocument.sizeBytes
  attorneyProfile.draft.value.retainerContractDocumentUploadedAt = uploadedDocument.uploadedAt

  await attorneyProfile.commitEditing(userId.value, RETAINER_CONTRACT_FIELDS)

  toast.add({
    title: 'Success',
    description: hadSavedDocument
      ? 'Your retainer contract document has been replaced.'
      : 'Your retainer contract document has been uploaded.',
    icon: 'i-lucide-check',
    color: 'success'
  })

  resetLocalDocumentChanges()
}

async function onSubmit() {
  if (!userId.value) return false

  saving.value = true
  try {
    await persistDocumentChanges()
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to save retainer contract document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

async function onFinish() {
  await onSubmit()
}

async function onBack() {
  const saved = await onSubmit()
  if (saved) {
    attorneyProfile.startEditing()
    router.push('/settings/expertise')
  }
}

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
  }
})

const unsavedOpen = ref(false)
const pendingNav = ref<null | (() => void)>(null)

const handleConfirmDiscard = () => {
  resetLocalDocumentChanges()
  attorneyProfile.cancelEditing()
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
  if (isEditing.value && hasUnsavedChanges.value) {
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

  <form class="space-y-6" @submit.prevent="onFinish">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Retainer Contract Document
          </h2>
          <p class="text-xs text-muted">
            Upload the agreement your firm wants attached to its attorney profile for onboarding and review.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          v-if="!isEditing && hasSavedDocument"
          type="button"
          label="View Document"
          icon="i-lucide-external-link"
          color="neutral"
          variant="outline"
          class="rounded-lg"
          :loading="openingDocument"
          @click="openSavedDocument"
        />

        <UButton
          v-if="!isEditing"
          label="Edit"
          color="neutral"
          variant="outline"
          icon="i-lucide-pencil"
          class="rounded-lg"
          @click="startEditing"
        />

        <template v-else>
          <UButton
            label="Back"
            type="button"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            :loading="saving"
            class="rounded-lg"
            @click="onBack"
          />
          <UButton
            label="Finish"
            type="submit"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          />
          <UButton
            label="Cancel"
            type="button"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelEditing"
          />
        </template>
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-folder-open" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Document Upload</span>
        </div>
      </div>

      <div class="space-y-4 px-5 py-4">
        <div class="rounded-xl border border-[var(--ap-card-border)] bg-black/10 p-4">
          <div class="flex items-start justify-between gap-4 max-sm:flex-col">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">
                Retainer contract file
              </p>
              <p class="mt-1 text-xs text-muted">
                Accepted formats: PDF, DOC, and DOCX. Maximum file size: {{ maxFileSizeLabel }}.
              </p>
              <p class="mt-1 text-xs text-muted">
                The file is stored privately in Supabase Storage and linked to your attorney profile record.
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:flex-wrap">
              <input
                ref="fileInput"
                type="file"
                class="hidden"
                :accept="RETAINER_CONTRACT_DOCUMENT_ACCEPT"
                @change="handleFileSelected"
              >

              <UButton
                v-if="isEditing"
                type="button"
                :label="hasSavedDocument || selectedFile ? 'Replace Document' : 'Upload Document'"
                icon="i-lucide-upload"
                class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
                @click="openFilePicker"
              />
              <UButton
                v-if="isEditing && selectedFile"
                type="button"
                label="Clear Selection"
                color="neutral"
                variant="ghost"
                class="rounded-lg"
                @click="clearSelectedFile"
              />
              <UButton
                v-if="isEditing && hasSavedDocument && !removeExistingDocument"
                type="button"
                label="Remove Document"
                color="neutral"
                variant="ghost"
                class="rounded-lg text-red-400 hover:text-red-300"
                @click="markDocumentForRemoval"
              />
            </div>
          </div>
        </div>

        <div
          v-if="removeExistingDocument"
          class="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
        >
          <div class="flex items-start justify-between gap-3 max-sm:flex-col">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">
                Document scheduled for removal
              </p>
              <p class="mt-1 text-xs text-muted">
                Save changes to remove the current retainer contract document from your profile.
              </p>
            </div>

            <UButton
              type="button"
              label="Undo"
              color="neutral"
              variant="ghost"
              class="rounded-lg"
              @click="undoRemoveDocument"
            />
          </div>
        </div>

        <button
          v-else-if="selectedFile"
          type="button"
          class="group w-full rounded-xl border border-[var(--ap-card-border)] bg-black/10 p-4 text-left transition hover:border-[var(--ap-accent)]/40 hover:bg-black/15"
          @click="openSelectedFilePreview"
        >
          <div class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ selectedFile.name }}
                  </p>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ documentKindLabel }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">
                  Pending upload | {{ formatDocumentFileSize(selectedFile.size) }}
                </p>
                <p v-if="hasSavedDocument" class="mt-1 text-xs text-muted">
                  Your current saved document remains active until you click Finish.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1 text-xs font-medium text-[var(--ap-accent)]">
              <span>Preview</span>
              <UIcon name="i-lucide-arrow-up-right" class="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </button>

        <button
          v-else-if="hasSavedDocument"
          type="button"
          class="group w-full rounded-xl border border-[var(--ap-card-border)] bg-black/10 p-4 text-left transition hover:border-[var(--ap-accent)]/40 hover:bg-black/15"
          @click="openSavedDocument"
        >
          <div class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ currentDocumentName }}
                  </p>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ documentKindLabel }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ formatDocumentFileSize(currentDocumentSizeBytes) }}<span v-if="currentDocumentUploadedAt"> | Uploaded {{ formatUploadedAt(currentDocumentUploadedAt) }}</span>
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1 text-xs font-medium text-[var(--ap-accent)]">
              <span>Open document</span>
              <UIcon name="i-lucide-arrow-up-right" class="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </button>

        <div
          v-else
          class="rounded-xl border border-dashed border-[var(--ap-card-border)] bg-black/10 px-4 py-10 text-center"
        >
          <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ap-accent)]/10">
            <UIcon name="i-lucide-file-plus-2" class="text-xl text-[var(--ap-accent)]" />
          </div>
          <p class="text-sm font-medium text-highlighted">
            No retainer contract document uploaded
          </p>
          <p class="mt-1 text-xs text-muted">
            Add your firm's PDF or Word document to complete this onboarding step.
          </p>
        </div>
      </div>
    </div>
  </form>
</template>
