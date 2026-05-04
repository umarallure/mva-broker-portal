<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  percentage: number
  requiredFilled: number
  requiredTotal: number
  optionalFilled: number
  optionalTotal: number
}>()

const completionMessage = computed(() => {
  const pct = props.percentage
  if (pct === 100) return 'Complete!'
  if (pct >= 80) return 'Almost there!'
  if (pct >= 50) return 'Good progress'
  return 'Let\'s get started'
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-emerald-400/25 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-emerald-400/20 dark:bg-[#1a1a1a]/60">
    <div class="relative flex items-center gap-4">
      <UIcon name="i-lucide-shield-check" class="shrink-0 text-lg text-white" />

      <div class="flex min-w-0 flex-1 items-center gap-4">
        <span class="shrink-0 text-xs font-medium text-highlighted">Profile Completion</span>

        <div class="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-emerald-400/10 dark:bg-white/[0.06]">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-300/20 via-emerald-400/60 to-emerald-500 transition-all duration-700 ease-out dark:from-emerald-200/20 dark:via-emerald-300/60 dark:to-emerald-400"
            :style="{ width: `${percentage}%` }"
          />
        </div>

        <span class="shrink-0 text-sm font-bold tabular-nums text-emerald-500 dark:text-emerald-300">
          {{ percentage }}%
        </span>
      </div>

      <div class="hidden h-4 w-px bg-emerald-400/15 sm:block" />

      <div class="hidden items-center gap-3 sm:flex">
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-check-circle" class="size-3 text-emerald-500/70 dark:text-emerald-300/70" />
          <span class="text-[11px] text-muted tabular-nums">{{ requiredFilled }}/{{ requiredTotal }} Required</span>
        </div>
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-star" class="size-3 text-emerald-400/60 dark:text-emerald-300/60" />
          <span class="text-[11px] text-muted tabular-nums">{{ optionalFilled }}/{{ optionalTotal }} Optional</span>
        </div>
      </div>

      <div class="hidden h-4 w-px bg-emerald-400/15 sm:block" />

      <span class="hidden shrink-0 text-[11px] text-muted lg:inline">{{ completionMessage }}</span>
    </div>
  </div>
</template>
