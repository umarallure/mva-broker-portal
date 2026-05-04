import { supabase } from './supabase'

export interface BrokerProfileData {
  user_id?: string
  full_name?: string | null
  company_name?: string | null
  bio?: string | null
  years_in_business?: number | null
  languages?: string[] | null
  primary_email?: string | null
  personal_email?: string | null
  direct_phone?: string | null
  office_address?: string | null
  website_url?: string | null
  preferred_contact?: 'email' | 'phone' | 'text' | null
  assistant_name?: string | null
  assistant_email?: string | null
  created_at?: string
  updated_at?: string
}

export const getBrokerProfile = async (userId: string): Promise<BrokerProfileData | null> => {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as BrokerProfileData | null) ?? null
}

export const saveBrokerProfile = async (
  userId: string,
  data: Partial<BrokerProfileData>
): Promise<BrokerProfileData> => {
  const payload = { ...data, user_id: userId }
  const { data: row, error } = await supabase
    .from('broker_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw error
  return row as BrokerProfileData
}

export const patchBrokerProfile = async (
  userId: string,
  data: Partial<BrokerProfileData>
): Promise<BrokerProfileData> => {
  const { data: row, error } = await supabase
    .from('broker_profiles')
    .update(data)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) throw error
  return row as BrokerProfileData
}
