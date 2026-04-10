import { US_STATES } from './us-states'
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

export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const

export type TeamMemberWeekday = (typeof WEEKDAY_KEYS)[number]

export interface AvailabilityTimeSlot {
  start: string
  end: string
}

export interface TeamMemberDailyAvailability {
  enabled: boolean
  slots: AvailabilityTimeSlot[]
}

export type TeamMemberWeeklyAvailability = Record<TeamMemberWeekday, TeamMemberDailyAvailability>

export interface ReadonlyTeamMemberDailyAvailability {
  enabled: boolean
  slots: ReadonlyArray<Readonly<AvailabilityTimeSlot>>
}

export type ReadonlyTeamMemberWeeklyAvailability = Record<TeamMemberWeekday, ReadonlyTeamMemberDailyAvailability>

export interface TeamMemberHolidayHoursEntry {
  date: string
  label: string | null
  is_closed: boolean
  slots: AvailabilityTimeSlot[]
}

export type TeamMemberHolidayHours = TeamMemberHolidayHoursEntry[]
export interface ReadonlyTeamMemberHolidayHoursEntry {
  date: string
  label: string | null
  is_closed: boolean
  slots: ReadonlyArray<Readonly<AvailabilityTimeSlot>>
}

export type ReadonlyTeamMemberHolidayHours = ReadonlyArray<ReadonlyTeamMemberHolidayHoursEntry>

type HolidayHoursComparable = Pick<ReadonlyTeamMemberHolidayHoursEntry, 'date' | 'is_closed' | 'slots'>

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

export const TEAM_MEMBER_STATE_VALUES = US_STATES.map(state => state.code)

export const TEAM_MEMBER_STATE_OPTIONS = US_STATES.map(state => ({
  label: `${state.name} (${state.code})`,
  value: state.code
})) satisfies Array<{ label: string; value: string }>

export const WEEKDAY_OPTIONS = [
  { label: 'Monday', shortLabel: 'Mon', value: 'monday' },
  { label: 'Tuesday', shortLabel: 'Tue', value: 'tuesday' },
  { label: 'Wednesday', shortLabel: 'Wed', value: 'wednesday' },
  { label: 'Thursday', shortLabel: 'Thu', value: 'thursday' },
  { label: 'Friday', shortLabel: 'Fri', value: 'friday' },
  { label: 'Saturday', shortLabel: 'Sat', value: 'saturday' },
  { label: 'Sunday', shortLabel: 'Sun', value: 'sunday' }
] satisfies Array<{ label: string; shortLabel: string; value: TeamMemberWeekday }>

const BUSINESS_WEEKDAY_SET = new Set<TeamMemberWeekday>([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday'
])

const LEGACY_SHIFT_SLOT_MAP: Record<ShiftAvailability, AvailabilityTimeSlot> = {
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '12:00', end: '17:00' },
  evening: { start: '17:00', end: '20:00' },
  full_day: { start: '09:00', end: '17:00' }
}

const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TEAM_MEMBER_STATE_SET = new Set(TEAM_MEMBER_STATE_VALUES)

export interface TeamMemberRow {
  id: string
  lawyer_id: string
  full_name: string
  email: string
  phone: string | null
  state: string | null
  position: TeamMemberPosition
  position_other: string | null
  shift_availability: ShiftAvailability
  weekly_availability: TeamMemberWeeklyAvailability
  holiday_hours: TeamMemberHolidayHours
  created_at: string
  updated_at: string
}

export interface TeamMemberInput {
  full_name: string
  email: string
  phone?: string | null
  state?: string | null
  position: TeamMemberPosition
  position_other?: string | null
  weekly_availability: TeamMemberWeeklyAvailability
  holiday_hours: TeamMemberHolidayHours
}

export interface TeamMemberWrite extends TeamMemberInput {
  phone: string | null
  state: string | null
  position_other: string | null
  shift_availability: ShiftAvailability
}

export interface TeamMemberInsert extends TeamMemberWrite {
  lawyer_id: string
}

export type TeamMemberUpdate = Partial<TeamMemberWrite>

export function isValidTeamMemberState(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toUpperCase()
  return TEAM_MEMBER_STATE_SET.has(normalized)
}

export function normalizeTeamMemberState(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim().toUpperCase()
  return TEAM_MEMBER_STATE_SET.has(normalized) ? normalized : null
}

export function getTeamMemberStateLabel(value: string | null | undefined): string {
  const normalized = normalizeTeamMemberState(value)
  if (!normalized) return ''

  const state = US_STATES.find(candidate => candidate.code === normalized)
  return state ? `${state.name} (${state.code})` : normalized
}

