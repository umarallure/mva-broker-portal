import { supabase } from './supabase'

// Pricing Tier Constants
export const PRICING_TIERS = {
  TIER_1: {
    key: 'tier_1',
    name: 'Tier 1',
    price: 2500,
    description: '18-24 Months Ago',
    color: 'red',
    colorClass: 'text-red-400 bg-red-500/10 border-red-500/20'
  },
  TIER_2: {
    key: 'tier_2',
    name: 'Tier 2',
    price: 3500,
    description: '12-18 Months Ago',
    color: 'amber',
    colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  },
  TIER_3: {
    key: 'tier_3',
    name: 'Tier 3',
    price: 6500,
    description: '6-12 Months Ago',
    color: 'emerald',
    colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  },
  TIER_4: {
    key: 'tier_4',
    name: 'Tier 4',
    price: 6000,
    description: '0-6 Months Ago',
    color: 'green',
    colorClass: 'text-green-400 bg-green-500/10 border-green-500/20'
  }
} as const

export type PricingTierKey = typeof PRICING_TIERS[keyof typeof PRICING_TIERS]['key']

export const PRICING_TIER_OPTIONS = Object.values(PRICING_TIERS).map(tier => ({
  label: `${tier.name} - $${tier.price.toLocaleString()}`,
  value: tier.key
}))

export const RETAINER_CONTRACT_DOCUMENT_BUCKET = 'retainer-contract-documents'
export const RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const RETAINER_CONTRACT_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const
export const RETAINER_CONTRACT_DOCUMENT_ACCEPT = '.pdf,.doc,.docx'

export interface AttorneyProfileData {
  // Tab 1: General Information
  profile_photo_url?: string | null
  full_name: string
  firm_name: string
  bar_association_number: string
  professional_bio?: string | null
  years_experience?: number | null
  languages_spoken: string[]
  primary_email: string
  direct_phone: string
  office_address: string
  website_url?: string | null
  preferred_contact_method?: 'email' | 'phone' | 'text' | null
  assistant_name?: string | null
  assistant_email?: string | null
  blocked_states?: string[] | null
  
  // Tab 2: Expertise & Jurisdiction
  licensed_states: string[]
  primary_city: string
  counties_covered?: string[]
  federal_court_admissions?: string | null
  primary_practice_focus: string
  injury_categories: string[]
  exclusionary_criteria?: string[]
  minimum_case_value?: number | null
  
  // Tab 3: Capacity & Performance
  availability_status?: 'accepting' | 'at_capacity' | 'on_leave' | null
  firm_size?: 'solo' | 'small' | 'medium' | 'large' | null
  case_management_software?: string | null
  insurance_carriers_handled?: string[]
  litigation_style?: number | null
  largest_settlement_amount?: number | null
  avg_time_to_close?: string | null

  case_rate_per_deal?: number | null
  upfront_payment_percentage?: number | null
  payment_window_days?: number | null
  pricing_tier?: PricingTierKey | null

  retainer_contract_document_path?: string | null
  retainer_contract_document_name?: string | null
  retainer_contract_document_mime_type?: string | null
  retainer_contract_document_size_bytes?: number | null
  retainer_contract_document_uploaded_at?: string | null
}

const RETAINER_CONTRACT_DOCUMENT_EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}

const normalizeRetainerContractDocumentMimeType = (file: File) => {
  if (RETAINER_CONTRACT_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type as typeof RETAINER_CONTRACT_DOCUMENT_ALLOWED_MIME_TYPES[number])) {
    return file.type
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return file.type
  }
}

export const buildRetainerContractDocumentPath = (userId: string) => {
  return `${userId}/retainer-contract-document`
}

export const validateRetainerContractDocument = (file: File) => {
  const normalizedMimeType = normalizeRetainerContractDocumentMimeType(file)
  if (!RETAINER_CONTRACT_DOCUMENT_ALLOWED_MIME_TYPES.includes(normalizedMimeType as typeof RETAINER_CONTRACT_DOCUMENT_ALLOWED_MIME_TYPES[number])) {
    return 'Upload a PDF, DOC, or DOCX file.'
  }

  if (file.size > RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES) {
    return `Upload a document smaller than ${Math.round(RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB.`
  }

  return null
}

