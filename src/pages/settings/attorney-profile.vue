<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile, type AttorneyProfileState } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const generalInfoSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  firmName: z.string().min(2, 'Firm name is required'),
  barNumber: z.string().min(3, 'Bar association number is required'),
  bio: z.string().optional(),
  yearsExperience: z.number().min(0).optional().or(z.literal('')),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  primaryEmail: z.string().email('Invalid email'),
  directPhone: z.string().min(10, 'Phone number is required'),
  officeAddress: z.string().min(5, 'Office address is required'),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  preferredContact: z.enum(['email', 'phone', 'text']).optional(),
  assistantName: z.string().optional(),
  assistantEmail: z.string().email().optional().or(z.literal(''))
})

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()

const languageOptions = [
  'English',
  'Spanish',
  'French',
  'Mandarin',
  'Arabic',
  'Portuguese',
  'Russian',
  'German',
  'Japanese',
  'Korean'
]

const contactMethodOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Phone Call', value: 'phone' },
  { label: 'Text Message', value: 'text' }
]

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as Ref<AttorneyProfileState>

const router = useRouter()

const hydrateFromAuth = () => {
  const p = auth.state.value.profile
  const email = p?.email ?? auth.state.value.user?.email ?? ''

  attorneyProfile.draft.value.primaryEmail = email

  if (!attorneyProfile.draft.value.fullName) {
    attorneyProfile.draft.value.fullName = p?.display_name ?? ''
  }
}

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
  }
  hydrateFromAuth()
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
      'barNumber',
      'bio',
      'yearsExperience',
      'languages',
      'primaryEmail',
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
  await submitAttorneyProfile()
}

async function onNext() {
  const saved = await submitAttorneyProfile()
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

  <UForm
    id="attorney-profile"
    :schema="generalInfoSchema"
    :state="profile"
    @submit="onSubmit"
    class="space-y-6"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-briefcase" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">Attorney Profile</h2>
          <p class="text-xs text-muted">Manage your public profile, practice areas, and case availability.</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!isEditing"
          label="Edit"
          color="neutral"
          variant="outline"
          icon="i-lucide-pencil"
          class="rounded-lg"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            label="Next"
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

    <!-- Core Identity -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-fingerprint" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Core Identity</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Full Name <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your complete legal name</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.fullName"
              placeholder="John Doe"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Firm Name <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Name of your law firm or practice</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.firmName"
              placeholder="Doe & Associates Law Firm"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Bar Association Number <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your state bar registration number</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.barNumber"
              placeholder="BAR123456"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Professional Bio</label>
            <p class="mt-0.5 text-xs text-muted">Brief description of your practice and experience (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UTextarea
              v-model="profile.bio"
              :rows="4"
              placeholder="Experienced attorney specializing in..."
              autocomplete="off"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Years of Experience</label>
            <p class="mt-0.5 text-xs text-muted">Total years practicing law (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model.number="profile.yearsExperience"
              type="number"
              min="0"
              placeholder="10"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Languages Spoken <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Select all languages you can communicate in</p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu
              v-model="profile.languages"
              :items="languageOptions"
              multiple
              searchable
              creatable
              placeholder="Select or type languages"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Contact Details -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-phone" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Contact Details</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Primary Email <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Used for client communications and notifications</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.primaryEmail"
              type="email"
              autocomplete="off"
              disabled
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Direct Phone <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your direct contact number</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.directPhone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Primary Physical Location <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your main office address where you practice law</p>
          </div>
          <div class="w-full sm:w-72">
            <UTextarea
              v-model="profile.officeAddress"
              :rows="3"
              placeholder="123 Main Street, Suite 100, City, State, ZIP"
              autocomplete="off"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Website URL</label>
            <p class="mt-0.5 text-xs text-muted">Your firm's website (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.websiteUrl"
              type="url"
              placeholder="https://www.yourfirm.com"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Preferred Contact Method</label>
            <p class="mt-0.5 text-xs text-muted">How you prefer to be contacted (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <USelect
              v-model="profile.preferredContact"
              :items="contactMethodOptions"
              value-key="value"
              label-key="label"
              placeholder="Select contact method"
              :disabled="disabled"
              class="w-full sm:w-72"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Support Staff -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-users" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Support Staff</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Assistant/Paralegal Name</label>
            <p class="mt-0.5 text-xs text-muted">Name of your assistant or paralegal (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.assistantName"
              placeholder="Jane Smith"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Assistant/Paralegal Email</label>
            <p class="mt-0.5 text-xs text-muted">Email address for your assistant (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput
              v-model="profile.assistantEmail"
              type="email"
              placeholder="assistant@yourfirm.com"
              autocomplete="off"
              :disabled="disabled"
              size="md"
              class="w-full sm:w-72"
            />
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
