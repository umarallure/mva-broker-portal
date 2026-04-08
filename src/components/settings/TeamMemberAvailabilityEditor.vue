<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  WEEKDAY_KEYS,
  WEEKDAY_OPTIONS,
  createAvailabilitySlot,
  createDefaultWeeklyAvailability,
  createHolidayHoursEntry,
  formatAvailabilitySlot,
  formatWeeklyAvailabilitySummary,
  getHolidayHoursValidationMessage,
  isHolidayHoursEntryPersisted,
  type AvailabilityTimeSlot,
  type ReadonlyTeamMemberHolidayHours,
  type TeamMemberHolidayHours,
  type TeamMemberWeeklyAvailability,
  type TeamMemberWeekday
} from '../../lib/team-members'

const props = withDefaults(defineProps<{
  weeklyAvailability: TeamMemberWeeklyAvailability
  holidayHours: TeamMemberHolidayHours
  persistedHolidayHours?: ReadonlyTeamMemberHolidayHours
  showHolidayHours?: boolean
}>(), {
  showHolidayHours: true
})

const weeklyEditorOpen = ref(false)
const weeklySummary = computed(() => formatWeeklyAvailabilitySummary(props.weeklyAvailability))
const showHolidayHours = computed(() => props.showHolidayHours)

type PickerCapableInput = HTMLInputElement & {
  showPicker?: () => void
}

const resolvePickerInput = (source: EventTarget | null) => {
  if (source instanceof HTMLInputElement) {
    return source as PickerCapableInput
  }

  if (!(source instanceof HTMLElement)) {
    return null
  }

  const nestedInput = source.querySelector('input')
  return nestedInput instanceof HTMLInputElement
    ? (nestedInput as PickerCapableInput)
    : null
}

const openNativePicker = (event: Event) => {
  const input = resolvePickerInput(event.currentTarget) ?? resolvePickerInput(event.target)
  if (!input) return

  input.focus()

  try {
    input.showPicker?.()
  } catch {
    input.click()
  }
}

const replaceWeeklyAvailability = (nextAvailability: TeamMemberWeeklyAvailability) => {
  for (const day of WEEKDAY_KEYS) {
    props.weeklyAvailability[day].enabled = nextAvailability[day].enabled
    props.weeklyAvailability[day].slots = nextAvailability[day].slots.map(slot => ({
      start: slot.start,
      end: slot.end
    }))
  }
}

const resetWeeklyAvailability = () => {
  replaceWeeklyAvailability(createDefaultWeeklyAvailability())
}

const daySummary = (day: TeamMemberWeekday) => {
  const availability = props.weeklyAvailability[day]
  if (!availability.enabled) return 'Unavailable'
  return availability.slots.map(formatAvailabilitySlot).join(', ')
}

const setDayEnabled = (day: TeamMemberWeekday, value: boolean) => {
  const nextEnabled = Boolean(value)
  const availability = props.weeklyAvailability[day]

  availability.enabled = nextEnabled
  availability.slots = nextEnabled
    ? (availability.slots.length ? availability.slots : [createAvailabilitySlot()])
    : []
}

const dayRangeStart = (day: TeamMemberWeekday) => {
  return props.weeklyAvailability[day].slots[0]?.start ?? '09:00'
}

const dayRangeEnd = (day: TeamMemberWeekday) => {
  const slots = props.weeklyAvailability[day].slots
  return slots[slots.length - 1]?.end ?? '17:00'
}

const hasMultipleDaySlots = (day: TeamMemberWeekday) => {
  return props.weeklyAvailability[day].slots.length > 1
}

const updateDayRange = (day: TeamMemberWeekday, field: keyof AvailabilityTimeSlot, value: string) => {
  const availability = props.weeklyAvailability[day]
  const nextValue = typeof value === 'string' ? value : ''
  const nextStart = field === 'start' ? nextValue : dayRangeStart(day)
  const nextEnd = field === 'end' ? nextValue : dayRangeEnd(day)

  availability.enabled = true
  availability.slots = [{ start: nextStart, end: nextEnd }]
}

const addHolidayOverride = () => {
  props.holidayHours.push(createHolidayHoursEntry())
}

const removeHolidayOverride = (index: number) => {
  props.holidayHours.splice(index, 1)
}

const createEmptyHolidaySlot = (): AvailabilityTimeSlot => ({
  start: '',
  end: ''
})

const holidayTimeValue = (index: number, field: keyof AvailabilityTimeSlot) => {
  return props.holidayHours[index]?.slots[0]?.[field] ?? ''
}

const updateHolidayDate = (index: number, value: string) => {
  const holiday = props.holidayHours[index]
  if (!holiday) return

  holiday.date = typeof value === 'string' ? value : ''
}