export const formatDocumentFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return 'Unknown size'

  if (bytes < 1024) return `${bytes} B`

  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`

  const mb = kb / 1024
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

export const getRetainerContractDocumentKind = (mimeType?: string | null, fileName?: string | null) => {
  const normalizedMimeType = (mimeType ?? '').toLowerCase()
  const normalizedFileName = (fileName ?? '').toLowerCase()

  if (normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf')) {
    return 'pdf'
  }

  if (
    normalizedMimeType === 'application/msword'
    || normalizedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || normalizedFileName.endsWith('.doc')
    || normalizedFileName.endsWith('.docx')
  ) {
    return 'word'
  }

  return 'document'
}

export async function uploadRetainerContractDocument(userId: string, file: File) {
  const validationError = validateRetainerContractDocument(file)
  if (validationError) {
    throw new Error(validationError)
  }

  const path = buildRetainerContractDocumentPath(userId)
  const mimeType = normalizeRetainerContractDocumentMimeType(file)

  const { error } = await supabase.storage
    .from(RETAINER_CONTRACT_DOCUMENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: mimeType
    })

  if (error) {
    throw new Error(error.message || 'Failed to upload retainer contract document')
  }

  const extension = RETAINER_CONTRACT_DOCUMENT_EXTENSION_BY_MIME[mimeType]
  const normalizedName = file.name.trim() || `retainer-contract-document.${extension ?? 'pdf'}`

  return {
    path,
    name: normalizedName,
    mimeType,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString()
  }
}

export async function deleteRetainerContractDocument(path: string) {
  const { error } = await supabase.storage
    .from(RETAINER_CONTRACT_DOCUMENT_BUCKET)
    .remove([path])

  if (error) {
    throw new Error(error.message || 'Failed to delete retainer contract document')
  }
}

export async function getRetainerContractDocumentSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(RETAINER_CONTRACT_DOCUMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) {
    throw new Error(error.message || 'Failed to open retainer contract document')
  }

  return data.signedUrl
}

/**
 * Save or update attorney profile using Supabase client
 */
export async function saveAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .upsert({
      user_id: userId,
      ...data
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to save attorney profile')
  }

  return profile
}

/**
 * Partially update attorney profile without touching other columns.
 * This is important for per-tab saves so we don't overwrite other tab fields.
 */
export async function patchAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update(data)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update attorney profile')
  }

  return profile
}

/**
 * Get attorney profile for current user
 */
export async function getAttorneyProfile(userId: string) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to fetch attorney profile')
  }

  return profile
}

/**
 * Update only availability status (quick toggle)
 */
export async function updateAvailabilityStatus(
  userId: string,
  status: 'accepting' | 'at_capacity' | 'on_leave'
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update({ availability_status: status })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update availability status')
  }

  return profile
}

export async function getAttorneyNameMapByUserIds(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map(v => String(v)).filter(Boolean)))
  if (!ids.length) return {} as Record<string, string>

  const { data: profiles, error: profileErr } = await supabase
    .from('attorney_profiles')
    .select('user_id,full_name')
    .in('user_id', ids)

  if (profileErr) {
    throw new Error(profileErr.message || 'Failed to fetch attorney profiles')
  }

  const profileNameById: Record<string, string> = {}
  const profileNameRawById: Record<string, string | null> = {}
  for (const p of (profiles ?? []) as Array<{ user_id: string; full_name: string | null }>) {
    profileNameRawById[p.user_id] = p.full_name
    const name = (p.full_name ?? '').trim()
    if (name) profileNameById[p.user_id] = name
  }

  const missingIds = ids.filter((id) => {
    const raw = profileNameRawById[id]
    return !raw || !raw.trim()
  })

  if (!missingIds.length) return profileNameById

  const { data: users, error: userErr } = await supabase
    .from('app_users')
    .select('user_id,display_name')
    .in('user_id', missingIds)

  if (userErr) {
    throw new Error(userErr.message || 'Failed to fetch app user display names')
  }

  for (const u of (users ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    const name = (u.display_name ?? '').trim()
    if (name) profileNameById[u.user_id] = name
  }

  return profileNameById
}
