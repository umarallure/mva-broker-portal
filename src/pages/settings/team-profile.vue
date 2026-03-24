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
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-users-round" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Team Profile
          </h2>
          <p class="text-xs text-muted">
            Manage your firm's team members, their roles, and availability.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!team.isEditingAny.value"
          label="Add Member"
          icon="i-lucide-plus"
          class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
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
      </div>
    </div>

    <!-- Team Members Card -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-contact" class="text-sm text-muted" />
            <span class="text-xs font-semibold uppercase tracking-wider text-muted">Team Members</span>
          </div>
          <span v-if="team.memberCount.value > 0" class="text-xs text-muted">
            {{ team.memberCount.value }} {{ team.memberCount.value === 1 ? 'member' : 'members' }}
          </span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="team.loading.value" class="px-5 py-12 text-center">
        <UIcon name="i-lucide-loader-2" class="mx-auto mb-2 text-2xl text-muted animate-spin" />
        <p class="text-sm text-muted">
          Loading team members...
        </p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="team.memberCount.value === 0 && team.editingMemberId.value !== NEW_TEAM_MEMBER_ID"
        class="px-5 py-12 text-center"
      >
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-user-plus" class="text-xl text-[var(--ap-accent)]" />
        </div>
        <p class="text-sm font-medium text-highlighted">
          No team members yet
        </p>
        <p class="mt-1 text-xs text-muted">
          Add your first team member to get started.
        </p>
        <UButton
          label="Add Member"
          icon="i-lucide-plus"
          size="sm"
          class="mt-4 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          @click="team.startAddingMember()"
        />
      </div>

      <!-- Members List -->
      <div v-else class="divide-y divide-[var(--ap-card-divide)]">
        <template v-for="member in team.members.value" :key="member.id">
          <!-- Editing an existing member -->
          <div v-if="team.editingMemberId.value === member.id && team.draft.value" class="px-5 py-4">
            <UForm
              :schema="teamMemberSchema"
              :state="team.draft.value"
              class="space-y-0 divide-y divide-[var(--ap-card-divide)]"
              @submit="onSaveMember"
            >
              <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4 first:pt-0">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Full Name <span class="text-red-400">*</span></label>
                  <p class="mt-0.5 text-xs text-muted">
                    Team member's complete name
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <UInput
                    v-model="team.draft.value.full_name"
                    placeholder="Jane Smith"
                    autocomplete="off"
                    size="md"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Email <span class="text-red-400">*</span></label>
                  <p class="mt-0.5 text-xs text-muted">
                    Work email address
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <UInput
                    v-model="team.draft.value.email"
                    type="email"
                    placeholder="jane@yourfirm.com"
                    autocomplete="off"
                    size="md"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Phone Number</label>
                  <p class="mt-0.5 text-xs text-muted">
                    Direct contact number (optional)
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <UInput
                    v-model="team.draft.value.phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autocomplete="off"
                    size="md"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Position <span class="text-red-400">*</span></label>
                  <p class="mt-0.5 text-xs text-muted">
                    Role within your firm
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <USelect
                    v-model="team.draft.value.position"
                    :items="TEAM_MEMBER_POSITIONS"
                    placeholder="Select a position"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div v-if="team.draft.value.position === 'other'" class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Specify Position <span class="text-red-400">*</span></label>
                  <p class="mt-0.5 text-xs text-muted">
                    Enter the custom position title
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <UInput
                    v-model="team.draft.value.position_other"
                    placeholder="e.g. Case Manager"
                    autocomplete="off"
                    size="md"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <label class="text-sm font-medium text-highlighted">Shift Availability <span class="text-red-400">*</span></label>
                  <p class="mt-0.5 text-xs text-muted">
                    When this team member is available
                  </p>
                </div>
                <div class="w-full sm:w-72">
                  <USelect
                    v-model="team.draft.value.shift_availability"
                    :items="SHIFT_AVAILABILITY_OPTIONS"
                    placeholder="Select availability"
                    class="w-full sm:w-72"
                  />
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <UButton
                  label="Cancel"
                  type="button"
                  color="neutral"
                  variant="ghost"
                  class="rounded-lg"
                  @click="team.cancelEditing()"
                />
                <UButton
                  label="Save Member"
                  type="submit"
                  icon="i-lucide-check"
                  :loading="saving"
                  class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
                />
              </div>
            </UForm>
          </div>

          <!-- Display mode for a member -->
          <div v-else class="flex items-center justify-between gap-4 px-5 py-4">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ap-accent)]/10">
                <span class="text-xs font-semibold text-[var(--ap-accent)]">
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
              <span class="hidden sm:inline-flex rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-2.5 py-0.5 text-xs font-medium text-highlighted">
                {{ positionLabel(member.position, member.position_other) }}
              </span>
              <span
                v-if="member.phone"
                class="hidden sm:inline-flex rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-2.5 py-0.5 text-xs text-muted"
              >
                {{ member.phone }}
              </span>
              <span class="hidden sm:inline-flex rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-2.5 py-0.5 text-xs text-muted">
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
        </template>

        <!-- New member form -->
        <div v-if="team.editingMemberId.value === NEW_TEAM_MEMBER_ID && team.draft.value" class="px-5 py-4">
          <UForm
            :schema="teamMemberSchema"
            :state="team.draft.value"
            class="space-y-0 divide-y divide-[var(--ap-card-divide)]"
            @submit="onSaveMember"
          >
            <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4 first:pt-0">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Full Name <span class="text-red-400">*</span></label>
                <p class="mt-0.5 text-xs text-muted">
                  Team member's complete name
                </p>
              </div>
              <div class="w-full sm:w-72">
                <UInput
                  v-model="team.draft.value.full_name"
                  placeholder="Jane Smith"
                  autocomplete="off"
                  size="md"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Email <span class="text-red-400">*</span></label>
                <p class="mt-0.5 text-xs text-muted">
                  Work email address
                </p>
              </div>
              <div class="w-full sm:w-72">
                <UInput
                  v-model="team.draft.value.email"
                  type="email"
                  placeholder="jane@yourfirm.com"
                  autocomplete="off"
                  size="md"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Phone Number</label>
                <p class="mt-0.5 text-xs text-muted">
                  Direct contact number (optional)
                </p>
              </div>
              <div class="w-full sm:w-72">
                <UInput
                  v-model="team.draft.value.phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  autocomplete="off"
                  size="md"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Position <span class="text-red-400">*</span></label>
                <p class="mt-0.5 text-xs text-muted">
                  Role within your firm
                </p>
              </div>
              <div class="w-full sm:w-72">
                <USelect
                  v-model="team.draft.value.position"
                  :items="TEAM_MEMBER_POSITIONS"
                  placeholder="Select a position"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div v-if="team.draft.value.position === 'other'" class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Specify Position <span class="text-red-400">*</span></label>
                <p class="mt-0.5 text-xs text-muted">
                  Enter the custom position title
                </p>
              </div>
              <div class="w-full sm:w-72">
                <UInput
                  v-model="team.draft.value.position_other"
                  placeholder="e.g. Case Manager"
                  autocomplete="off"
                  size="md"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div class="flex max-sm:flex-col items-start justify-between gap-4 py-4">
              <div class="min-w-0 flex-1">
                <label class="text-sm font-medium text-highlighted">Shift Availability <span class="text-red-400">*</span></label>
                <p class="mt-0.5 text-xs text-muted">
                  When this team member is available
                </p>
              </div>
              <div class="w-full sm:w-72">
                <USelect
                  v-model="team.draft.value.shift_availability"
                  :items="SHIFT_AVAILABILITY_OPTIONS"
                  placeholder="Select availability"
                  class="w-full sm:w-72"
                />
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                label="Cancel"
                type="button"
                color="neutral"
                variant="ghost"
                class="rounded-lg"
                @click="team.cancelEditing()"
              />
              <UButton
                label="Add Member"
                type="submit"
                icon="i-lucide-plus"
                :loading="saving"
                class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
              />
            </div>
          </UForm>
        </div>
      </div>
    </div>
  </div>
</template>
