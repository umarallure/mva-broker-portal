<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { NEW_TEAM_MEMBER_ID, useTeamMembers } from '../../composables/useTeamMembers'
import {
  TEAM_MEMBER_POSITION_VALUES,
  TEAM_MEMBER_POSITIONS,
  SHIFT_AVAILABILITY_OPTIONS,
  SHIFT_AVAILABILITY_VALUES
} from '../../lib/team-members'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const teamMemberSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  position: z.enum(TEAM_MEMBER_POSITION_VALUES),
  position_other: z.string().optional().or(z.literal('')),
  shift_availability: z.enum(SHIFT_AVAILABILITY_VALUES)
}).refine(
  (data) => data.position !== 'other' || (data.position_other && data.position_other.length >= 2),
  { message: 'Please specify the position', path: ['position_other'] }
)

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

const shiftLabel = (shift: string) => {
  return SHIFT_AVAILABILITY_OPTIONS.find(s => s.value === shift)?.label ?? shift
}

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
  if (!userId.value) return

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
        <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
          <UIcon name="i-lucide-users-round" class="text-lg text-[var(--ap-accent)]" />
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
          class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
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

    <!-- ═══ Team Members Card ═══ -->
    <div class="ap-fade-in ap-delay-1 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex items-center justify-between px-5 py-3.5">
          <div class="flex items-center gap-3">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
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
        v-else-if="team.memberCount.value === 0 && team.editingMemberId.value !== NEW_TEAM_MEMBER_ID"
        class="relative px-5 py-16 text-center"
      >
        <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
          <UIcon name="i-lucide-user-plus" class="text-2xl text-[var(--ap-accent)]" />
        </div>
        <p class="text-sm font-medium text-highlighted">No team members yet</p>
        <p class="mt-1 text-xs text-muted">Add your first team member to get started.</p>
        <UButton
          label="Add Member"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/80 transition-colors duration-200"
          @click="team.startAddingMember()"
        />
      </div>

      <!-- Members List -->
      <div v-else class="relative">
        <!-- New member form -->
        <div v-if="team.editingMemberId.value === NEW_TEAM_MEMBER_ID && team.draft.value" class="border-b border-black/[0.04] dark:border-white/[0.04] px-5 py-5">
          <div class="relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/20">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="relative flex flex-col gap-3 border-b border-[var(--ap-accent)]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2.5">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
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
                <span class="rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)]">
                  New member
                </span>
                <span class="rounded-md bg-black/[0.03] px-2 py-0.5 text-[11px] text-muted dark:bg-white/[0.06]">
                  4 required fields
                </span>
              </div>
            </div>

            <UForm
              :schema="teamMemberSchema"
              :state="team.draft.value"
              class="relative space-y-5 p-4 sm:p-5"
              @submit="onSaveMember"
            >
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
                <div class="space-y-1.5 lg:col-span-4">
                  <label class="text-xs font-medium text-highlighted">Full Name <span class="text-red-400/80">*</span></label>
                  <UInput
                    v-model="team.draft.value.full_name"
                    placeholder="Jane Smith"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5 lg:col-span-5">
                  <label class="text-xs font-medium text-highlighted">Email <span class="text-red-400/80">*</span></label>
                  <UInput
                    v-model="team.draft.value.email"
                    type="email"
                    placeholder="jane@yourfirm.com"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5 lg:col-span-3">
                  <label class="text-xs font-medium text-highlighted">Phone</label>
                  <UInput
                    v-model="team.draft.value.phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
                <div :class="team.draft.value.position === 'other' ? 'space-y-1.5 lg:col-span-4' : 'space-y-1.5 lg:col-span-6'">
                  <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
                  <USelect
                    v-model="team.draft.value.position"
                    :items="TEAM_MEMBER_POSITIONS"
                    placeholder="Select a position"
                    class="w-full"
                  />
                </div>
                <div v-if="team.draft.value.position === 'other'" class="space-y-1.5 lg:col-span-4">
                  <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
                  <UInput
                    v-model="team.draft.value.position_other"
                    placeholder="e.g. Case Manager"
                    autocomplete="off"
                    size="md"
                    class="w-full"
                  />
                </div>
                <div :class="team.draft.value.position === 'other' ? 'space-y-1.5 lg:col-span-4' : 'space-y-1.5 lg:col-span-6'">
                  <label class="text-xs font-medium text-highlighted">Shift Availability <span class="text-red-400/80">*</span></label>
                  <USelect
                    v-model="team.draft.value.shift_availability"
                    :items="SHIFT_AVAILABILITY_OPTIONS"
                    placeholder="Select availability"
                    class="w-full"
                  />
                </div>
              </div>

              <div class="flex flex-col gap-3 border-t border-[var(--ap-accent)]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-[11px] text-muted">
                  You can update or remove this team member any time after saving.
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
                    class="flex-1 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90 sm:flex-none"
                  />
                </div>
              </div>
            </UForm>
          </div>
        </div>

        <template v-for="member in team.members.value" :key="member.id">
          <!-- Editing an existing member -->
          <div v-if="team.editingMemberId.value === member.id && team.draft.value" class="border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 px-5 py-5">
            <UForm
              :schema="teamMemberSchema"
              :state="team.draft.value"
              class="space-y-4"
              @submit="onSaveMember"
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
                  <USelect v-model="team.draft.value.position" :items="TEAM_MEMBER_POSITIONS" placeholder="Select a position" class="w-full" />
                </div>
                <div v-if="team.draft.value.position === 'other'" class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
                  <UInput v-model="team.draft.value.position_other" placeholder="e.g. Case Manager" autocomplete="off" size="md" class="w-full" />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs font-medium text-highlighted">Shift Availability <span class="text-red-400/80">*</span></label>
                  <USelect v-model="team.draft.value.shift_availability" :items="SHIFT_AVAILABILITY_OPTIONS" placeholder="Select availability" class="w-full" />
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-1">
                <UButton label="Cancel" type="button" color="neutral" variant="ghost" class="rounded-lg" @click="team.cancelEditing()" />
                <UButton label="Save Member" type="submit" icon="i-lucide-check" :loading="saving" class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90" />
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
                  <p class="text-xs text-muted truncate">
                    {{ member.email }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="hidden sm:inline-flex rounded-md bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)]">
                  {{ positionLabel(member.position, member.position_other) }}
                </span>
                <span
                  v-if="member.phone"
                  class="hidden lg:inline-flex rounded-md bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted"
                >
                  {{ member.phone }}
                </span>
                <span class="hidden md:inline-flex rounded-md bg-black/[0.03] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
                  {{ shiftLabel(member.shift_availability) }}
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
