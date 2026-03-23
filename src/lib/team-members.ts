import { supabase } from './supabase'

export const TEAM_MEMBER_POSITION_VALUES = [
  'accounting',
  'marketing',
  'invoicing',
  'intake_team',
  'other'
] as const

export const SHIFT_AVAILABILITY_VALUES = [
  'morning',
  'afternoon',
  'evening',
  'full_day'
] as const

export type TeamMemberPosition = (typeof TEAM_MEMBER_POSITION_VALUES)[number]
export type ShiftAvailability = (typeof SHIFT_AVAILABILITY_VALUES)[number]

export const TEAM_MEMBER_POSITIONS = [
  { label: 'Accounting', value: 'accounting' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Invoicing', value: 'invoicing' },
  { label: 'Intake Team', value: 'intake_team' },
  { label: 'Other', value: 'other' }
] satisfies Array<{ label: string; value: TeamMemberPosition }>

export const SHIFT_AVAILABILITY_OPTIONS = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Full Day', value: 'full_day' }
] satisfies Array<{ label: string; value: ShiftAvailability }>

export interface TeamMemberRow {
  id: string
  lawyer_id: string
  full_name: string
  email: string
  phone: string | null
  position: TeamMemberPosition
  position_other: string | null
  shift_availability: ShiftAvailability
  created_at: string
  updated_at: string
}

export interface TeamMemberInput {
  full_name: string
  email: string
  phone?: string | null
  position: TeamMemberPosition
  position_other?: string | null
  shift_availability: ShiftAvailability
}

export interface TeamMemberWrite extends TeamMemberInput {
  phone: string | null
  position_other: string | null
}

export interface TeamMemberInsert extends TeamMemberWrite {
  lawyer_id: string
}

export type TeamMemberUpdate = Partial<TeamMemberWrite>

export function normalizeTeamMemberInput(member: TeamMemberInput): TeamMemberWrite {
  return {
    full_name: member.full_name.trim(),
    email: member.email.trim().toLowerCase(),
    phone: member.phone?.trim() || null,
    position: member.position,
    position_other: member.position === 'other'
      ? member.position_other?.trim() || null
      : null,
    shift_availability: member.shift_availability
  }
}

export async function getTeamMembers(lawyerId: string): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('lawyer_id', lawyerId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to fetch team members')
  return data ?? []
}

export async function addTeamMember(member: TeamMemberInsert): Promise<TeamMemberRow> {
  const { data, error } = await supabase
    .from('team_members')
    .insert(member)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to add team member')
  return data
}

export async function updateTeamMember(id: string, updates: TeamMemberUpdate): Promise<TeamMemberRow> {
  const { data, error } = await supabase
    .from('team_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to update team member')
  return data
}

export async function deleteTeamMember(id: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Failed to delete team member')
}
