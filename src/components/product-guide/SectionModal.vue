<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GuideSection } from '../../lib/product-guide'

const props = defineProps<{
  open: boolean
  section?: GuideSection | null
  loading?: boolean
  sectionCount?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { title: string; icon: string; sort_order: number }]
}>()

const title = ref('')
const icon = ref('i-lucide-book-open')

const isEdit = computed(() => Boolean(props.section))

const iconOptions = [
  { name: 'i-lucide-book-open', label: 'Book' },
  { name: 'i-lucide-layout-dashboard', label: 'Dashboard' },
  { name: 'i-lucide-map', label: 'Map' },
  { name: 'i-lucide-briefcase', label: 'Cases' },
  { name: 'i-lucide-package', label: 'Package' },
  { name: 'i-lucide-receipt', label: 'Receipt' },
  { name: 'i-lucide-tag', label: 'Tag' },
  { name: 'i-lucide-settings', label: 'Settings' },
  { name: 'i-lucide-users', label: 'Users' },
  { name: 'i-lucide-shield', label: 'Shield' },
  { name: 'i-lucide-globe', label: 'Globe' },
  { name: 'i-lucide-database', label: 'Database' },
  { name: 'i-lucide-file-text', label: 'File' },
  { name: 'i-lucide-bar-chart', label: 'Chart' },
  { name: 'i-lucide-layers', label: 'Layers' },
  { name: 'i-lucide-zap', label: 'Zap' },
  { name: 'i-lucide-bell', label: 'Bell' },
  { name: 'i-lucide-mail', label: 'Mail' },
  { name: 'i-lucide-calendar', label: 'Calendar' },
  { name: 'i-lucide-clipboard', label: 'Clipboard' }
]

watch(
  () => props.open,
  (open) => {
    if (!open) return
    if (props.section) {
      title.value = props.section.title
      icon.value = props.section.icon
    } else {
      title.value = ''
      icon.value = 'i-lucide-book-open'
    }
  }
)

const canSubmit = computed(() => title.value.trim().length > 0)

const handleSubmit = () => {
  if (!canSubmit.value) return
  emit('submit', {
    title: title.value.trim(),
    icon: icon.value,
    sort_order: isEdit.value ? (props.section?.sort_order ?? 0) : (props.sectionCount ?? 0)
  })
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="isEdit ? 'Edit Section' : 'New Section'"
    :description="isEdit ? 'Update the section details below.' : 'Create a new section to organize your guide topics.'"
    :dismissible="false"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Title input with live icon preview -->
        <UFormField label="Section title" required>
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10"
            >
              <UIcon :name="icon" class="text-sm text-[var(--ap-accent)]" />
            </div>
            <UInput
              v-model="title"
              placeholder="e.g. Dashboard Overview"
              autocomplete="off"
              class="flex-1"
            />
          </div>
        </UFormField>

        <!-- Icon picker -->
        <UFormField label="Icon">
          <div class="grid grid-cols-10 gap-1">
            <button
              v-for="opt in iconOptions"
              :key="opt.name"
              type="button"
              :title="opt.label"
              class="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
              :class="icon === opt.name
                ? 'bg-[var(--ap-accent)]/10 text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/30'
                : 'text-muted hover:bg-[var(--ap-card-hover)] hover:text-highlighted'"
              @click="icon = opt.name"
            >
              <UIcon :name="opt.name" class="text-sm" />
            </button>
          </div>
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
            {{ isEdit ? 'Save Changes' : 'Create Section' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
