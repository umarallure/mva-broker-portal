import { supabase } from './supabase'

export type TransferStandardType = 'sol' | 'injury_type'
export type TransferSolOption = '6_12_months' | '12_plus_months'
export type CoverageSolCriteria = '6_12_months' | '12_plus_months'
export type CoverageCaseCategory = 'Consumer Cases' | 'Consumer and Commercial Cases'
export type CoverageLiabilityStatus = 'clear_only' | 'disputed_ok'
export type CoverageInsuranceStatus = 'insured_only' | 'uninsured_ok'
export type CoverageMedicalTreatment = 'no_medical' | 'ongoing' | 'proof_of_medical_treatment'
export type PreferredContact = 'email' | 'phone' | 'text'

export type BrokerAttorneyIntakeDid = {
  state: string
  did_number: string
  contact_name: string
  availability_notes: string
}

export type BrokerAttorneyRow = {
  id: string
  broker_id: string
  attorney_name: string
  firm_name: string | null
  bio: string | null
  years_experience: number | null
  languages: string[]
  primary_email: string | null
  personal_email: string | null
  direct_phone: string | null
  office_address: string | null
  website_url: string | null
  preferred_contact: PreferredContact | null
  assistant_name: string | null
  assistant_email: string | null
  intake_dids: BrokerAttorneyIntakeDid[]
  transfer_standard_types: TransferStandardType[]
  transfer_sol_option: TransferSolOption | null
  transfer_injury_types: string[]
  transfer_injury_other: string | null
  coverage_states: string[]
  coverage_case_category: CoverageCaseCategory
  coverage_sol_criteria: CoverageSolCriteria
  coverage_liability_status: CoverageLiabilityStatus
  coverage_insurance_status: CoverageInsuranceStatus
  coverage_medical_treatment: CoverageMedicalTreatment
  coverage_languages: string[]
  coverage_no_prior_attorney: boolean
  coverage_notes: string | null
  created_at: string
  updated_at: string
}

export type BrokerAttorneyInput = Partial<Omit<
  BrokerAttorneyRow,
  'id' | 'broker_id' | 'created_at' | 'updated_at'
>> & {
  attorney_name?: string
}

export const BROKER_ATTORNEY_COLUMNS = [
  'id',
  'broker_id',
  'attorney_name',
  'firm_name',
  'bio',
  'years_experience',
  'languages',
  'primary_email',
  'personal_email',
  'direct_phone',
  'office_address',
  'website_url',
  'preferred_contact',
  'assistant_name',
  'assistant_email',
  'intake_dids',
  'transfer_standard_types',
  'transfer_sol_option',
  'transfer_injury_types',
  'transfer_injury_other',
  'coverage_states',
  'coverage_case_category',
  'coverage_sol_criteria',
  'coverage_liability_status',
  'coverage_insurance_status',
  'coverage_medical_treatment',
  'coverage_languages',
  'coverage_no_prior_attorney',
  'coverage_notes',
  'created_at',
  'updated_at'
].join(',')

export const LANGUAGE_OPTIONS = ['English', 'Spanish']

export const CONTACT_METHOD_OPTIONS = [
  { label: 'Email', value: 'email' },
  { label: 'Phone Call', value: 'phone' },
  { label: 'Text Message', value: 'text' }
]

export const TRANSFER_STANDARD_OPTIONS = [
  { label: 'SOL', value: 'sol' },
  { label: 'Types of Injury', value: 'injury_type' }
]

export const TRANSFER_SOL_OPTIONS = [
  { label: '6-12 months', value: '6_12_months' },
  { label: '12+ months', value: '12_plus_months' }
]

export const INJURY_TYPE_OPTIONS = [
  'Consumer Cases',
  'Consumer and Commercial Cases'
]

export const COVERAGE_SOL_OPTIONS = [
  { label: '6-12 months', value: '6_12_months' },
  { label: '12+ months', value: '12_plus_months' }
]

export const COVERAGE_CASE_CATEGORY_OPTIONS = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Consumer and Commercial Cases', value: 'Consumer and Commercial Cases' }
]

export const LIABILITY_OPTIONS = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

