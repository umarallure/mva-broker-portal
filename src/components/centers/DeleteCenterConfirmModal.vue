<script setup lang="ts">
import type { CenterRow } from '../../lib/centers'

const props = defineProps<{
  open: boolean
  center: CenterRow | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

const handleUpdateOpen = (value: boolean) => {
  emit('update:open', value)
}
</script>

<template>
  <UModal :open="props.open"
title="Delete center"
:dismissible="false"
@update:open="handleUpdateOpen">
    <template #body="{ close: modalClose }">
      <div class="space-y-4">
        <p class="text-sm text-white/80">
          This will permanently delete this center from the database.
        </p>

        <UAlert
          v-if="props.center"
          color="warning"
          variant="subtle"
          title="You are deleting"
          :description="props.center.center_name"
        />

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="props.loading"
            @click="modalClose"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="props.loading"
            @click="emit('confirm')"
          >
            Delete center
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
