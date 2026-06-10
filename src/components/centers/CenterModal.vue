<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue'
import type { CenterRow } from '../../lib/centers'

const props = defineProps<{
  open: boolean
  center?: CenterRow | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'after:leave': []
  'submit': [
    payload:
      | { mode: 'create'; center_name: string; lead_vendor: string; contact_email: string }
      | { mode: 'edit'; id: string; center_name: string; lead_vendor: string; contact_email: string }
  ]
}>()

const centerName = ref('')
const leadVendor = ref('')
const contactEmail = ref('')

const isEditMode = computed(() => Boolean(props.center))

const canSubmit = () => {
  if (isEditMode.value) return centerName.value.trim().length > 0
  return centerName.value.trim().length > 0
}

const resetForm = () => {
  centerName.value = ''
  leadVendor.value = ''
  contactEmail.value = ''
}

onMounted(() => {
  if (props.center) {
    centerName.value = props.center.center_name
    leadVendor.value = props.center.lead_vendor || ''
    contactEmail.value = props.center.contact_email || ''
  }
})

onUpdated(() => {
  if (props.center && isEditMode.value) {
    centerName.value = props.center.center_name
    leadVendor.value = props.center.lead_vendor || ''
    contactEmail.value = props.center.contact_email || ''
  }
})

const handleClose = () => {
  resetForm()
  emit('update:open', false)
}

const handleSubmit = () => {
  if (!canSubmit()) return

  if (isEditMode.value && props.center) {
    emit('submit', {
      mode: 'edit',
      id: props.center.id,
      center_name: centerName.value.trim(),
      lead_vendor: leadVendor.value.trim(),
      contact_email: contactEmail.value.trim()
    })
    return
  }

  emit('submit', {
    mode: 'create',
    center_name: centerName.value.trim(),
    lead_vendor: leadVendor.value.trim(),
    contact_email: contactEmail.value.trim()
  })
}

const handleUpdateOpen = (value: boolean) => {
  if (!value) {
    resetForm()
  }
  emit('update:open', value)
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="isEditMode ? 'Edit center' : 'Add center'"
    :dismissible="false"
    @update:open="handleUpdateOpen"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Center name" required>
          <UInput
            v-model="centerName"
            placeholder="Enter center name"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>

        <UFormField label="Lead vendor">
          <UInput
            v-model="leadVendor"
            placeholder="Enter lead vendor"
            autocomplete="off"
          />
        </UFormField>

        <UFormField label="Contact email">
          <UInput
            v-model="contactEmail"
            type="email"
            placeholder="contact@center.com"
            autocomplete="off"
          />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton color="neutral"
variant="ghost"
:disabled="props.loading"
@click="handleClose">
            Cancel
          </UButton>
          <UButton :disabled="props.loading || !canSubmit()" @click="handleSubmit">
            {{ isEditMode ? 'Update' : 'Create' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