const updateHolidayTime = (index: number, field: keyof AvailabilityTimeSlot, value: string) => {
  const holiday = props.holidayHours[index]
  if (!holiday) return

  const nextValue = typeof value === 'string' ? value : ''
  const nextSlot = holiday.slots[0]
    ? { ...holiday.slots[0] }
    : createEmptyHolidaySlot()

  nextSlot[field] = nextValue

  if (!nextSlot.start && !nextSlot.end) {
    holiday.is_closed = true
    holiday.slots = []
    return
  }

  holiday.is_closed = false
  holiday.slots = [nextSlot]
}

const isHolidayPersisted = (index: number) => {
  const holiday = props.holidayHours[index]
  if (!holiday?.date) return false

  return isHolidayHoursEntryPersisted(holiday, props.persistedHolidayHours ?? [])
}

const holidayValidationMessage = (index: number) => {
  return getHolidayHoursValidationMessage(props.holidayHours[index], {
    index,
    allEntries: props.holidayHours,
    persistedEntries: props.persistedHolidayHours ?? []
  })
}

const holidayStatusLabel = (index: number) => {
  return isHolidayPersisted(index) ? 'Saved' : 'Draft'
}

const holidayStatusClass = (index: number) => {
  if (isHolidayPersisted(index) && !holidayValidationMessage(index)) {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
  }

  return 'border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]'
}
</script>

