<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { NEW_TEAM_MEMBER_ID, useTeamMembers } from '../../composables/useTeamMembers'
import {
  getHolidayHoursValidationMessage,
  TEAM_MEMBER_POSITION_VALUES,
  TEAM_MEMBER_POSITIONS,
  WEEKDAY_KEYS,
  formatWeeklyAvailabilitySummary,
  isValidAvailabilityDate,
  type ReadonlyTeamMemberHolidayHours,
  type ReadonlyTeamMemberWeeklyAvailability
} from '../../lib/team-members'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import TeamMemberAvailabilityEditor from '../../components/settings/TeamMemberAvailabilityEditor.vue'

const timeSlotSchema = z.object({
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time'),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time')
}).refine(
  (data) => data.start < data.end,
  { message: 'End time must be later than start time', path: ['end'] }
)

const hasOverlappingSlots = (slots: Array<{ start: string; end: string }>) => {
  const orderedSlots = [...slots].sort((left, right) => left.start.localeCompare(right.start))
  return orderedSlots.some((slot, index) => {
    const previous = orderedSlots[index - 1]
    return Boolean(previous) && previous.end > slot.start
  })
}

const dailyAvailabilitySchema = z.object({
  enabled: z.boolean(),
  slots: z.array(timeSlotSchema)
}).superRefine((data, ctx) => {
  if (data.enabled && data.slots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one time block for available days',
      path: ['slots']
    })
  }

  if (!data.enabled && data.slots.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Remove time blocks or mark the day as available',
      path: ['slots']
    })
  }

  if (hasOverlappingSlots(data.slots)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Time blocks cannot overlap',
      path: ['slots']
    })
  }
})

const weeklyAvailabilitySchema = z.object({
  monday: dailyAvailabilitySchema,
  tuesday: dailyAvailabilitySchema,
  wednesday: dailyAvailabilitySchema,
  thursday: dailyAvailabilitySchema,
  friday: dailyAvailabilitySchema,
  saturday: dailyAvailabilitySchema,
  sunday: dailyAvailabilitySchema
}).superRefine((data, ctx) => {
  if (!WEEKDAY_KEYS.some(day => data[day].enabled)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Set at least one weekly availability window',
      path: ['monday', 'enabled']
    })
  }
})

const holidayHoursSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date'),
  label: z.string().nullable(),
  is_closed: z.boolean(),
  slots: z.array(timeSlotSchema)
}).superRefine((data, ctx) => {
  if (!isValidAvailabilityDate(data.date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select a valid calendar date',
      path: ['date']
    })
  }

  if (data.is_closed && data.slots.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Closed holidays cannot include time blocks',
      path: ['slots']
    })
  }

  if (!data.is_closed && data.slots.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one time block for custom holiday hours',
      path: ['slots']
    })
  }

  if (hasOverlappingSlots(data.slots)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Holiday time blocks cannot overlap',
      path: ['slots']
    })
  }
})

const teamMemberSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  position: z.enum(TEAM_MEMBER_POSITION_VALUES),
  position_other: z.string().optional().or(z.literal('')),
  weekly_availability: weeklyAvailabilitySchema,
  holiday_hours: z.array(holidayHoursSchema)
}).superRefine((data, ctx) => {
  if (data.position === 'other' && (!data.position_other || data.position_other.length < 2)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please specify the position',
      path: ['position_other']
    })
  }

  const holidayDates = data.holiday_hours.map(holiday => holiday.date)
  if (new Set(holidayDates).size !== holidayDates.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Holiday overrides must use unique dates',
      path: ['holiday_hours']
    })
  }
})

type TeamMemberSchema = z.output<typeof teamMemberSchema>

const auth = useAuth()
const team = useTeamMembers()
const toast = useToast()
const router = useRouter()
const saving = ref(false)

const userId = computed(() => auth.state.value.user?.id ?? '')

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    try {
      await team.loadMembers(userId.value)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load team members'
      toast.add({
        title: 'Error',
        description: msg,
        icon: 'i-lucide-x',
        color: 'error'
      })
    }
  }
})

// Clear position_other when switching away from "other"
watch(
  () => team.draft.value?.position,
  (newPos) => {
    if (team.draft.value && newPos !== 'other') {
      team.draft.value.position_other = ''
    }
  }
)

