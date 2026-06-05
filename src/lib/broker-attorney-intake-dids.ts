import type { BrokerAttorneyIntakeDid } from './broker-attorneys'
import { US_STATES } from './us-states'

export type { BrokerAttorneyIntakeDid } from './broker-attorneys'

export const BROKER_ATTORNEY_INTAKE_ALL_STATES_VALUE = 'ALL'
export const BROKER_ATTORNEY_INTAKE_STATE_OPTIONS = [
  {
    label: 'All States',
    value: BROKER_ATTORNEY_INTAKE_ALL_STATES_VALUE
  },
  ...US_STATES.map(state => ({
    label: `${state.name} (${state.code})`,
    value: state.code
  }))
]

export function getBrokerAttorneyIntakeStateName(stateCode: string) {
  if (stateCode === BROKER_ATTORNEY_INTAKE_ALL_STATES_VALUE) return 'All States'
  return US_STATES.find(state => state.code === stateCode)?.name ?? stateCode
}

export function normalizeBrokerAttorneyIntakeDids(value: unknown): BrokerAttorneyIntakeDid[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []

    const record = entry as Record<string, unknown>
    const state = String(record.state || '').trim().toUpperCase()
    const didNumber = String(record.did_number || '').trim()
    const contactName = String(record.contact_name || '').trim()
    const availabilityNotes = String(record.availability_notes || '').trim()

    if (!state || !didNumber || !contactName || !availabilityNotes) return []

    return [{
      state,
      did_number: didNumber,
      contact_name: contactName,
      availability_notes: availabilityNotes
    }]
  })
}

export function addBrokerAttorneyIntakeDid(
  entries: BrokerAttorneyIntakeDid[],
  input: {
    state: string
    didNumber: string
    contactName: string
    availabilityNotes: string
  }
) {
  const state = input.state.trim().toUpperCase()
  const didNumber = input.didNumber.trim()
  const contactName = input.contactName.trim()
  const availabilityNotes = input.availabilityNotes.trim()

  if (!state) throw new Error('State is required')
  if (!didNumber) throw new Error('DID number is required')
  if (!contactName) throw new Error('Contact name is required')
  if (!availabilityNotes) throw new Error('Availability is required')
  if (entries.some(entry => entry.state === state)) throw new Error('An intake DID already exists for this state')

  return [
    ...entries,
    {
      state,
      did_number: didNumber,
      contact_name: contactName,
      availability_notes: availabilityNotes
    }
  ].sort((a, b) => a.state.localeCompare(b.state))
}