<template>
  <div
    class="grid grid-cols-1 items-start gap-4"
    :class="showHolidayHours ? 'xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]' : ''"
  >
    <div class="rounded-xl border border-[var(--ap-accent)]/15 bg-black/[0.02] p-4 dark:bg-white/[0.03]">
      <div class="flex flex-col gap-4">
        <div class="space-y-1.5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ap-accent)]">
            Weekly Availability
          </p>
          <p class="text-sm text-muted">
            Set as Monday to Friday, 9:00 AM to 5:00 PM by default.
          </p>
        </div>

        <button
          type="button"
          class="group w-full min-h-[88px] rounded-xl border border-[var(--ap-accent)]/18 bg-white/80 p-4 text-left transition-colors duration-200 hover:border-[var(--ap-accent)]/35 hover:bg-[var(--ap-accent)]/[0.05] dark:bg-[#101010]/45"
          @click="weeklyEditorOpen = true"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted">
                {{ weeklySummary }}
              </p>
              <p class="mt-1 text-[11px] text-muted">
                Click to adjust the days of the week and hourly coverage.
              </p>
            </div>
            <div class="flex h-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)] px-3 text-sm font-medium text-white transition duration-200 group-hover:brightness-90">
              Edit
            </div>
          </div>
        </button>
      </div>
    </div>

    <div
      v-if="showHolidayHours"
      class="rounded-xl border border-[var(--ap-accent)]/15 bg-black/[0.02] p-4 dark:bg-white/[0.03]"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1.5">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ap-accent)]">
            Holiday Hours
          </p>
          <p class="text-sm text-muted">
            Add date-specific overrides for holidays, office closures, or special coverage windows.
          </p>
        </div>
        <UButton
          type="button"
          label="Add Holiday"
          icon="i-lucide-calendar-plus"
          size="sm"
          class="group shrink-0 rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/85 hover:text-black"
          :ui="{ leadingIcon: 'text-white transition duration-200 group-hover:text-black' }"
          @click="addHolidayOverride"
        />
      </div>

      <div v-if="holidayHours.length === 0" class="mt-4 flex min-h-[88px] items-center rounded-xl border border-dashed border-[var(--ap-accent)]/20 px-4 py-4">
        <p class="text-sm text-muted">
          No holiday-specific overrides yet. Weekly availability will be used unless you add one here.
        </p>
      </div>

      <div v-else class="mt-4 space-y-3">
        <div
          v-for="(holiday, index) in holidayHours"
          :key="`${holiday.date || 'holiday'}-${index}`"
          class="flex min-h-[88px] flex-col justify-center rounded-xl border bg-white/80 p-4 dark:bg-[#101010]/40"
          :class="holidayValidationMessage(index) ? 'border-red-400/20' : 'border-[var(--ap-accent)]/10'"
        >
          <div class="flex flex-wrap items-center gap-3 xl:flex-nowrap">
            <span class="shrink-0 text-[11px] font-medium text-highlighted">
              On
            </span>
            <div class="w-full sm:w-[172px] xl:w-[168px]">
              <UInput
                :id="`holiday-date-${index}`"
                :model-value="holiday.date"
                type="date"
                size="sm"
                class="w-full"
                aria-label="Holiday date"
                @click="openNativePicker"
                @update:model-value="(value: string | number) => updateHolidayDate(index, typeof value === 'string' ? value : '')"
              />
            </div>
            <span class="shrink-0 text-[11px] font-medium text-highlighted">
              From
            </span>
            <div class="w-full sm:w-[116px] xl:w-[112px]">
              <UInput
                :id="`holiday-start-${index}`"
                :model-value="holidayTimeValue(index, 'start')"
                type="time"
                step="60"
                size="sm"
                class="w-full"
                aria-label="Holiday start time"
                @click="openNativePicker"
                @update:model-value="(value: string | number) => updateHolidayTime(index, 'start', typeof value === 'string' ? value : '')"
              />
            </div>
            <span class="shrink-0 text-[11px] font-medium text-highlighted">
              To
            </span>
            <div class="w-full sm:w-[116px] xl:w-[112px]">
              <UInput
                :id="`holiday-end-${index}`"
                :model-value="holidayTimeValue(index, 'end')"
                type="time"
                step="60"
                size="sm"
                class="w-full"
                aria-label="Holiday end time"
                @click="openNativePicker"
                @update:model-value="(value: string | number) => updateHolidayTime(index, 'end', typeof value === 'string' ? value : '')"
              />
            </div>
            <div class="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
              <span
                class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                :class="holidayStatusClass(index)"
              >
                {{ holidayStatusLabel(index) }}
              </span>
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="sm"
                class="rounded-lg text-red-400 hover:text-red-300"
                @click="removeHolidayOverride(index)"
              />
            </div>
          </div>
          <p v-if="holidayValidationMessage(index)" class="mt-2 text-[11px] text-red-400/90">
            {{ holidayValidationMessage(index) }}
          </p>
        </div>
      </div>
    </div>
  </div>

  <UModal
    :open="weeklyEditorOpen"
    title="Adjust Weekly Availability"
    :dismissible="true"
    :ui="{ content: 'sm:max-w-4xl' }"
    @update:open="(value: boolean) => { weeklyEditorOpen = value }"
  >
    <template #body>
      <div class="max-h-[75vh] overflow-y-auto p-1">
        <div class="flex flex-col gap-3 border-b border-black/[0.06] pb-3 dark:border-white/[0.06] sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-1">
            <p class="text-sm font-medium text-highlighted">
              Set weekly availability by day.
            </p>
            <p class="text-[11px] text-muted">
              Enable the days this team member works, then choose a start and end time for each available day.
            </p>
          </div>
          <UButton
            type="button"
            label="Reset to 9-5"
            variant="ghost"
            size="xs"
            class="rounded-lg text-[var(--ap-accent)]"
            @click="resetWeeklyAvailability"
          />
        </div>

        <div class="mt-4 overflow-hidden rounded-2xl border border-[var(--ap-accent)]/12 bg-white/80 dark:bg-[#101010]/45">
          <div
            v-for="day in WEEKDAY_OPTIONS"
            :key="day.value"
            class="border-b border-[var(--ap-accent)]/10 px-4 py-4 last:border-b-0"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div class="min-w-0 lg:w-[150px]">
                <p class="text-sm font-medium text-highlighted">
                  {{ day.label }}
                </p>
                <p class="mt-1 text-[11px] text-muted">
                  {{ daySummary(day.value) }}
                </p>
              </div>

              <div class="flex flex-1 flex-col gap-2 lg:min-w-0">
                <div
                  v-if="weeklyAvailability[day.value].enabled"
                  class="flex flex-wrap items-center gap-2"
                >
                  <span class="shrink-0 text-[11px] font-medium text-highlighted">
                    From
                  </span>
                  <div class="w-full sm:w-[136px]">
                    <UInput
                      :model-value="dayRangeStart(day.value)"
                      type="time"
                      step="60"
                      size="sm"
                      class="w-full"
                      aria-label="Weekly availability start time"
                      @click="openNativePicker"
                      @update:model-value="(value: string | number) => updateDayRange(day.value, 'start', typeof value === 'string' ? value : '')"
                    />
                  </div>
                  <span class="shrink-0 text-[11px] font-medium text-highlighted">
                    To
                  </span>
                  <div class="w-full sm:w-[136px]">
                    <UInput
                      :model-value="dayRangeEnd(day.value)"
                      type="time"
                      step="60"
                      size="sm"
                      class="w-full"
                      aria-label="Weekly availability end time"
                      @click="openNativePicker"
                      @update:model-value="(value: string | number) => updateDayRange(day.value, 'end', typeof value === 'string' ? value : '')"
                    />
                  </div>
                </div>
                <p v-else class="text-[11px] text-muted">
                  Not available on this day.
                </p>
                <p v-if="hasMultipleDaySlots(day.value)" class="text-[11px] text-muted">
                  Editing this day will simplify multiple time blocks into one continuous range.
                </p>
              </div>

              <UCheckbox
                :model-value="weeklyAvailability[day.value].enabled"
                :label="weeklyAvailability[day.value].enabled ? 'Available' : 'Off'"
                class="shrink-0"
                @update:model-value="(value: boolean | 'indeterminate') => setDayEnabled(day.value, value === true)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
