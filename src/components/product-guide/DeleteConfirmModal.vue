<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
  description: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <UModal
    :open="props.open"
    :title="props.title"
    :dismissible="false"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <p class="text-sm text-muted">{{ props.description }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="props.loading"
          @click="emit('update:open', false)"
        >
          Cancel
        </UButton>
        <UButton color="error" :loading="props.loading" @click="emit('confirm')">
          Delete
        </UButton>
      </div>
    </template>
  </UModal>
</template>
