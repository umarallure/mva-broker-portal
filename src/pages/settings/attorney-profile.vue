<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile, type AttorneyProfileState } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import { US_STATES } from '../../lib/us-states'

const allowedLanguages = ['English', 'Spanish'] as const
const languageOptions: string[] = [...allowedLanguages]
type SupportedLanguage = typeof allowedLanguages[number]

const generalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  firmName: z.string().min(2, 'Firm name is required'),
  barState: z.string().optional(),
  barNumber: z.string().optional(),
  barNumbers: z.array(z.string()).min(1, 'At least one bar association number is required'),
  bio: z.string().optional(),
  yearsExperience: z.number().min(0).optional().or(z.literal('')),
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
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()

const contactMethodOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Phone Call', value: 'phone' },
  { label: 'Text Message', value: 'text' }
]

const barStateOptions = US_STATES.map(s => ({ label: s.code, value: s.code }))
const barStateNameByCode = US_STATES.reduce<Record<string, string>>((acc, s) => {
  acc[s.code] = s.name
  return acc
}, {})

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as Ref<AttorneyProfileState>

const router = useRouter()

const sanitizeLanguages = (languages?: string[]) =>
  (languages ?? []).filter((language): language is SupportedLanguage =>
    allowedLanguages.includes(language as SupportedLanguage)
  )

const addBarNumber = () => {
  if (disabled.value) return
  const state = String(attorneyProfile.draft.value.barState ?? '').trim().toUpperCase()
  const next = (attorneyProfile.draft.value.barNumber ?? '').trim()
  if (!state) return
  if (!next) return

  const encoded = `${state}|${next}`
  const existing = (attorneyProfile.draft.value.barNumbers ?? []).map(v => v.trim()).filter(Boolean)
  if (!existing.includes(encoded)) {
    attorneyProfile.draft.value.barNumbers = [...existing, encoded]
  } else {
    attorneyProfile.draft.value.barNumbers = existing
  }

  attorneyProfile.draft.value.barNumber = ''
}

const removeBarNumber = (value: string) => {
  if (disabled.value) return
  const current = (attorneyProfile.draft.value.barNumbers ?? []).map(v => v.trim()).filter(Boolean)
  attorneyProfile.draft.value.barNumbers = current.filter(v => v !== value)
}

