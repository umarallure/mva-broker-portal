<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const MAX_LICENSED_STATES = 5

const expertiseSchema = z.object({
  licensedStates: z.array(z.string()).min(1, 'At least one state is required').max(MAX_LICENSED_STATES, `You can select a maximum of ${MAX_LICENSED_STATES} states. Please contact your account manager to increase this limit.`),
  primaryCity: z.string().min(2, 'Primary physical location is required'),
  countiesCovered: z.string().optional(),
  federalCourts: z.string().optional(),
  primaryPracticeFocus: z.string().min(1, 'Practice focus is required'),
  injuryCategories: z.array(z.string()).min(1, 'At least one injury category is required'),
  exclusionaryCriteria: z.string().optional(),
  minimumCaseValue: z.number().min(0).optional().or(z.literal(''))
})

type ExpertiseSchema = z.output<typeof expertiseSchema>

type ExpertiseFormState = {
  licensedStates?: string[]
  primaryCity?: string
  countiesCovered?: string
  federalCourts?: string
  primaryPracticeFocus?: string
  injuryCategories?: string[]
  exclusionaryCriteria?: string
  minimumCaseValue?: number | ''
}

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()
const router = useRouter()

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as Ref<ExpertiseFormState>

const stateOptions = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

const practiceFocusOptions = [
  'Personal Injury',
  'Medical Malpractice',
  'Workers Compensation',
  'Product Liability',
  'Wrongful Death',
  'Mass Torts',
  'Class Actions'
]

const injuryCategoryOptions = [
  'Auto Accidents',
  'Truck Accidents',
  'Motorcycle Accidents',
  'Pedestrian Accidents',
  'Slip and Fall',
  'Medical Malpractice',
  'Nursing Home Abuse',
  'Birth Injuries',
  'Workplace Injuries',
  'Construction Accidents',
  'Dog Bites',
  'Defective Products',
  'Toxic Exposure',
  'Brain Injuries',
  'Spinal Cord Injuries',
  'Burn Injuries',
  'Wrongful Death'
]

// Enforce max licensed states - trim back to limit if user somehow exceeds
watch(() => profile.value.licensedStates, (newVal) => {
  if (newVal && newVal.length > MAX_LICENSED_STATES) {
    profile.value.licensedStates = newVal.slice(0, MAX_LICENSED_STATES)
    toast.add({
      title: 'State limit reached',
      description: `You can have a maximum of ${MAX_LICENSED_STATES} states. Please contact your account manager to increase this limit.`,
      icon: 'i-lucide-alert-triangle',
      color: 'warning'
    })
  }
}, { deep: true })

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
    if (Array.isArray(attorneyProfile.draft.value.countiesCovered)) {
      profile.value.countiesCovered = attorneyProfile.draft.value.countiesCovered.join(', ')
    }
    if (Array.isArray(attorneyProfile.draft.value.exclusionaryCriteria)) {
      profile.value.exclusionaryCriteria = attorneyProfile.draft.value.exclusionaryCriteria.join(', ')
    }
  }
})

