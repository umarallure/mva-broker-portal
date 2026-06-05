import { computed, readonly, ref, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import {
  createBrokerTeamMember,
  deleteBrokerTeamMember,
  listBrokerTeamMembers,
  regenerateBrokerTeamMemberPassword,
  updateBrokerTeamMember,
  type BrokerTeamMemberDraftSource,
  type BrokerTeamMemberInput,
  type BrokerTeamMemberRow
} from '../lib/broker-team-members'
import {
  createDefaultWeeklyAvailability,
  type TeamMemberHolidayHours,
  type TeamMemberPosition,
  type TeamMemberWeeklyAvailability
} from '../lib/team-members'
import type { BrokerSection } from '../lib/broker-access'

export const NEW_BROKER_TEAM_MEMBER_ID = '__new_broker_member__'

export type BrokerTeamMemberDraft = {
  id: string | null
  full_name: string
  email: string
  phone: string
  state: string
  position: TeamMemberPosition | undefined
  position_other: string
  weekly_availability: TeamMemberWeeklyAvailability
  holiday_hours: TeamMemberHolidayHours
  allowed_sections: BrokerSection[]
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const createEmptyDraft = (): BrokerTeamMemberDraft => ({
  id: null,
  full_name: '',
  email: '',
  phone: '',
  state: '',
  position: undefined,
  position_other: '',
  weekly_availability: createDefaultWeeklyAvailability(),
  holiday_hours: [],
  allowed_sections: ['dashboard']
})

const createDraftFromMember = (member: BrokerTeamMemberDraftSource): BrokerTeamMemberDraft => ({
  id: member.id,
  full_name: member.full_name,
  email: member.email,
  phone: member.phone ?? '',
  state: member.state ?? '',
  position: member.position,
  position_other: member.position_other ?? '',
  weekly_availability: clone(member.weekly_availability) as TeamMemberWeeklyAvailability,
  holiday_hours: clone(member.holiday_hours) as TeamMemberHolidayHours,
  allowed_sections: [...member.allowed_sections]
})

const _useBrokerTeamMembers = () => {
  const members = ref<BrokerTeamMemberRow[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const editingMemberId = ref<string | null>(null)
  const draft = ref<BrokerTeamMemberDraft | null>(null)
  const baseline = ref('')
  const isDirty = ref(false)
  const temporaryPassword = ref<string | null>(null)
  const temporaryPasswordEmail = ref<string | null>(null)

  const setDraft = (nextDraft: BrokerTeamMemberDraft | null) => {
    draft.value = nextDraft ? clone(nextDraft) : null
    baseline.value = draft.value ? JSON.stringify(draft.value) : ''
    isDirty.value = false
  }

  const loadMembers = async (token: string) => {
    loading.value = true
    try {
      members.value = await listBrokerTeamMembers(token)
      loaded.value = true
      return members.value
    } finally {
      loading.value = false
    }
  }

  const startAddingMember = () => {
    editingMemberId.value = NEW_BROKER_TEAM_MEMBER_ID
    setDraft(createEmptyDraft())
  }

  const startEditingMember = (member: BrokerTeamMemberDraftSource) => {
    editingMemberId.value = member.id
    setDraft(createDraftFromMember(member))
  }

  const cancelEditing = () => {
    editingMemberId.value = null
    setDraft(null)
  }

  const setTemporaryPassword = (email: string, password: string) => {
    temporaryPasswordEmail.value = email
    temporaryPassword.value = password
  }

  const clearTemporaryPassword = () => {
    temporaryPasswordEmail.value = null
    temporaryPassword.value = null
  }

  const saveMember = async (token: string, values: BrokerTeamMemberInput) => {
    if (!draft.value) throw new Error('No team member is being edited')

    if (draft.value.id) {
      const updated = await updateBrokerTeamMember(token, draft.value.id, values)
      members.value = members.value.map(member => member.id === updated.id ? updated : member)
      cancelEditing()
      return updated
    }

    const created = await createBrokerTeamMember(token, values)
    members.value = [...members.value, created.member]
    setTemporaryPassword(created.member.email, created.temporaryPassword)
    cancelEditing()
    return created.member
  }

  const regeneratePassword = async (token: string, member: Pick<BrokerTeamMemberRow, 'id' | 'email'>) => {
    const result = await regenerateBrokerTeamMemberPassword(token, member.id)
    setTemporaryPassword(result.member.email, result.temporaryPassword)
  }

  const removeMember = async (token: string, id: string) => {
    await deleteBrokerTeamMember(token, id)
    members.value = members.value.filter(member => member.id !== id)
    if (editingMemberId.value === id) cancelEditing()
  }

  watch(draft, () => {
    isDirty.value = Boolean(draft.value) && JSON.stringify(draft.value) !== baseline.value
  }, { deep: true })

  return {
    members: readonly(members),
    loading: readonly(loading),
    loaded: readonly(loaded),
    editingMemberId: readonly(editingMemberId),
    draft,
    memberCount: computed(() => members.value.length),
    isEditingAny: computed(() => editingMemberId.value !== null),
    isDirty: readonly(isDirty),
    temporaryPassword: readonly(temporaryPassword),
    temporaryPasswordEmail: readonly(temporaryPasswordEmail),
    loadMembers,
    startAddingMember,
    startEditingMember,
    cancelEditing,
    saveMember,
    regeneratePassword,
    removeMember,
    clearTemporaryPassword
  }
}

export const useBrokerTeamMembers = createSharedComposable(_useBrokerTeamMembers)
