<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useBrokerProfile, type BrokerProfileState } from '../../composables/useBrokerProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import { US_STATES } from '../../lib/us-states'

const allowedLanguages = ['English', 'Spanish'] as const
const languageOptions: string[] = [...allowedLanguages]
type SupportedLanguage = typeof allowedLanguages[number]

const generalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  companyName: z.string().min(2, 'Company name is required'),
  bio: z.string().optional(),
  yearsInBusiness: z.number().min(0).optional().or(z.literal('')),
  languages: z.array(z.string())
    .min(1, 'At least one language is required')
    .refine(
      languages => languages.every(language => allowedLanguages.includes(language as SupportedLanguage)),
      'Select English or Spanish only'
    ),
  primaryEmail: z.string().email('Invalid email'),
  personalEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  directPhone: z.string().min(10, 'Phone number is required'),
  officeAddress: z.string().min(5, 'Office address is required'),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  preferredContact: z.enum(['email', 'phone', 'text']).optional(),
  assistantName: z.string().optional(),
  assistantEmail: z.string().email().optional().or(z.literal(''))
}).passthrough()

const auth = useAuth()
const brokerProfile = useBrokerProfile()
const saving = ref(false)
const toast = useToast()
const router = useRouter()

const contactMethodOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Phone Call', value: 'phone' },
  { label: 'Text Message', value: 'text' }
]

const stateOptions = US_STATES.map(s => ({ label: s.code, value: s.code }))

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = brokerProfile.draft as unknown as Ref<BrokerProfileState>

const sanitizeLanguages = (languages?: string[]) =>
  (languages ?? []).filter((language): language is SupportedLanguage =>
    allowedLanguages.includes(language as SupportedLanguage)
  )

const hydrateFromAuth = () => {
  const p = auth.state.value.profile
  const email = p?.email ?? auth.state.value.user?.email ?? ''

  if (!brokerProfile.draft.value.primaryEmail) {
    brokerProfile.draft.value.primaryEmail = email
  }

  if (!brokerProfile.draft.value.fullName) {
    brokerProfile.draft.value.fullName = p?.display_name ?? ''
  }
}

const addressStreet = ref('')
const addressSuite = ref('')
const addressCity = ref('')
const addressState = ref('')
const addressZip = ref('')

function parseAddress(raw: string) {
  if (!raw) return
  const parts = raw.split(',').map(p => p.trim())
  if (parts.length >= 3) {
    addressStreet.value = parts[0] ?? ''
    const last = parts[parts.length - 1] ?? ''
    const stateZipMatch = last.match(/^([A-Za-z]{2})\s+(.+)$/)
    if (stateZipMatch) {
      addressState.value = stateZipMatch[1].toUpperCase()
      addressZip.value = stateZipMatch[2]
    } else {
      addressState.value = last
    }
    addressCity.value = parts[parts.length - 2] ?? ''
    if (parts.length >= 4) {
      addressSuite.value = parts.slice(1, parts.length - 2).join(', ')
    }
  } else {
    addressStreet.value = raw
  }
}

function buildAddress() {
  const parts = [addressStreet.value.trim()]
  if (addressSuite.value.trim()) parts.push(addressSuite.value.trim())
  if (addressCity.value.trim()) parts.push(addressCity.value.trim())
  const stateZip = [addressState.value.trim(), addressZip.value.trim()].filter(Boolean).join(' ')
  if (stateZip) parts.push(stateZip)
  return parts.join(', ')
}

watch([addressStreet, addressSuite, addressCity, addressState, addressZip], () => {
  profile.value.officeAddress = buildAddress()
})

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await brokerProfile.loadProfile(userId.value)
  }
  profile.value.languages = sanitizeLanguages(profile.value.languages)
  hydrateFromAuth()
  parseAddress(profile.value.officeAddress ?? '')
})

watch(
  () => auth.state.value.profile,
  () => {
    hydrateFromAuth()
  }
)

