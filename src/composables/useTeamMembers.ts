import { ref, readonly, computed, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import {
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
  normalizeTeamMemberInput,
  createDefaultWeeklyAvailability,
  type TeamMemberInput,
  type TeamMemberRow,
  type TeamMemberPosition,
  type ReadonlyTeamMemberWeeklyAvailability,
  type ReadonlyTeamMemberHolidayHours,
  type TeamMemberWeeklyAvailability,
  type TeamMemberHolidayHours
} from '../lib/team-members'

export const NEW_TEAM_MEMBER_ID = '__new__'

export interface TeamMemberDraft {
  id: string | null
  full_name: string
  email: string
  phone: string
  state: string
  position: TeamMemberPosition | undefined
  position_other: string
  weekly_availability: TeamMemberWeeklyAvailability
  holiday_hours: TeamMemberHolidayHours
}

interface TeamMemberDraftSource {
  id: string
  full_name: string
  email: string
  phone: string | null
  state: string | null
  position: TeamMemberPosition
  position_other: string | null
  weekly_availability: ReadonlyTeamMemberWeeklyAvailability
  holiday_hours: ReadonlyTeamMemberHolidayHours
}

const clone = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T
}

const createEmptyDraft = (): TeamMemberDraft => ({
  id: null,
  full_name: '',
  email: '',
  phone: '',
  state: '',
  position: undefined,
  position_other: '',
  weekly_availability: createDefaultWeeklyAvailability(),
  holiday_hours: []
})

const createDraftFromMember = (member: TeamMemberDraftSource): TeamMemberDraft => ({
  id: member.id,
  full_name: member.full_name,
  email: member.email,
  phone: member.phone ?? '',
  state: member.state ?? '',
  position: member.position,
  position_other: member.position_other ?? '',
  weekly_availability: clone(member.weekly_availability) as TeamMemberWeeklyAvailability,
  holiday_hours: clone(member.holiday_hours) as TeamMemberHolidayHours
})

const _useTeamMembers = () => {
  const members = ref<TeamMemberRow[]>([])
  const loading = ref(false)
  const loadedLawyerId = ref<string | null>(null)
  const editingMemberId = ref<string | null>(null)
  const draft = ref<TeamMemberDraft | null>(null)
  const baseline = ref('')
  const isDirty = ref(false)

  const setDraft = (nextDraft: TeamMemberDraft | null) => {
    draft.value = nextDraft ? clone(nextDraft) : null
    baseline.value = draft.value ? JSON.stringify(draft.value) : ''
    isDirty.value = false
  }

  const loadMembers = async (lawyerId: string) => {
    if (loadedLawyerId.value === lawyerId) return members.value

    loading.value = true
    try {
      members.value = await getTeamMembers(lawyerId)
      loadedLawyerId.value = lawyerId
      return members.value
    } catch (error) {
      console.error('Failed to load team members:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  const reloadMembers = async (lawyerId: string) => {
    loadedLawyerId.value = null
    return loadMembers(lawyerId)
  }

  const startAddingMember = () => {
    editingMemberId.value = NEW_TEAM_MEMBER_ID
    setDraft(createEmptyDraft())
  }

  const startEditingMember = (member: TeamMemberDraftSource) => {
    editingMemberId.value = member.id
    setDraft(createDraftFromMember(member))
  }

  const cancelEditing = () => {
    editingMemberId.value = null
    setDraft(null)
  }

  const saveMember = async (lawyerId: string, values: TeamMemberInput) => {
    if (!draft.value) {
      throw new Error('No team member is being edited')
    }

    const payload = normalizeTeamMemberInput(values)

    try {
      if (draft.value.id) {
        const updated = await updateTeamMember(draft.value.id, payload)
        members.value = members.value.map(member => (
          member.id === updated.id ? updated : member
        ))
        cancelEditing()
        return updated
      } else {
        const inserted = await addTeamMember({
          lawyer_id: lawyerId,
          ...payload
        })
        members.value = [...members.value, inserted]
        cancelEditing()
        return inserted
      }
    } catch (error) {
      console.error('Failed to save team member:', error)
      throw error
    }
  }

  const removeMember = async (id: string) => {
    await deleteTeamMember(id)
    members.value = members.value.filter(m => m.id !== id)
    if (editingMemberId.value === id) {
      cancelEditing()
    }
  }

  const memberCount = computed(() => members.value.length)
  const isEditingAny = computed(() => editingMemberId.value !== null)
  const loaded = computed(() => loadedLawyerId.value !== null)

  watch(
    draft,
    () => {
      if (!editingMemberId.value || !draft.value) {
        isDirty.value = false
        return
      }

      isDirty.value = JSON.stringify(draft.value) !== baseline.value
    },
    { deep: true }
  )

  const resetMembers = () => {
    members.value = []
    loadedLawyerId.value = null
    editingMemberId.value = null
    setDraft(null)
  }

  return {
    members: readonly(members),
    loading: readonly(loading),
    loaded: readonly(loaded),
    editingMemberId: readonly(editingMemberId),
    draft,
    memberCount,
    isEditingAny,
    isDirty: readonly(isDirty),
    loadMembers,
    reloadMembers,
    startAddingMember,
    startEditingMember,
    cancelEditing,
    saveMember,
    removeMember,
    resetMembers
  }
}

export const useTeamMembers = createSharedComposable(_useTeamMembers)
