<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GuideTopic, GuideSectionWithTopics } from '../../lib/product-guide'

const MAX_FILE_SIZE = 25 * 1024 * 1024

const props = defineProps<{
  open: boolean
  topic?: GuideTopic | null
  sectionId: string
  sections: GuideSectionWithTopics[]
  loading?: boolean
  topicCount?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: {
    section_id: string
    title: string
    overview: string
    description: string
    media_file: File | null
    remove_media: boolean
    sort_order: number
  }]
}>()

const toast = useToast()

const title = ref('')
const overview = ref('')
const description = ref('')
const selectedSectionId = ref('')
const selectedFile = ref<File | null>(null)
const removeMediaRequested = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const isEdit = computed(() => Boolean(props.topic))
const canSubmit = computed(() =>
  title.value.trim().length > 0 &&
  overview.value.trim().length > 0 &&
  selectedSectionId.value.length > 0
)

const sectionItems = computed(() =>
  props.sections.map((s) => ({ label: s.title, value: s.id }))
)

const mediaDisplayName = computed(() => {
  if (removeMediaRequested.value) return null
  if (selectedFile.value) return selectedFile.value.name
  if (props.topic?.media_url) {
    const url = props.topic.media_url
    const filename = url.split('/').pop() || 'Uploaded file'
    const parts = filename.split('.')
    if (parts.length >= 2 && parts[0].length > 20) {
      return `${props.topic.media_type === 'video' ? 'Video' : 'Image'} file (.${parts.slice(1).join('.')})`
    }
    return filename
  }
  return null
})

const mediaIcon = computed(() => {
  if (selectedFile.value) {
    return selectedFile.value.type.startsWith('video/') ? 'i-lucide-film' : 'i-lucide-image'
  }
  if (props.topic?.media_type === 'video') return 'i-lucide-film'
  if (props.topic?.media_type === 'image') return 'i-lucide-image'
  return 'i-lucide-paperclip'
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selectedFile.value = null
    removeMediaRequested.value = false

    if (props.topic) {
      title.value = props.topic.title
      overview.value = props.topic.overview
      description.value = props.topic.description || ''
      selectedSectionId.value = props.topic.section_id
    } else {
      title.value = ''
      overview.value = ''
      description.value = ''
      selectedSectionId.value = props.sectionId
    }
  }
)

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    toast.add({ title: 'Unsupported file type', description: 'Please upload an image or video.', color: 'error' })
    input.value = ''
    return
  }

  if (file.size > MAX_FILE_SIZE) {
    toast.add({ title: 'File too large', description: 'Maximum file size is 25 MB.', color: 'error' })
    input.value = ''
    return
  }

  selectedFile.value = file
  removeMediaRequested.value = false
  input.value = ''
}

const removeMedia = () => {
  selectedFile.value = null
  removeMediaRequested.value = Boolean(props.topic?.media_url)
}

const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    section_id: selectedSectionId.value,
    title: title.value.trim(),
    overview: overview.value.trim(),
    description: description.value.trim(),
    media_file: selectedFile.value,
    remove_media: removeMediaRequested.value,
    sort_order: isEdit.value ? (props.topic?.sort_order ?? 0) : (props.topicCount ?? 0)
  })
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="isEdit ? 'Edit Topic' : 'New Topic'"
    :description="isEdit ? 'Update the topic content below.' : 'Add a new topic to a section in your guide.'"
    :dismissible="false"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Row 1: Section + Title side by side -->
        <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
          <UFormField label="Section" required class="md:col-span-4">
            <USelect
              v-model="selectedSectionId"
              class="w-full"
              :items="sectionItems"
              placeholder="Select"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Title" required class="md:col-span-8">
            <UInput
              v-model="title"
              class="w-full"
              placeholder="e.g. Invoice Trend Chart"
              autocomplete="off"
            />
          </UFormField>
        </div>

        <!-- Overview -->
        <UFormField label="Overview" required>
          <UTextarea
            v-model="overview"
            class="w-full"
            placeholder="A brief summary of what this topic covers..."
            :rows="2"
            autoresize
          />
        </UFormField>

        <!-- Description -->
        <UFormField label="Detailed description">
          <UTextarea
            v-model="description"
            class="w-full"
            placeholder="Full explanation, workflow steps, notes..."
            :rows="3"
            autoresize
          />
        </UFormField>

        <!-- Media — compact inline attachment -->
        <UFormField label="Media">
          <div
            v-if="mediaDisplayName && !removeMediaRequested"
            class="flex items-center gap-2.5 rounded-lg border border-[var(--ap-card-border)] px-3 py-2"
          >
            <UIcon :name="mediaIcon" class="shrink-0 text-sm text-[var(--ap-accent)]" />
            <span class="min-w-0 flex-1 truncate text-[13px] text-highlighted">{{ mediaDisplayName }}</span>
            <span v-if="selectedFile" class="shrink-0 text-[11px] text-muted">{{ formatFileSize(selectedFile.size) }}</span>
            <button
              type="button"
              class="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-highlighted"
              title="Replace"
              @click="fileInputRef?.click()"
            >
              <UIcon name="i-lucide-replace" class="text-xs" />
            </button>
            <button
              type="button"
              class="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-red-500"
              title="Remove"
              @click="removeMedia"
            >
              <UIcon name="i-lucide-x" class="text-xs" />
            </button>
          </div>

          <button
            v-else
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-[var(--ap-card-border)] px-3 py-2 text-[13px] text-muted transition-colors hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/5 hover:text-[var(--ap-accent)]"
            @click="fileInputRef?.click()"
          >
            <UIcon name="i-lucide-upload" class="text-sm" />
            <span>Attach an image or video</span>
            <span class="ml-auto text-[11px]">Max 25 MB</span>
          </button>

          <p class="mt-2 text-[11px] text-muted">
            Large images are automatically resized and displayed in a fixed-height frame after upload.
          </p>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/*,video/*"
            class="hidden"
            @change="handleFileChange"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between">
        <p v-if="!isEdit" class="text-[12px] text-muted">
          Drag to reorder in the sidebar.
        </p>
        <span v-else />
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="props.loading"
            @click="emit('update:open', false)"
          >
            Cancel
          </UButton>
          <UButton
            :disabled="props.loading || !canSubmit"
            :loading="props.loading"
            @click="handleSubmit"
          >
            {{ isEdit ? 'Save Changes' : 'Create Topic' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
