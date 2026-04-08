<script setup lang="ts">
import ProductGuideHint from '../product-guide/ProductGuideHint.vue'
import type { ProductGuideTarget } from '../../lib/product-guide-navigation'

defineProps<{
  title: string
  value: string | number
  icon: string
  accent?: 'orange-light' | 'orange' | 'green' | 'amber' | 'blue'
  progress?: number
  progressLabel?: string
  clickable?: boolean
  loading?: boolean
  hintTitle?: string
  hintDescription?: string
  hintGuideTarget?: ProductGuideTarget
}>()

defineEmits<{ click: [] }>()
</script>

<template>
  <div
    class="metric-card group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl h-full"
    :class="[
      clickable ? 'cursor-pointer' : '',
      accent === 'green' ? 'hover:border-green-400/30' : '',
      accent === 'amber' ? 'hover:border-amber-400/30' : '',
      accent === 'orange' ? 'hover:border-[var(--ap-accent)]/30' : '',
      accent === 'blue' ? 'hover:border-blue-400/30' : '',
      accent === 'orange-light' || !accent ? 'hover:border-orange-300/30' : ''
    ]"
    @click="clickable ? $emit('click') : undefined"
  >
    <!-- Top-to-bottom gradient fade -->
    <div
      class="pointer-events-none absolute inset-0 transition-opacity duration-300"
      :class="[
        accent === 'green'
          ? 'bg-gradient-to-b from-green-500/[0.07] via-green-500/[0.02] to-transparent dark:from-green-400/[0.10] dark:via-green-400/[0.03] dark:to-transparent'
          : accent === 'amber'
            ? 'bg-gradient-to-b from-amber-500/[0.07] via-amber-500/[0.02] to-transparent dark:from-amber-400/[0.10] dark:via-amber-400/[0.03] dark:to-transparent'
            : accent === 'orange'
              ? 'bg-gradient-to-b from-[var(--ap-accent)]/[0.08] via-[var(--ap-accent)]/[0.02] to-transparent'
              : accent === 'blue'
                ? 'bg-gradient-to-b from-blue-500/[0.07] via-blue-500/[0.02] to-transparent dark:from-blue-400/[0.10] dark:via-blue-400/[0.03] dark:to-transparent'
                : 'bg-gradient-to-b from-orange-400/[0.07] via-orange-400/[0.02] to-transparent dark:from-orange-300/[0.10] dark:via-orange-300/[0.03] dark:to-transparent'
      ]"
    />

    <!-- Content -->
    <div class="relative z-10 flex flex-col justify-between h-full p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <p class="text-[10px] font-medium uppercase tracking-wider text-muted">{{ title }}</p>
            <ProductGuideHint
              v-if="hintTitle && hintDescription"
              :title="hintTitle"
              :description="hintDescription"
              :guide-target="hintGuideTarget"
            />
          </div>
          <p
            class="mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl"
            :class="[
              accent === 'green' ? 'text-green-500 dark:text-green-400' : '',
              accent === 'amber' ? 'text-amber-500 dark:text-amber-400' : '',
              accent === 'orange' ? 'text-[var(--ap-accent)]' : '',
              accent === 'blue' ? 'text-blue-500 dark:text-blue-400' : '',
              accent === 'orange-light' || !accent ? 'text-orange-500 dark:text-orange-400' : ''
            ]"
          >
            <span v-if="loading" class="inline-block h-[0.75em] w-20 animate-pulse rounded-md bg-black/[0.06] dark:bg-white/[0.08] align-middle" />
            <template v-else>{{ value }}</template>
          </p>
        </div>
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 sm:h-11 sm:w-11"
          :class="[
            accent === 'green' ? 'bg-green-500/10 group-hover:bg-green-500/20' : '',
            accent === 'amber' ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : '',
            accent === 'orange' ? 'bg-[var(--ap-accent)]/10 group-hover:bg-[var(--ap-accent)]/20' : '',
            accent === 'blue' ? 'bg-blue-500/10 group-hover:bg-blue-500/20' : '',
            accent === 'orange-light' || !accent ? 'bg-orange-400/10 group-hover:bg-orange-400/20' : ''
          ]"
        >
          <UIcon
            :name="icon"
            class="text-lg"
            :class="[
              accent === 'green' ? 'text-green-400' : '',
              accent === 'amber' ? 'text-amber-400' : '',
              accent === 'orange' ? 'text-[var(--ap-accent)]' : '',
              accent === 'blue' ? 'text-blue-400' : '',
              accent === 'orange-light' || !accent ? 'text-orange-400' : ''
            ]"
          />
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="progress !== undefined" class="mt-3">
        <div class="flex items-center justify-between text-[11px] text-muted mb-1">
          <span v-if="loading" class="inline-block h-[1em] w-16 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]" />
          <span v-else>{{ progressLabel }}</span>
          <span v-if="loading" class="inline-block h-[1em] w-8 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08]" />
          <span v-else class="font-semibold text-highlighted">{{ progress }}%</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
          <div
            v-if="!loading"
            class="h-full rounded-full transition-all duration-700 ease-out"
            :class="[
              accent === 'green' ? 'bg-green-400' : '',
              accent === 'amber' ? 'bg-amber-400' : '',
              accent === 'orange' ? 'bg-[var(--ap-accent)]' : '',
              accent === 'blue' ? 'bg-blue-400' : '',
              accent === 'orange-light' || !accent ? 'bg-orange-400' : ''
            ]"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>

      <!-- Slot for custom bottom content -->
      <div v-if="loading && $slots.default" class="mt-3">
        <span class="inline-block h-[1em] w-28 animate-pulse rounded bg-black/[0.06] dark:bg-white/[0.08] text-xs" />
      </div>
      <slot v-else />
    </div>

    <!-- Bottom accent strip -->
    <div
      class="absolute bottom-0 inset-x-0 h-[2px]"
      :class="[
        accent === 'green' ? 'bg-green-400' : '',
        accent === 'amber' ? 'bg-amber-400' : '',
        accent === 'orange' ? 'bg-[var(--ap-accent)]' : '',
        accent === 'blue' ? 'bg-blue-400' : '',
        accent === 'orange-light' || !accent ? 'bg-orange-300 dark:bg-orange-400' : ''
      ]"
    />
  </div>
</template>
