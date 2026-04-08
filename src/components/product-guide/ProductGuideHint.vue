<script setup lang="ts">
import { computed } from 'vue'

import {
  buildProductGuideLocation,
  type ProductGuideTarget
} from '../../lib/product-guide-navigation'

const props = defineProps<{
  title: string
  description: string
  guideTarget?: ProductGuideTarget
}>()

const guideLocation = computed(() =>
  props.guideTarget ? buildProductGuideLocation(props.guideTarget) : null
)
</script>

<template>
  <UPopover
    mode="hover"
    :open-delay="120"
    :close-delay="80"
    :content="{ align: 'center' }"
    :ui="{ content: 'max-w-72 rounded-xl border border-black/[0.06] bg-white/95 p-0 shadow-xl backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#161616]/95' }"
  >
    <button
      type="button"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[0.04] hover:text-[var(--ap-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ap-accent)]/30 dark:hover:bg-white/[0.06]"
      :aria-label="`More information about ${title}`"
      @click.stop
      @mousedown.stop
      @pointerdown.stop
      @keydown.enter.stop
      @keydown.space.stop.prevent
    >
      <UIcon name="i-lucide-info" class="size-3" />
    </button>

    <template #content>
      <div class="max-w-72 p-3">
        <p class="text-xs font-semibold text-highlighted">
          {{ title }}
        </p>
        <p class="mt-1 text-[11px] leading-5 text-muted">
          {{ description }}
        </p>
        <RouterLink
          v-if="guideLocation"
          :to="guideLocation"
          class="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ap-accent)] transition-colors hover:text-[var(--ap-accent)]/80 hover:underline"
          @click.stop
        >
          Learn more in Product Guide
          <UIcon name="i-lucide-arrow-up-right" class="size-3" />
        </RouterLink>
      </div>
    </template>
  </UPopover>
</template>