const positionLabel = (position: string, positionOther: string | null) => {
  if (position === 'other') return positionOther || 'Other'
  return TEAM_MEMBER_POSITIONS.find(p => p.value === position)?.label ?? position
}

const availabilityLabel = (weeklyAvailability: ReadonlyTeamMemberWeeklyAvailability) => {
  return formatWeeklyAvailabilitySummary(weeklyAvailability)
}

const holidayHoursLabel = (count: number) => {
  return count > 0 ? 'Holiday Hours Configured' : ''
}

const persistedHolidayHours = computed<ReadonlyTeamMemberHolidayHours>(() => {
  const draftId = team.draft.value?.id
  if (!draftId) return []

  const member = team.members.value.find(candidate => candidate.id === draftId)
  return member?.holiday_hours ?? []
})

const hasBlockingHolidayDraftErrors = computed(() => {
  if (!team.draft.value) return false

  return team.draft.value.holiday_hours.some((holiday, index) => {
    return Boolean(getHolidayHoursValidationMessage(holiday, {
      index,
      allEntries: team.draft.value?.holiday_hours ?? [],
      persistedEntries: persistedHolidayHours.value
    }))
  })
})

const canSubmitDraft = computed(() => {
  if (!team.draft.value) return false
  return teamMemberSchema.safeParse(team.draft.value).success
    && !hasBlockingHolidayDraftErrors.value
})