const cloneSlot = (slot: AvailabilityTimeSlot): AvailabilityTimeSlot => ({
  start: slot.start,
  end: slot.end
})

export function createAvailabilitySlot(start = '09:00', end = '17:00'): AvailabilityTimeSlot {
  return { start, end }
}

export function createHolidayHoursEntry(): TeamMemberHolidayHoursEntry {
  return {
    date: '',
    label: null,
    is_closed: false,
    slots: [createAvailabilitySlot('09:00', '14:00')]
  }
}

const toTimeInMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours * 60) + minutes
}

export function isValidAvailabilityTime(value: string): boolean {
  return TIME_VALUE_PATTERN.test(value)
}

export function isValidAvailabilityDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const normalizedDate = new Date(Date.UTC(year, month - 1, day))

  return normalizedDate.getUTCFullYear() === year
    && normalizedDate.getUTCMonth() === month - 1
    && normalizedDate.getUTCDate() === day
}

export function formatLocalAvailabilityDate(value = new Date()): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isAvailabilityDateOnOrAfterToday(value: string, referenceDate = new Date()): boolean {
  return isValidAvailabilityDate(value) && value >= formatLocalAvailabilityDate(referenceDate)
}

export function getHolidayHoursSignature(entry: HolidayHoursComparable): string {
  const slotSignature = entry.is_closed
    ? 'closed'
    : entry.slots.map(slot => `${slot.start}-${slot.end}`).join('|')

  return `${entry.date}|${slotSignature}`
}

export function isHolidayHoursEntryPersisted(
  entry: HolidayHoursComparable,
  persistedEntries: ReadonlyArray<HolidayHoursComparable> = []
): boolean {
  return persistedEntries.some(candidate => getHolidayHoursSignature(candidate) === getHolidayHoursSignature(entry))
}

export function getHolidayHoursValidationMessage(
  entry: TeamMemberHolidayHoursEntry | ReadonlyTeamMemberHolidayHoursEntry | null | undefined,
  options: {
    index?: number
    allEntries?: ReadonlyArray<TeamMemberHolidayHoursEntry | ReadonlyTeamMemberHolidayHoursEntry>
    persistedEntries?: ReadonlyArray<HolidayHoursComparable>
    referenceDate?: Date
  } = {}
): string | null {
  if (!entry) return null

  const date = entry.date.trim()
  const start = entry.slots[0]?.start ?? ''
  const end = entry.slots[0]?.end ?? ''

  if (!date && !start && !end) {
    return 'Choose a holiday date to save this override.'
  }

  if (!date) {
    return 'Choose a holiday date.'
  }

  const duplicateDate = (options.allEntries ?? []).some((candidate, candidateIndex) => {
    if (candidateIndex === options.index) return false
    return candidate.date.trim() === date
  })

  if (duplicateDate) {
    return 'Each holiday override must use a unique date.'
  }

  if (!isValidAvailabilityDate(date)) {
    return 'Choose a valid calendar date.'
  }

  const isPersisted = isHolidayHoursEntryPersisted(entry, options.persistedEntries ?? [])
  if (!isPersisted && !isAvailabilityDateOnOrAfterToday(date, options.referenceDate)) {
    return 'Choose today or a future date.'
  }

  if (!start && !end) {
    return null
  }

  if (!start || !end) {
    return 'Enter both From and To times, or leave both blank for a full day off.'
  }

  if (!isValidAvailabilityTime(start) || !isValidAvailabilityTime(end)) {
    return 'Use a valid 24-hour time.'
  }

  if (start >= end) {
    return 'End time must be later than start time.'
  }

  return null
}

export function normalizeAvailabilitySlots(value: unknown): AvailabilityTimeSlot[] {
  if (!Array.isArray(value)) return []

  return value
    .map((slot) => {
      if (!slot || typeof slot !== 'object') return null
      const start = typeof slot.start === 'string' ? slot.start.trim() : ''
      const end = typeof slot.end === 'string' ? slot.end.trim() : ''

      if (!isValidAvailabilityTime(start) || !isValidAvailabilityTime(end) || start >= end) {
        return null
      }

      return { start, end }
    })
    .filter((slot): slot is AvailabilityTimeSlot => Boolean(slot))
    .sort((left, right) => {
      return toTimeInMinutes(left.start) - toTimeInMinutes(right.start)
    })
    .reduce<AvailabilityTimeSlot[]>((slots, slot) => {
      const previous = slots[slots.length - 1]
      if (previous && previous.end > slot.start) {
        return slots
      }

      slots.push(slot)
      return slots
    }, [])
}