export const INSURANCE_OPTIONS = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

export const MEDICAL_TREATMENT_OPTIONS = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing treatment', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

export const defaultBrokerAttorneyInput = (): Required<Pick<
  BrokerAttorneyInput,
  | 'languages'
  | 'transfer_standard_types'
  | 'transfer_injury_types'
  | 'coverage_states'
  | 'coverage_case_category'
  | 'coverage_sol_criteria'
  | 'coverage_liability_status'
  | 'coverage_insurance_status'
  | 'coverage_medical_treatment'
  | 'coverage_languages'
  | 'coverage_no_prior_attorney'
>> => ({
  languages: ['English'],
  transfer_standard_types: [],
  transfer_injury_types: [],
  coverage_states: [],
  coverage_case_category: 'Consumer Cases',
  coverage_sol_criteria: '6_12_months',
  coverage_liability_status: 'clear_only',
  coverage_insurance_status: 'insured_only',
  coverage_medical_treatment: 'ongoing',
  coverage_languages: ['English'],
  coverage_no_prior_attorney: true
})

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
}

const buildPayload = (input: BrokerAttorneyInput) => {
  const payload: Record<string, unknown> = {}

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined) return
    payload[key] = value
  })

  if (payload.attorney_name !== undefined) {
    payload.attorney_name = String(payload.attorney_name || '').trim()
  }

  ;[
    'languages',
    'transfer_standard_types',
    'transfer_injury_types',
    'coverage_states',
    'coverage_languages'
  ].forEach((key) => {
    if (payload[key] !== undefined) payload[key] = normalizeStringArray(payload[key])
  })

  if (payload.intake_dids !== undefined) {
    payload.intake_dids = Array.isArray(payload.intake_dids) ? payload.intake_dids : []
  }

  return payload
}

export function getBrokerAttorneyDisplayName(attorney: Pick<BrokerAttorneyRow, 'attorney_name' | 'firm_name'>) {
  return attorney.firm_name ? `${attorney.attorney_name} - ${attorney.firm_name}` : attorney.attorney_name
}

export async function listBrokerAttorneys(brokerId: string): Promise<BrokerAttorneyRow[]> {
  const { data, error } = await supabase
    .from('broker_attorneys')
    .select(BROKER_ATTORNEY_COLUMNS)
    .eq('broker_id', brokerId)
    .order('attorney_name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BrokerAttorneyRow[]
}

export async function getBrokerAttorney(attorneyId: string): Promise<BrokerAttorneyRow | null> {
  const { data, error } = await supabase
    .from('broker_attorneys')
    .select(BROKER_ATTORNEY_COLUMNS)
    .eq('id', attorneyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as BrokerAttorneyRow | null) ?? null
}

export async function createBrokerAttorney(
  brokerId: string,
  input: BrokerAttorneyInput
): Promise<BrokerAttorneyRow> {
  const defaults = defaultBrokerAttorneyInput()
  const payload = buildPayload({ ...defaults, ...input })
  const attorneyName = String(payload.attorney_name || '').trim()

  if (!attorneyName) {
    throw new Error('Attorney name is required')
  }

  const { data, error } = await supabase
    .from('broker_attorneys')
    .insert({
      ...payload,
      attorney_name: attorneyName,
      broker_id: brokerId
    })
    .select(BROKER_ATTORNEY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as BrokerAttorneyRow
}

export async function updateBrokerAttorney(
  attorneyId: string,
  input: BrokerAttorneyInput
): Promise<BrokerAttorneyRow> {
  const payload = buildPayload(input)

  if (payload.attorney_name !== undefined && !String(payload.attorney_name || '').trim()) {
    throw new Error('Attorney name is required')
  }

  const { data, error } = await supabase
    .from('broker_attorneys')
    .update({
      ...payload
    })
    .eq('id', attorneyId)
    .select(BROKER_ATTORNEY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as BrokerAttorneyRow
}

export async function deleteBrokerAttorney(attorneyId: string): Promise<void> {
  const { error } = await supabase
    .from('broker_attorneys')
    .delete()
    .eq('id', attorneyId)

  if (error) throw new Error(error.message)
}
