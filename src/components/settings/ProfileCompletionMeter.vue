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

const completionPercentage = computed(() => {
  if (!props.profileData) return 0
  
  let filledRequired = 0
  let filledOptional = 0
  
  requiredFields.forEach((field) => {
    if (isAttorneyProfileFieldFilled(props.profileData, field)) {
      filledRequired++
    }
  })
  
  optionalFields.forEach((field) => {
    if (isAttorneyProfileFieldFilled(props.profileData, field)) {
      filledOptional++
    }
  })
  
  const requiredWeight = 0.7
  const optionalWeight = 0.3
  
  const requiredScore = (filledRequired / requiredFields.length) * requiredWeight
  const optionalScore = (filledOptional / optionalFields.length) * optionalWeight
  
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
  if (pct === 100) return 'Your profile is complete!'
  if (pct >= 80) return 'Almost there! Just a few more details.'
  if (pct >= 50) return 'Good progress. Keep going!'
  return 'Let\'s complete your profile to maximize case opportunities.'
})
</script>

<template>
  <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-shield-check" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            Profile Completion
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ completionMessage }}
          </p>
        </div>
      </div>
      <span
        class="text-2xl font-bold"
        :class="{
          'text-green-400': completionColor === 'success',
          'text-amber-400': completionColor === 'warning',
          'text-red-400': completionColor === 'error'
        }"
      >
        {{ completionPercentage }}%
      </span>
    </div>

    <div class="h-2 w-full overflow-hidden rounded-full bg-[var(--ap-card-border)]">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="{
          'bg-green-400': completionColor === 'success',
          'bg-amber-400': completionColor === 'warning',
          'bg-red-400': completionColor === 'error'
        }"
        :style="{ width: `${completionPercentage}%` }"
      />
    </div>

    <div class="mt-3 flex items-center gap-5 text-xs text-muted">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-check-circle" class="size-3.5 text-green-400/70" />
        <span>{{ requiredFields.filter(field => isAttorneyProfileFieldFilled(profileData, field)).length }} / {{ requiredFields.length }} Required</span>
      </div>
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-star" class="size-3.5 text-amber-400/70" />
        <span>{{ optionalFields.filter(field => isAttorneyProfileFieldFilled(profileData, field)).length }} / {{ optionalFields.length }} Optional</span>
      </div>
    </div>
  </div>
</template>