const memberInitials = (fullName: string) => {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

async function onSaveMember(event: FormSubmitEvent<TeamMemberSchema>) {
  if (!userId.value || !canSubmitDraft.value) return

  const isUpdatingMember = Boolean(team.draft.value?.id)
  saving.value = true
  try {
    await team.saveMember(userId.value, event.data)
    toast.add({
      title: 'Success',
      description: isUpdatingMember ? 'Team member updated.' : 'Team member added.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to save team member'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// Delete confirmation
const deleteModalOpen = ref(false)
const memberToDelete = ref<{ id: string; name: string } | null>(null)

const closeDeleteModal = () => {
  deleteModalOpen.value = false
  memberToDelete.value = null
}

const confirmDelete = (id: string, name: string) => {
  memberToDelete.value = { id, name }
  deleteModalOpen.value = true
}

async function handleConfirmDelete() {
  if (!memberToDelete.value) return
  try {
    await team.removeMember(memberToDelete.value.id)
    toast.add({
      title: 'Removed',
      description: `${memberToDelete.value.name} has been removed from your team.`,
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to remove team member'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    closeDeleteModal()
  }
}

// Unsaved changes guard
const unsavedOpen = ref(false)
const pendingNav = ref<RouteLocationRaw | null>(null)

const handleConfirmDiscard = () => {
  team.cancelEditing()
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

function goToBack() {
  router.push('/settings/expertise')
}

function goToNext() {
  router.push('/settings/retainer-contract-document')
}

onBeforeRouteLeave((to) => {
  if (team.isEditingAny.value && team.isDirty.value) {
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

  <!-- Delete Confirmation Modal -->
  <UModal
    :open="deleteModalOpen"
    title="Remove Team Member"
    :dismissible="false"
    @update:open="(v: boolean) => { if (!v) closeDeleteModal() }"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-white/80">
          Are you sure you want to remove <strong>{{ memberToDelete?.name }}</strong> from your team? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="closeDeleteModal()"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            @click="handleConfirmDelete"
          >
            Remove
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <div class="space-y-6">
    <!-- ═══ Page Header ═══ -->
    <div class="ap-fade-in flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-[0.5px] ring-white/80 dark:bg-[#1a1a1a]/60 dark:ring-white/70">
          <UIcon name="i-lucide-users-round" class="text-lg text-zinc-900 dark:text-white" />
          <div
            class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1a1a] transition-colors"
            :class="team.isEditingAny.value ? 'bg-[var(--ap-accent)]' : 'bg-emerald-400'"
          />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted tracking-tight">
            Team Profile
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Manage your firm's team members, their roles, and availability.
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
          v-if="!team.isEditingAny.value"
          label="Add Member"
          icon="i-lucide-plus"
          class="group rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 hover:text-black transition-colors duration-200"
          :ui="{ leadingIcon: 'text-white transition duration-200 group-hover:text-black' }"
          @click="team.startAddingMember()"
        />
        <template v-else>
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="team.cancelEditing()"
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

    <!-- ═══ Add Member Form ═══ -->
    <div v-if="team.editingMemberId.value === NEW_TEAM_MEMBER_ID && team.draft.value" class="ap-fade-in ap-delay-1 relative w-full max-w-5xl overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-user-plus" class="text-sm text-[var(--ap-accent)]" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-highlighted">
                Add Team Member
              </h4>
              <p class="text-[11px] text-muted">
                Add contact details, role, and availability in one clean step.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto">
            <span class="rounded-md border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)] dark:border-[var(--ap-accent)]/40">
              New member
            </span>
          </div>
        </div>
      </div>

      <UForm
        :schema="teamMemberSchema"
        :state="team.draft.value"
        class="relative space-y-4 p-4 sm:p-5"
        @submit="onSaveMember"
      >
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Full Name <span class="text-red-400/80">*</span></label>
            <UInput
              v-model="team.draft.value.full_name"
              placeholder="Jane Smith"
              autocomplete="off"
              size="sm"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Email <span class="text-red-400/80">*</span></label>
            <UInput
              v-model="team.draft.value.email"
              type="email"
              placeholder="jane@yourfirm.com"
              autocomplete="off"
              size="sm"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Phone</label>
            <UInput
              v-model="team.draft.value.phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              autocomplete="off"
              size="sm"
              class="w-full"
            />
          </div>
          <div class="space-y-1.5 xl:min-w-0">
            <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
            <USelect
              v-model="team.draft.value.position"
              :items="TEAM_MEMBER_POSITIONS"
              placeholder="Select a position"
              size="sm"
              class="w-full"
            />
          </div>
        </div>

        <div v-if="team.draft.value.position === 'other'" class="grid grid-cols-1 gap-3 xl:max-w-sm">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
            <UInput
              v-model="team.draft.value.position_other"
              placeholder="e.g. Case Manager"
              autocomplete="off"
              size="sm"
              class="w-full"
            />
          </div>
        </div>

        <TeamMemberAvailabilityEditor
          :weekly-availability="team.draft.value.weekly_availability"
          :holiday-hours="team.draft.value.holiday_hours"
          :persisted-holiday-hours="persistedHolidayHours"
          :show-holiday-hours="false"
        />

        <div class="flex flex-col gap-3 border-t border-[var(--ap-accent)]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-[11px] text-muted">
            You can update weekly hours or set holiday overrides any time after saving.
          </p>
          <div class="flex gap-2 sm:justify-end">
            <UButton
              label="Cancel"
              type="button"
              color="neutral"
              variant="ghost"
              class="flex-1 rounded-lg sm:flex-none"
              @click="team.cancelEditing()"
            />
            <UButton
              label="Add Member"
              type="submit"
              icon="i-lucide-plus"
              :loading="saving"
              :disabled="!canSubmitDraft"
              class="group flex-1 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90 hover:text-black sm:flex-none"
              :ui="{ leadingIcon: 'text-white transition duration-200 group-hover:text-black' }"
            />
          </div>
        </div>
      </UForm>
    </div>

    <!-- ═══ Team Members Card ═══ -->
    <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex items-center justify-between px-5 py-3.5">
          <div class="flex items-center gap-3">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10 dark:border-[var(--ap-accent)]/40">
              <UIcon name="i-lucide-contact" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <h3 class="text-[13px] font-semibold text-highlighted">
              Team Members
            </h3>
          </div>
          <span v-if="team.memberCount.value > 0" class="rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)] tabular-nums">
            {{ team.memberCount.value }} {{ team.memberCount.value === 1 ? 'member' : 'members' }}
          </span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="team.loading.value" class="relative px-5 py-16 text-center">
        <UIcon name="i-lucide-loader-2" class="mx-auto mb-2 text-2xl text-[var(--ap-accent)] animate-spin" />
        <p class="text-sm text-muted">Loading team members...</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="team.memberCount.value === 0"
        class="relative px-5 py-16 text-center"
      >
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
          <UIcon name="i-lucide-user-plus" class="text-2xl text-[var(--ap-accent)]" />
        </div>
        <p class="text-sm font-medium text-highlighted">No team members yet</p>
        <p class="mt-1 text-xs text-muted">Add your first team member to get started.</p>
        <UButton
          v-if="!team.isEditingAny.value"
          label="Add Member"
          icon="i-lucide-plus"
          size="sm"
          class="group mt-4 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 hover:text-black transition-colors duration-200"
          :ui="{ leadingIcon: 'text-white transition duration-200 group-hover:text-black' }"
          @click="team.startAddingMember()"
        />
      </div>

      <!-- Members List -->
      <div v-else class="relative">
        <template v-for="member in team.members.value" :key="member.id">
          <!-- Editing an existing member -->
          <div v-if="team.editingMemberId.value === member.id && team.draft.value" class="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 px-5 py-5">
            <UForm
              :schema="teamMemberSchema"
              :state="team.draft.value"
              class="space-y-4"
              @submit="onSaveMember"
            >
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Full Name <span class="text-red-400/80">*</span></label>
                  <UInput v-model="team.draft.value.full_name" placeholder="Jane Smith" autocomplete="off" size="md" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Email <span class="text-red-400/80">*</span></label>
                  <UInput v-model="team.draft.value.email" type="email" placeholder="jane@yourfirm.com" autocomplete="off" size="md" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Phone</label>
                  <UInput v-model="team.draft.value.phone" type="tel" placeholder="+1 (555) 123-4567" autocomplete="off" size="md" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
                  <USelect v-model="team.draft.value.position" :items="TEAM_MEMBER_POSITIONS" placeholder="Select a position" class="w-full" />
                </div>
              </div>

              <div v-if="team.draft.value.position === 'other'" class="grid grid-cols-1 gap-3 xl:max-w-sm">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
                  <UInput v-model="team.draft.value.position_other" placeholder="e.g. Case Manager" autocomplete="off" size="md" class="w-full" />
                </div>
              </div>

              <TeamMemberAvailabilityEditor
                :weekly-availability="team.draft.value.weekly_availability"
                :holiday-hours="team.draft.value.holiday_hours"
                :persisted-holiday-hours="persistedHolidayHours"
              />

              <div class="flex justify-end gap-2 pt-1">
                <UButton label="Cancel" type="button" color="neutral" variant="ghost" class="rounded-lg" @click="team.cancelEditing()" />
                <UButton label="Save" type="submit" icon="i-lucide-check" :loading="saving" :disabled="!canSubmitDraft" class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90" />
              </div>
            </UForm>
          </div>

          <!-- Display mode for a member -->
          <div v-else class="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 px-5 py-4 transition-colors duration-200 hover:bg-[var(--ap-accent)]/[0.02]">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
                  <span class="text-xs font-bold text-[var(--ap-accent)]">
                    {{ memberInitials(member.full_name) }}
                  </span>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted truncate">
                    {{ member.full_name }}
                  </p>
                  <div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span class="min-w-0 max-w-full truncate">
                      {{ member.email }}
                    </span>
                    <span
                      v-if="member.phone"
                      class="rounded-md bg-black/[0.03] px-2 py-0.5 text-[11px] text-muted dark:bg-white/[0.06]"
                    >
                      {{ member.phone }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="hidden sm:inline-flex rounded-md border-[0.5px] border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white/90">
                  {{ positionLabel(member.position, member.position_other) }}
                </span>
                <span class="hidden md:inline-flex rounded-md border border-black bg-black px-2 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/45 dark:border-white/10 dark:bg-black dark:ring-white/35">
                  {{ availabilityLabel(member.weekly_availability) }}
                </span>
                <span
                  v-if="member.holiday_hours.length > 0"
                  class="hidden lg:inline-flex rounded-md border border-black/[0.08] bg-white/85 px-2 py-0.5 text-[11px] font-medium text-highlighted dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white/85"
                >
                  {{ holidayHoursLabel(member.holiday_hours.length) }}
                </span>
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Edit team member"
                  class="rounded-lg"
                  :disabled="team.isEditingAny.value"
                  @click="team.startEditingMember(member)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Remove team member"
                  class="rounded-lg text-red-400 hover:text-red-300"
                  :disabled="team.isEditingAny.value"
                  @click="confirmDelete(member.id, member.full_name)"
                />
              </div>
            </div>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