async function submitExpertiseSection() {
  if (!userId.value) return false

  attorneyProfile.draft.value.countiesCovered = (profile.value.countiesCovered ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  attorneyProfile.draft.value.exclusionaryCriteria = (profile.value.exclusionaryCriteria ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'licensedStates',
      'primaryCity',
      'countiesCovered',
      'federalCourts',
      'primaryPracticeFocus',
      'injuryCategories',
      'exclusionaryCriteria',
      'minimumCaseValue'
    ])
    
    toast.add({
      title: 'Success',
      description: 'Your expertise and jurisdiction settings have been updated.',
      icon: 'i-lucide-check',
      color: 'success'
    })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to update profile'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

async function onSubmit(_event: FormSubmitEvent<ExpertiseSchema>) {
  void _event
  await submitExpertiseSection()
}

function goToBack() {
  router.push('/settings/attorney-profile')
}

function goToNext() {
  router.push('/settings/team-profile')
}

const disabled = computed(() => !attorneyProfile.isEditing.value)

const isEditing = computed(() => attorneyProfile.isEditing.value)

const cancelEditing = () => {
  attorneyProfile.cancelEditing()
}

const startEditing = () => {
  attorneyProfile.startEditing()
}

const unsavedOpen = ref(false)
const pendingNav = ref<null | (() => void)>(null)

const confirmLeave = () => {
  unsavedOpen.value = true
}

const handleConfirmDiscard = () => {
  attorneyProfile.cancelEditing()
  unsavedOpen.value = false
  const go = pendingNav.value
  pendingNav.value = null
  go?.()
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((_to, _from, next) => {
  if (attorneyProfile.isEditing.value && attorneyProfile.isDirty.value) {
    pendingNav.value = () => next()
    confirmLeave()
    next(false)
    return
  }

  next()
})
</script>

<template>
  <UnsavedChangesModal
    :open="unsavedOpen"
    @update:open="(v) => { unsavedOpen = v }"
    @confirm="handleConfirmDiscard"
    @cancel="handleStay"
  />

  <UForm
    id="expertise"
    :schema="expertiseSchema"
    :state="profile"
    @submit="onSubmit"
    class="space-y-6"
  >
    <!-- ═══ Page Header ═══ -->
    <div class="ap-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-[0.5px] ring-white/80 dark:bg-[#1a1a1a]/60 dark:ring-white/70">
          <UIcon name="i-lucide-map-pin" class="text-lg text-zinc-900 dark:text-white" />
          <div
            class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1a1a] transition-colors"
            :class="isEditing ? 'bg-[var(--ap-accent)]' : 'bg-emerald-400'"
          />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted tracking-tight">
            Expertise & Jurisdiction
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Define your practice areas and geographic coverage for case matching.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          label="Back"
          type="button"
          icon="i-lucide-arrow-left"
          variant="outline"
          class="group rounded-lg border-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)] transition-colors duration-200"
          :ui="{ leadingIcon: 'text-[var(--ap-accent)] group-hover:text-white transition duration-200 group-hover:-translate-x-0.5' }"
          @click="goToBack"
        />
        <UButton
          v-if="!isEditing"
          label="Edit"
          icon="i-lucide-pencil"
          class="group rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 hover:text-black transition-colors duration-200"
          :ui="{ leadingIcon: 'text-white transition duration-200 group-hover:-rotate-12 group-hover:text-black' }"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelEditing"
          />
          <UButton
            label="Save"
            type="submit"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          />
        </template>
        <UButton
          label="Next"
          type="button"
          icon="i-lucide-arrow-right"
          variant="outline"
          class="group rounded-lg border-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)] transition-colors duration-200"
          :ui="{ leadingIcon: 'text-[var(--ap-accent)] group-hover:text-white transition duration-200 group-hover:translate-x-0.5' }"
          @click="goToNext"
        />
      </div>
    </div>

    <!-- ═══ Geographic Coverage + Case Specialization — side by side ═══ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- ── LEFT: Geographic Coverage ── -->
      <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-globe" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Geographic Coverage
            </h3>
          </div>
        </div>

        <div class="relative p-5 space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,1.05fr)]">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Licensed States <span class="text-muted font-normal">(max {{ MAX_LICENSED_STATES }})</span> <span class="text-red-400/80">*</span>
              </label>
              <UInputMenu
                v-model="profile.licensedStates"
                :items="stateOptions"
                multiple
                searchable
                creatable
                placeholder="Select or type states"
                :disabled="disabled"
                class="w-full"
                :ui="{ tagsItem: 'hidden' }"
              />
              <div v-if="(profile.licensedStates?.length ?? 0) > 0" class="flex flex-wrap gap-1.5 pt-0.5">
                <span
                  v-for="st in profile.licensedStates"
                  :key="st"
                  class="rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90"
                >
                  {{ st }}
                </span>
              </div>
              <p v-if="(profile.licensedStates?.length ?? 0) >= MAX_LICENSED_STATES" class="pt-0.5 text-[11px] font-medium text-amber-500">
                Limit reached - contact your account manager to add more.
              </p>
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Primary Location <span class="text-red-400/80">*</span>
              </label>
              <UInputMenu
                v-model="profile.primaryCity"
                :items="stateOptions"
                searchable
                creatable
                placeholder="Select or type location"
                :disabled="disabled"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Counties / Regions
              </label>
              <UInput
                v-model="profile.countiesCovered"
                placeholder="Comma-separated"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              Federal Court Admissions
            </label>
            <UTextarea
              v-model="profile.federalCourts"
              :rows="3"
              placeholder="e.g., Central District of California, 9th Circuit Court of Appeals"
              autocomplete="off"
              :disabled="disabled"
              class="w-full"
            />
            <p class="text-[11px] text-muted">
              List any federal court admissions (optional)
            </p>
          </div>
        </div>
      </div>

      <!-- ── RIGHT: Case Specialization ── -->
      <div class="ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-scale" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Case Specialization
            </h3>
          </div>
        </div>

        <div class="relative p-5 space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Primary Practice Focus <span class="text-red-400/80">*</span>
              </label>
              <UInputMenu
                v-model="profile.primaryPracticeFocus"
                :items="practiceFocusOptions"
                searchable
                creatable
                placeholder="Select or type practice focus"
                :disabled="disabled"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Injury Categories <span class="text-red-400/80">*</span>
              </label>
              <UInputMenu
                v-model="profile.injuryCategories"
                :items="injuryCategoryOptions"
                multiple
                searchable
                creatable
                placeholder="Select or type categories"
                :disabled="disabled"
                class="w-full"
                :ui="{ tagsItem: 'hidden' }"
              />
              <div v-if="(profile.injuryCategories?.length ?? 0) > 0" class="flex flex-wrap gap-1.5 pt-0.5">
                <span
                  v-for="cat in profile.injuryCategories"
                  :key="cat"
                  class="rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90"
                >
                  {{ cat }}
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              Exclusionary Criteria
            </label>
            <UTextarea
              v-model="profile.exclusionaryCriteria"
              :rows="3"
              placeholder="e.g., Medical Malpractice, Class Actions"
              autocomplete="off"
              :disabled="disabled"
              class="w-full"
            />
            <p class="text-[11px] text-muted">
              Case types you do NOT handle (optional)
            </p>
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