export function createWeeklyAvailabilityFromShift(shift: ShiftAvailability = 'full_day'): TeamMemberWeeklyAvailability {
  const defaultSlot = cloneSlot(LEGACY_SHIFT_SLOT_MAP[shift] ?? LEGACY_SHIFT_SLOT_MAP.full_day)

  return WEEKDAY_KEYS.reduce<TeamMemberWeeklyAvailability>((availability, day) => {
    const enabled = BUSINESS_WEEKDAY_SET.has(day)

    availability[day] = {
      enabled,
      slots: enabled ? [cloneSlot(defaultSlot)] : []
    }

    return availability
  }, {} as TeamMemberWeeklyAvailability)
}

export function createDefaultWeeklyAvailability(): TeamMemberWeeklyAvailability {
  return createWeeklyAvailabilityFromShift('full_day')
}

export function normalizeWeeklyAvailability(
  value: unknown,
  fallbackShift: ShiftAvailability = 'full_day'
): TeamMemberWeeklyAvailability {
  const fallback = createWeeklyAvailabilityFromShift(fallbackShift)
  if (!value || typeof value !== 'object') return fallback
  const source = value as Partial<Record<TeamMemberWeekday, { enabled?: boolean; slots?: unknown }>>

  return WEEKDAY_KEYS.reduce<TeamMemberWeeklyAvailability>((availability, day) => {
    const sourceDay = source[day]
    const fallbackDay = fallback[day]
    const enabled = typeof sourceDay?.enabled === 'boolean'
      ? sourceDay.enabled
      : fallbackDay.enabled
    const slots = normalizeAvailabilitySlots(sourceDay?.slots)

    availability[day] = enabled
      ? {
          enabled: true,
          slots: slots.length ? slots : fallbackDay.slots.map(cloneSlot)
        }
      : {
          enabled: false,
          slots: []
        }

    return availability
  }, {} as TeamMemberWeeklyAvailability)
}

export function normalizeHolidayHours(value: unknown): TeamMemberHolidayHours {
  if (!Array.isArray(value)) return []

  const seenDates = new Set<string>()

  return value
    .map<TeamMemberHolidayHoursEntry | null>((entry) => {
      if (!entry || typeof entry !== 'object') return null

      const date = typeof entry.date === 'string' ? entry.date.trim() : ''
      if (!isValidAvailabilityDate(date)) {
        return null
      }

      if (seenDates.has(date)) {
        return null
      }

      seenDates.add(date)

      const isClosed = entry.is_closed === true
      const slots = isClosed ? [] : normalizeAvailabilitySlots(entry.slots)

      if (!isClosed && slots.length === 0) {
        return null
      }

      return {
        date,
        label: null as string | null,
        is_closed: isClosed,
        slots
      }
    })
    .filter((entry): entry is TeamMemberHolidayHoursEntry => Boolean(entry))
    .sort((left, right) => left.date.localeCompare(right.date))
}

export function deriveLegacyShiftAvailability(weeklyAvailability: ReadonlyTeamMemberWeeklyAvailability): ShiftAvailability {
  const slots = WEEKDAY_KEYS.flatMap((day) => {
    const config = weeklyAvailability[day]
    return config?.enabled ? config.slots : []
  })

  if (!slots.length) return 'full_day'

  const earliestStart = slots.reduce((earliest, slot) => {
    return slot.start < earliest ? slot.start : earliest
  }, slots[0].start)
  const latestEnd = slots.reduce((latest, slot) => {
    return slot.end > latest ? slot.end : latest
  }, slots[0].end)

  if (latestEnd <= '12:30') return 'morning'
  if (earliestStart >= '17:00') return 'evening'
  if (earliestStart >= '12:00' && latestEnd <= '18:30') return 'afternoon'
  return 'full_day'
}

const normalizeTeamMemberRecord = (member: TeamMemberRow): TeamMemberRow => {
  const shiftAvailability = SHIFT_AVAILABILITY_VALUES.includes(member.shift_availability)
    ? member.shift_availability
    : 'full_day'

  return {
    ...member,
    state: normalizeTeamMemberState(member.state),
    shift_availability: shiftAvailability,
    weekly_availability: normalizeWeeklyAvailability(member.weekly_availability, shiftAvailability),
    holiday_hours: normalizeHolidayHours(member.holiday_hours)
  }
}

