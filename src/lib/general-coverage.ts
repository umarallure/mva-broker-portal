import { supabase } from './supabase'

export type GeneralCoverageRow = {
  id: string
  attorney_id: string
  covered_states: string[]
  case_category: string
  injury_severity: string[]
  liability_status: string
  insurance_status: string
  medical_treatment: string
  languages: string[]
  no_prior_attorney: boolean
  created_at: string
  updated_at: string
}

export async function getGeneralCoverageForAttorney(attorneyId: string) {
  const { data, error } = await supabase
    .from('general_coverages')
    .select('*')
    .eq('attorney_id', attorneyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as GeneralCoverageRow | null
}

export async function upsertGeneralCoverage(input: {
  attorney_id: string
  covered_states: string[]
  case_category: string
  injury_severity: string[]
  liability_status: string
  insurance_status: string
  medical_treatment: string
  languages: string[]
  no_prior_attorney: boolean
}) {
  const { data, error } = await supabase
    .from('general_coverages')
    .upsert({
      attorney_id: input.attorney_id,
      covered_states: input.covered_states,
      case_category: input.case_category,
      injury_severity: input.injury_severity,
      liability_status: input.liability_status,
      insurance_status: input.insurance_status,
      medical_treatment: input.medical_treatment,
      languages: input.languages,
      no_prior_attorney: input.no_prior_attorney
    }, {
      onConflict: 'attorney_id'
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as GeneralCoverageRow
}

export async function deleteGeneralCoverage(id: string) {
  const { error } = await supabase
    .from('general_coverages')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}