async function submitProfile() {
  if (!userId.value) return false

  saving.value = true
  try {
    await brokerProfile.commitEditing(userId.value, [
      'fullName',
      'companyName',
      'bio',
      'yearsInBusiness',
      'languages',
      'primaryEmail',
      'personalEmail',
      'directPhone',
      'officeAddress',
      'websiteUrl',
      'preferredContact',
      'assistantName',
      'assistantEmail'
    ])

    toast.add({
      title: 'Success',
      description: 'Your broker profile has been updated.',
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

async function onSubmit() {
  const result = generalInfoSchema.safeParse(profile.value)
  if (!result.success) {
    const msg = result.error.issues[0]?.message || 'Please check your input'
    toast.add({ title: 'Validation Error', description: msg, icon: 'i-lucide-alert-triangle', color: 'warning' })
    return
  }
  await submitProfile()
}

function goToNext() {
  router.push('/settings/expertise')
}

const disabled = computed(() => !brokerProfile.isEditing.value)
const isEditing = computed(() => brokerProfile.isEditing.value)

const cancelEditing = () => brokerProfile.cancelEditing()
const startEditing = () => brokerProfile.startEditing()

const unsavedOpen = ref(false)
const pendingNav = ref<RouteLocationRaw | null>(null)

const handleConfirmDiscard = () => {
  brokerProfile.cancelEditing()
  unsavedOpen.value = false
  const target = pendingNav.value
  pendingNav.value = null
  if (target) router.push(target)
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((to) => {
  if (brokerProfile.isEditing.value && brokerProfile.isDirty.value) {
    pendingNav.value = to
    unsavedOpen.value = true
    return false
  }
  return true
})
</script>

<template>
  <UnsavedChangesModal
    :open="unsavedOpen"
    @update:open="(v) => { unsavedOpen = v }"
    @confirm="handleConfirmDiscard"
    @cancel="handleStay"
  />

  <div class="space-y-6">
    <!-- Header -->
    <div class="ap-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-[0.5px] ring-white/80 dark:bg-[#1a1a1a]/60 dark:ring-white/70">
          <UIcon name="i-lucide-briefcase" class="text-lg text-zinc-900 dark:text-white" />
          <div
            class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1a1a] transition-colors"
            :class="isEditing ? 'bg-[var(--ap-accent)]' : 'bg-emerald-400'"
          />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted tracking-tight">
            Broker Profile
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Manage your public profile and contact details.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
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
            type="button"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            @click="onSubmit"
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

    <!-- Core Identity + Contact Details -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Core Identity -->
      <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-fingerprint" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">Core Identity</h3>
          </div>
        </div>

        <div class="relative p-5 space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Full Name <span class="text-red-400/80">*</span>
              </label>
              <UInput
                v-model="profile.fullName"
                placeholder="John Doe"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Company Name <span class="text-red-400/80">*</span>
              </label>
              <UInput
                v-model="profile.companyName"
                placeholder="Doe Brokerage"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Years in Business
              </label>
              <UInput
                v-model.number="profile.yearsInBusiness"
                type="number"
                min="0"
                placeholder="10"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Languages <span class="text-red-400/80">*</span>
              </label>
              <UInputMenu
                v-model="profile.languages"
                :items="languageOptions"
                multiple
                searchable
                placeholder="Select languages"
                :disabled="disabled"
                class="w-full"
                :ui="{ tagsItem: 'hidden' }"
              />
              <div v-if="(profile.languages?.length ?? 0) > 0" class="flex flex-wrap gap-1.5 pt-0.5">
                <span
                  v-for="lang in profile.languages"
                  :key="lang"
                  class="rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90"
                >
                  {{ lang }}
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              Bio
            </label>
            <UTextarea
              v-model="profile.bio"
              :rows="3"
              placeholder="Brief description of your brokerage..."
              autocomplete="off"
              :disabled="disabled"
              class="w-full"
            />
            <p class="text-[11px] text-muted">
              Optional — what brokers/clients should know about you.
            </p>
          </div>
        </div>
      </div>

      <!-- Contact Details -->
      <div class="ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-phone" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">Contact Details</h3>
          </div>
        </div>

        <div class="relative p-5 space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Primary Email <span class="text-red-400/80">*</span>
              </label>
              <UInput
                v-model="profile.primaryEmail"
                type="email"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Personal Email
              </label>
              <UInput
                v-model="profile.personalEmail"
                type="email"
                placeholder="you@gmail.com"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Direct Phone <span class="text-red-400/80">*</span>
              </label>
              <UInput
                v-model="profile.directPhone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                autocomplete="off"
                :disabled="disabled"
                size="md"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">
                Preferred Contact
              </label>
              <USelect
                v-model="profile.preferredContact"
                :items="contactMethodOptions"
                value-key="value"
                label-key="label"
                placeholder="Select method"
                :disabled="disabled"
                class="w-full"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-medium text-highlighted">
              Office Address <span class="text-red-400/80">*</span>
            </label>
            <div class="grid grid-cols-3 gap-2.5">
              <UInput
                v-model="addressStreet"
                placeholder="Street Address"
                autocomplete="off"
                :disabled="disabled"
                size="md"
              />
              <UInput
                v-model="addressSuite"
                placeholder="Suite / Unit"
                autocomplete="off"
                :disabled="disabled"
                size="md"
              />
              <UInput
                v-model="addressCity"
                placeholder="City"
                autocomplete="off"
                :disabled="disabled"
                size="md"
              />
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <USelect
                v-model="addressState"
                :items="stateOptions"
                value-key="value"
                label-key="label"
                placeholder="State"
                :disabled="disabled"
              />
              <UInput
                v-model="addressZip"
                placeholder="ZIP Code"
                autocomplete="off"
                :disabled="disabled"
                size="md"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">
              Website URL
            </label>
            <UInput
              v-model="profile.websiteUrl"
              type="url"
              placeholder="https://www.yourbrokerage.com"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full"
            />
          </div>

          <!-- Support Staff -->
          <div class="relative mt-1 rounded-xl border border-[var(--ap-accent)]/20 overflow-hidden">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="relative flex items-center gap-2 border-b border-[var(--ap-accent)]/10 px-4 py-2.5">
              <UIcon name="i-lucide-users" class="text-xs text-[var(--ap-accent)]" />
              <span class="text-xs font-semibold text-highlighted">Support Staff</span>
              <span class="text-[11px] text-muted">(optional)</span>
            </div>
            <div class="p-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Assistant Name
                  </label>
                  <UInput
                    v-model="profile.assistantName"
                    placeholder="Jane Smith"
                    autocomplete="off"
                    :disabled="disabled"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">
                    Assistant Email
                  </label>
                  <UInput
                    v-model="profile.assistantEmail"
                    type="email"
                    placeholder="assistant@yourbrokerage.com"
                    autocomplete="off"
                    :disabled="disabled"
                    size="md"
                    class="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
