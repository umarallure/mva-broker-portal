<script setup lang="ts">
import { computed } from 'vue'
import {
  ATTORNEY_PROFILE_OPTIONAL_FIELDS,
  ATTORNEY_PROFILE_REQUIRED_FIELDS,
  isAttorneyProfileFieldFilled,
  type AttorneyProfileState
} from '../../composables/useAttorneyProfile'

const props = defineProps<{
  profileData?: Partial<AttorneyProfileState>
}>()

const requiredFields = ATTORNEY_PROFILE_REQUIRED_FIELDS
const optionalFields = ATTORNEY_PROFILE_OPTIONAL_FIELDS

const filledRequiredCount = computed(() => {
  if (!props.profileData) return 0
  return requiredFields.filter(field => isAttorneyProfileFieldFilled(props.profileData, field)).length
})

const filledOptionalCount = computed(() => {
  if (!props.profileData) return 0
  return optionalFields.filter(field => isAttorneyProfileFieldFilled(props.profileData, field)).length
})

const completionPercentage = computed(() => {
  if (!props.profileData) return 0

  const requiredWeight = 0.7
  const optionalWeight = 0.3

  const requiredScore = (filledRequiredCount.value / requiredFields.length) * requiredWeight
  const optionalScore = (filledOptionalCount.value / optionalFields.length) * optionalWeight

  return Math.round((requiredScore + optionalScore) * 100)
})

const completionColor = computed(() => {
  const pct = completionPercentage.value
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'
  return 'error'
})

const completionMessage = computed(() => {
  const pct = completionPercentage.value
  if (pct === 100) return 'Complete!'
  if (pct >= 80) return 'Almost there!'
  if (pct >= 50) return 'Good progress'
  return 'Let\'s get started'
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 backdrop-blur-sm px-4 py-3">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--ap-accent)]/[0.03] via-transparent to-transparent" />

    <div class="relative flex items-center gap-4">
      <!-- Icon -->
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
        <UIcon name="i-lucide-shield-check" class="text-sm text-[var(--ap-accent)]" />
      </div>

      <!-- Progress bar section — takes available space -->
      <div class="flex min-w-0 flex-1 items-center gap-4">
        <span class="shrink-0 text-xs font-medium text-highlighted">Profile Completion</span>

        <!-- Progress bar -->
        <div class="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-emerald-400/10 via-emerald-400/60 to-emerald-400"
            :style="{ width: `${completionPercentage}%` }"
          />
        </div>

        <!-- Percentage -->
        <span class="shrink-0 text-sm font-bold tabular-nums text-emerald-400">
          {{ completionPercentage }}%
        </span>
      </div>

      <!-- Divider -->
      <div class="hidden h-4 w-px bg-white/[0.08] sm:block" />

      <!-- Stats -->
      <div class="hidden items-center gap-3 sm:flex">
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-check-circle" class="size-3 text-emerald-400/60" />
          <span class="text-[11px] text-muted tabular-nums">{{ filledRequiredCount }}/{{ requiredFields.length }} Required</span>
        </div>
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-star" class="size-3 text-amber-400/60" />
          <span class="text-[11px] text-muted tabular-nums">{{ filledOptionalCount }}/{{ optionalFields.length }} Optional</span>
        </div>
      </div>

      <!-- Divider -->
      <div class="hidden h-4 w-px bg-white/[0.08] sm:block" />

      <!-- Message -->
      <span class="hidden shrink-0 text-[11px] text-muted lg:inline">{{ completionMessage }}</span>
    </div>
  </div>
</template>
