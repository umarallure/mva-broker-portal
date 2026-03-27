<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile, type AttorneyProfileState } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const pricingTierOptions = [
  { label: 'Tier 1 - $2,500', value: 'tier_1' },
  { label: 'Tier 2 - $3,500', value: 'tier_2' },
  { label: 'Tier 3 - $6,500', value: 'tier_3' },
  { label: 'Tier 4 - $6,000', value: 'tier_4' }
]

const capacitySchema = z.object({
  caseRatePerDeal: z.number().min(0).optional().or(z.literal('')),
  upfrontPaymentPercentage: z.number().min(0).max(100).optional().or(z.literal('')),
  paymentWindowDays: z.number().int().min(0).optional().or(z.literal('')),
  pricingTier: z.string().optional().or(z.literal(''))
})

type CapacitySchema = z.output<typeof capacitySchema>

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()
const router = useRouter()

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as Ref<Partial<CapacitySchema>>

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
  }
})

async function submitCapacitySection() {
  if (!userId.value) return false

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'caseRatePerDeal',
      'upfrontPaymentPercentage',
      'paymentWindowDays',
      'pricingTier'
    ] as Array<keyof AttorneyProfileState>)
    
    toast.add({
      title: 'Success',
      description: 'Your capacity and performance settings have been updated.',
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

async function onSubmit(event: FormSubmitEvent<CapacitySchema>) {
  void event
  await submitCapacitySection()
}

async function onNext() {
  await submitCapacitySection()
}

async function onBack() {
  const saved = await submitCapacitySection()
  if (saved) {
    attorneyProfile.startEditing()
    router.push('/settings/expertise')
  }
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
    id="capacity"
    class="space-y-6"
    :schema="capacitySchema"
    :state="profile"
    @submit="onSubmit"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-activity" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Pricing
          </h2>
          <p class="text-xs text-muted">
            Manage your rate and upfront settlement percentage.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!isEditing"
          label="Edit"
          icon="i-lucide-pencil"
          class="group rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
          :ui="{ leadingIcon: 'transition duration-200 group-hover:-rotate-12' }"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            label="Back"
            type="button"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            :loading="saving"
            class="rounded-lg"
            @click="onBack"
          />
          <UButton
            label="Finish"
            type="button"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            @click="onNext"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelEditing"
          />
        </template>
      </div>
    </div>

    <!-- Pricing -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-signal" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Pricing</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Rate Per Case
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Fixed amount charged per deal (optional)
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model.number="profile.caseRatePerDeal"
              type="number"
              placeholder="0"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Upfront Settlement Percentage
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Percent of settlement amount to invoice upfront
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model.number="profile.upfrontPaymentPercentage"
              type="number"
              placeholder="0"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Payment Window (days)
            </label>
            <p class="mt-0.5 text-xs text-muted">
              How many days you take to process payment for cases
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model.number="profile.paymentWindowDays"
              type="number"
              placeholder="0"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Pricing Tier
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Select your case pricing tier based on accident recency and liability
            </p>
          </div>
          <div class="w-full sm:w-72">
            <USelect
              v-model="profile.pricingTier"
              :items="pricingTierOptions"
              placeholder="Select a tier"
              :disabled="disabled"
              value-key="value"
              label-key="label"
              class="w-full sm:w-72"
            />
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