const formatShortDayRange = (days: TeamMemberWeekday[]) => {
  if (!days.length) return 'No weekly hours'

  const indexes = days
    .map(day => WEEKDAY_KEYS.indexOf(day))
    .sort((left, right) => left - right)
  const segments: string[] = []
  let segmentStart = indexes[0]
  let previousIndex = indexes[0]

  for (let index = 1; index < indexes.length; index += 1) {
    const currentIndex = indexes[index]
    if (currentIndex === previousIndex + 1) {
      previousIndex = currentIndex
      continue
    }

    const startLabel = WEEKDAY_OPTIONS[segmentStart]?.shortLabel ?? ''
    const endLabel = WEEKDAY_OPTIONS[previousIndex]?.shortLabel ?? ''
    segments.push(segmentStart === previousIndex ? startLabel : `${startLabel}-${endLabel}`)
    segmentStart = currentIndex
    previousIndex = currentIndex
  }

  const startLabel = WEEKDAY_OPTIONS[segmentStart]?.shortLabel ?? ''
  const endLabel = WEEKDAY_OPTIONS[previousIndex]?.shortLabel ?? ''
  segments.push(segmentStart === previousIndex ? startLabel : `${startLabel}-${endLabel}`)

  return segments.join(', ')
}

const getSlotSignature = (slots: ReadonlyArray<Readonly<AvailabilityTimeSlot>>) => {
  return slots.map(slot => `${slot.start}-${slot.end}`).join('|')
}

export function formatAvailabilityTime(value: string): string {
  if (!isValidAvailabilityTime(value)) return value

  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const normalizedHours = hours % 12 || 12
  return `${normalizedHours}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function formatAvailabilitySlot(slot: Readonly<AvailabilityTimeSlot>): string {
  return `${formatAvailabilityTime(slot.start)} - ${formatAvailabilityTime(slot.end)}`
}

export function formatWeeklyAvailabilitySummary(weeklyAvailability: ReadonlyTeamMemberWeeklyAvailability): string {
  const enabledDays = WEEKDAY_KEYS.filter(day => weeklyAvailability[day]?.enabled)
  if (!enabledDays.length) return 'No weekly hours'

  const segments: Array<{ days: TeamMemberWeekday[]; slotLabel: string }> = []

  for (const day of enabledDays) {
    const slots = weeklyAvailability[day].slots
    const slotSignature = getSlotSignature(slots)
    const slotLabel = slots.map(formatAvailabilitySlot).join(', ')
    const previousSegment = segments[segments.length - 1]
    const previousDay = previousSegment?.days[previousSegment.days.length - 1]
    const previousDayIndex = previousDay ? WEEKDAY_KEYS.indexOf(previousDay) : -1
    const currentDayIndex = WEEKDAY_KEYS.indexOf(day)

    if (
      previousSegment
      && previousSegment.slotLabel === slotLabel
      && previousDayIndex === currentDayIndex - 1
      && getSlotSignature(weeklyAvailability[previousDay].slots) === slotSignature
    ) {
      previousSegment.days.push(day)
      continue
    }

    segments.push({
      days: [day],
      slotLabel
    })
  }

  return segments
    .map(segment => `${formatShortDayRange(segment.days)} ${segment.slotLabel}`)
    .join(', ')
}

export function normalizeTeamMemberInput(member: TeamMemberInput): TeamMemberWrite {
  const weeklyAvailability = normalizeWeeklyAvailability(member.weekly_availability)

  return {
    full_name: member.full_name.trim(),
    email: member.email.trim().toLowerCase(),
    phone: member.phone?.trim() || null,
    state: normalizeTeamMemberState(member.state),
    position: member.position,
    position_other: member.position === 'other'
      ? member.position_other?.trim() || null
      : null,
    weekly_availability: weeklyAvailability,
    holiday_hours: normalizeHolidayHours(member.holiday_hours),
    shift_availability: deriveLegacyShiftAvailability(weeklyAvailability)
  }
}

export async function getTeamMembers(lawyerId: string): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('lawyer_id', lawyerId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to fetch team members')
  return (data ?? []).map(member => normalizeTeamMemberRecord(member as TeamMemberRow))
}

export async function addTeamMember(member: TeamMemberInsert): Promise<TeamMemberRow> {
  const { data, error } = await supabase
    .from('team_members')
    .insert(member)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to add team member')
  return normalizeTeamMemberRecord(data as TeamMemberRow)
}

export async function updateTeamMember(id: string, updates: TeamMemberUpdate): Promise<TeamMemberRow> {
  const { data, error } = await supabase
    .from('team_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to update team member')
  return normalizeTeamMemberRecord(data as TeamMemberRow)
}

export async function deleteTeamMember(id: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Failed to delete team member')
}