const hydrateFromAuth = () => {
  const p = auth.state.value.profile
  const email = p?.email ?? auth.state.value.user?.email ?? ''

  if (!attorneyProfile.draft.value.primaryEmail) {
    attorneyProfile.draft.value.primaryEmail = email
  }

  if (!attorneyProfile.draft.value.fullName) {
    attorneyProfile.draft.value.fullName = p?.display_name ?? ''
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
    await attorneyProfile.loadProfile(userId.value)
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

async function submitAttorneyProfile() {
  if (!userId.value) return false

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'fullName',
      'firmName',
      'barNumbers',
      'bio',
      'yearsExperience',
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
      description: 'Your attorney profile has been updated.',
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
  await submitAttorneyProfile()
}

function goToNext() {
  router.push('/settings/expertise')
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
const pendingNav = ref<RouteLocationRaw | null>(null)

const confirmLeave = () => {
  unsavedOpen.value = true
}

const handleConfirmDiscard = () => {
  attorneyProfile.cancelEditing()
  unsavedOpen.value = false
  const target = pendingNav.value
  pendingNav.value = null
  if (target) {
    router.push(target)
  }
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((to) => {
  if (attorneyProfile.isEditing.value && attorneyProfile.isDirty.value) {
    pendingNav.value = to
    confirmLeave()
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
    <!-- ═══ Page Header ═══ -->
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
            Attorney Profile
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Manage your public profile, practice areas, and case availability.
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

    <!-- ═══ Core Identity + Contact Details — side by side ═══ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- ── LEFT: Core Identity ── -->
      <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-fingerprint" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Core Identity
            </h3>
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
                Firm Name <span class="text-red-400/80">*</span>
              </label>
              <UInput
                v-model="profile.firmName"
                placeholder="Doe & Associates"
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
                Years of Experience
              </label>
              <UInput
                v-model.number="profile.yearsExperience"
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
              Professional Bio
            </label>
            <UTextarea
              v-model="profile.bio"
              :rows="3"
              placeholder="Experienced attorney specializing in..."
              autocomplete="off"
              :disabled="disabled"
              class="w-full"
            />
            <p class="text-[11px] text-muted">
              Brief description of your practice (optional)
            </p>
          </div>

          <!-- Bar Licenses -->
          <div class="relative rounded-xl border border-[var(--ap-accent)]/20 overflow-hidden">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="relative flex items-center justify-between gap-3 border-b border-[var(--ap-accent)]/10 px-4 py-2.5">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-scale" class="text-xs text-[var(--ap-accent)]" />
                <span class="text-xs font-semibold text-highlighted">
                  Bar Licenses <span class="text-red-400/80">*</span>
                </span>
              </div>
              <span class="text-[11px] text-muted tabular-nums">
                {{ (profile.barNumbers?.length ?? 0) }} added
              </span>
            </div>
            <div class="p-4 space-y-3">
              <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <USelect
                  v-model="profile.barState"
                  :items="barStateOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="State"
                  :disabled="disabled"
                  class="w-full sm:w-24"
                />
                <UInput
                  v-model="profile.barNumber"
                  placeholder="BAR123456"
                  autocomplete="off"
                  :disabled="disabled"
                  size="md"
                  class="w-full sm:flex-1"
                  @keydown.enter.prevent="addBarNumber"
                />
                <UButton
                  type="button"
                  label="Add"
                  variant="outline"
                  icon="i-lucide-plus"
                  :disabled="disabled"
                  class="group shrink-0 rounded-lg border-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)] transition-colors duration-200"
                  :ui="{ leadingIcon: 'text-[var(--ap-accent)] group-hover:text-white transition duration-200' }"
                  @click="addBarNumber"
                />
              </div>
              <div v-if="(profile.barNumbers?.length ?? 0) > 0" class="flex flex-wrap gap-1.5">
                <div
                  v-for="n in profile.barNumbers"
                  :key="n"
                  class="group flex items-center gap-1.5 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06] pl-1 pr-1.5 py-1 transition-all duration-200 hover:border-[var(--ap-accent)]/40 hover:bg-[var(--ap-accent)]/[0.1]"
                >
                  <template v-if="String(n).includes('|')">
                    <span class="rounded-md bg-[var(--ap-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[var(--ap-accent)]">
                      {{ (n.split('|')[0] ?? '').toUpperCase() }}
                    </span>
                    <span class="text-[11px] font-medium text-highlighted">
                      {{ (n.split('|')[1] ?? '').trim() }}
                    </span>
                    <span
                      v-if="barStateNameByCode[(n.split('|')[0] ?? '').toUpperCase()]"
                      class="text-[10px] text-muted hidden sm:inline"
                    >
                      {{ barStateNameByCode[(n.split('|')[0] ?? '').toUpperCase()] }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[11px] font-medium text-highlighted">
                      {{ n }}
                    </span>
                  </template>
                  <UButton
                    type="button"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    :disabled="disabled"
                    class="h-4 w-4 rounded p-0 opacity-30 transition-opacity group-hover:opacity-100"
                    @click="removeBarNumber(n)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── RIGHT: Contact Details ── -->
      <div class="ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

        <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
          <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
          <div class="relative flex items-center gap-3 px-5 py-3.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-phone" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Contact Details
            </h3>
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
                :items="barStateOptions"
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
              placeholder="https://www.yourfirm.com"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full"
            />
          </div>

          <!-- Support Staff — integrated subsection -->
          <div class="relative mt-1 rounded-xl border border-[var(--ap-accent)]/20 overflow-hidden">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="relative flex items-center gap-2 border-b border-[var(--ap-accent)]/10 px-4 py-2.5">
              <UIcon name="i-lucide-users" class="text-xs text-[var(--ap-accent)]" />
              <span class="text-xs font-semibold text-highlighted">
                Support Staff
              </span>
              <span class="text-[11px] text-muted">
                (optional)
              </span>
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
                    placeholder="assistant@yourfirm.com"
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
