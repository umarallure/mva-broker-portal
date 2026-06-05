import {
  SHIFT_AVAILABILITY_VALUES,
  normalizeHolidayHours,
  normalizeTeamMemberInput,
  normalizeTeamMemberState,
  normalizeWeeklyAvailability,
  type ReadonlyTeamMemberHolidayHours,
  type ReadonlyTeamMemberWeeklyAvailability,
  type ShiftAvailability,
  type TeamMemberHolidayHours,
  type TeamMemberInput,
  type TeamMemberPosition,
  type TeamMemberWeeklyAvailability
} from './team-members'
import type { BrokerSection } from './broker-access'

export type BrokerTeamMemberRow = {
  id: string
  broker_id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  state: string | null
  position: TeamMemberPosition
  position_other: string | null
  shift_availability: ShiftAvailability
  weekly_availability: TeamMemberWeeklyAvailability
  holiday_hours: TeamMemberHolidayHours
  allowed_sections: BrokerSection[]
  created_at: string
  updated_at: string
}

export type BrokerTeamMemberDraftSource = {
  id: string
  full_name: string
  email: string
  phone: string | null
  state: string | null
  position: TeamMemberPosition
  position_other: string | null
  weekly_availability: ReadonlyTeamMemberWeeklyAvailability
  holiday_hours: ReadonlyTeamMemberHolidayHours
  allowed_sections: ReadonlyArray<BrokerSection>
}

export type BrokerTeamMemberInput = TeamMemberInput & {
  allowed_sections: BrokerSection[]
}

const EDGE_FUNCTION_PATH = '/functions/v1/manage-broker-team-members'
const EDGE_FUNCTION_BASE = import.meta.env?.VITE_SUPABASE_FUNCTIONS_BASE
const edgeFunctionUrl = EDGE_FUNCTION_BASE
  ? `${String(EDGE_FUNCTION_BASE).replace(/\/$/, '')}${EDGE_FUNCTION_PATH}`
  : EDGE_FUNCTION_PATH

const normalizeRow = (member: BrokerTeamMemberRow): BrokerTeamMemberRow => {
  const shift = SHIFT_AVAILABILITY_VALUES.includes(member.shift_availability)
    ? member.shift_availability
    : 'full_day'

  return {
    ...member,
    state: normalizeTeamMemberState(member.state),
    shift_availability: shift,
    weekly_availability: normalizeWeeklyAvailability(member.weekly_availability, shift),
    holiday_hours: normalizeHolidayHours(member.holiday_hours),
    allowed_sections: member.allowed_sections ?? []
  }
}

const callEdge = async <T>(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  token: string
  body?: Record<string, unknown>
}) => {
  if (!options.token) throw new Error('Missing auth token. Please sign in again.')

  const response = await fetch(edgeFunctionUrl, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`)
  }

  return payload as T
}

const buildPayload = (input: BrokerTeamMemberInput) => {
  const normalized = normalizeTeamMemberInput(input)
  return {
    ...normalized,
    allowed_sections: Array.from(new Set(input.allowed_sections))
  }
}

export const listBrokerTeamMembers = async (token: string) => {
  const result = await callEdge<{ members: BrokerTeamMemberRow[] }>({ method: 'GET', token })
  return result.members.map(normalizeRow)
}

export const createBrokerTeamMember = async (token: string, input: BrokerTeamMemberInput) => {
  const result = await callEdge<{ member: BrokerTeamMemberRow; temporary_password: string }>({
    method: 'POST',
    token,
    body: buildPayload(input)
  })
  return { member: normalizeRow(result.member), temporaryPassword: result.temporary_password }
}

export const updateBrokerTeamMember = async (token: string, id: string, input: BrokerTeamMemberInput) => {
  const result = await callEdge<{ member: BrokerTeamMemberRow }>({
    method: 'PATCH',
    token,
    body: { id, ...buildPayload(input) }
  })
  return normalizeRow(result.member)
}

export const regenerateBrokerTeamMemberPassword = async (token: string, id: string) => {
  const result = await callEdge<{ member: BrokerTeamMemberRow; temporary_password: string }>({
    method: 'PATCH',
    token,
    body: { id, action: 'regenerate_password' }
  })
  return { member: normalizeRow(result.member), temporaryPassword: result.temporary_password }
}

export const deleteBrokerTeamMember = async (token: string, id: string) => {
  await callEdge<{ ok: boolean }>({ method: 'DELETE', token, body: { id } })
}
