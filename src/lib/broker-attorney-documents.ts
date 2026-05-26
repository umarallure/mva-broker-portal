import { supabase } from './supabase'
import { US_STATES } from './us-states'

export type BrokerAttorneyRetainerDocument = {
  id: string
  broker_id: string
  broker_attorney_id: string
  state: string
  document_path: string
  document_name: string
  document_mime_type: string
  document_size_bytes: number
  notes: string | null
  created_at: string
  updated_at: string
}

export const BROKER_RETAINER_DOCUMENT_BUCKET = 'retainer-contract-documents'
export const BROKER_RETAINER_DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const BROKER_RETAINER_DOCUMENT_ACCEPT = '.pdf,.doc,.docx'

export const BROKER_RETAINER_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}

export const BROKER_RETAINER_DOCUMENT_STATE_OPTIONS = US_STATES.map(state => ({
  label: `${state.name} (${state.code})`,
  value: state.code
}))

export function getBrokerRetainerDocumentStateName(stateCode: string) {
  return US_STATES.find(state => state.code === stateCode)?.name ?? stateCode
}

export function normalizeBrokerRetainerDocumentMimeType(file: File) {
  const type = file.type || ''
  if (BROKER_RETAINER_DOCUMENT_ALLOWED_MIME_TYPES.includes(type as typeof BROKER_RETAINER_DOCUMENT_ALLOWED_MIME_TYPES[number])) {
    return type
  }

  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.doc')) return 'application/msword'
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return type
}

export function validateBrokerRetainerDocument(file: File) {
  const mimeType = normalizeBrokerRetainerDocumentMimeType(file)

  if (!BROKER_RETAINER_DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType as typeof BROKER_RETAINER_DOCUMENT_ALLOWED_MIME_TYPES[number])) {
    return 'Upload a PDF, DOC, or DOCX document.'
  }

  if (file.size > BROKER_RETAINER_DOCUMENT_MAX_SIZE_BYTES) {
    return 'Document must be 10MB or smaller.'
  }

  return null
}

export function formatBrokerRetainerDocumentFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getBrokerRetainerDocumentKind(mimeType: string, fileName: string) {
  const extension = EXTENSION_BY_MIME[mimeType]
  if (extension) return extension
  const match = fileName.match(/\.([a-z0-9]+)$/i)
  return match?.[1]?.toLowerCase() ?? 'file'
}

export function buildBrokerRetainerDocumentPath(
  brokerId: string,
  brokerAttorneyId: string,
  state: string,
  fileName: string
) {
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${brokerId}/${brokerAttorneyId}/${state}/${timestamp}-${sanitizedFileName}`
}

export async function uploadBrokerRetainerDocument(input: {
  brokerId: string
  brokerAttorneyId: string
  state: string
  file: File
  notes?: string | null
}): Promise<BrokerAttorneyRetainerDocument> {
  const validationError = validateBrokerRetainerDocument(input.file)
  if (validationError) throw new Error(validationError)

  const path = buildBrokerRetainerDocumentPath(
    input.brokerId,
    input.brokerAttorneyId,
    input.state,
    input.file.name
  )
  const mimeType = normalizeBrokerRetainerDocumentMimeType(input.file)
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'pdf'
  const normalizedName = input.file.name.trim() || `retainer-contract-document.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BROKER_RETAINER_DOCUMENT_BUCKET)
    .upload(path, input.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType
    })

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload document')
  }

  const { data, error } = await supabase
    .from('broker_attorney_retainer_documents')
    .insert({
      broker_id: input.brokerId,
      broker_attorney_id: input.brokerAttorneyId,
      state: input.state,
      document_path: path,
      document_name: normalizedName,
      document_mime_type: mimeType,
      document_size_bytes: input.file.size,
      notes: input.notes || null
    })
    .select()
    .single()

  if (error) {
    await supabase.storage
      .from(BROKER_RETAINER_DOCUMENT_BUCKET)
      .remove([path])
    throw new Error(error.message || 'Failed to save document record')
  }

  return data as BrokerAttorneyRetainerDocument
}

export async function listBrokerRetainerDocuments(
  brokerAttorneyId: string
): Promise<BrokerAttorneyRetainerDocument[]> {
  const { data, error } = await supabase
    .from('broker_attorney_retainer_documents')
    .select('*')
    .eq('broker_attorney_id', brokerAttorneyId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load documents')
  return (data ?? []) as BrokerAttorneyRetainerDocument[]
}

export async function deleteBrokerRetainerDocument(documentId: string): Promise<void> {
  const { data: existingDoc, error: fetchError } = await supabase
    .from('broker_attorney_retainer_documents')
    .select('document_path')
    .eq('id', documentId)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message || 'Failed to fetch document')

  if (existingDoc?.document_path) {
    await supabase.storage
      .from(BROKER_RETAINER_DOCUMENT_BUCKET)
      .remove([existingDoc.document_path])
  }

  const { error } = await supabase
    .from('broker_attorney_retainer_documents')
    .delete()
    .eq('id', documentId)

  if (error) throw new Error(error.message || 'Failed to delete document')
}

export async function updateBrokerRetainerDocumentNotes(
  documentId: string,
  notes: string
): Promise<BrokerAttorneyRetainerDocument> {
  const { data, error } = await supabase
    .from('broker_attorney_retainer_documents')
    .update({ notes })
    .eq('id', documentId)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to update notes')
  return data as BrokerAttorneyRetainerDocument
}

export async function getBrokerRetainerDocumentSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(BROKER_RETAINER_DOCUMENT_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw new Error(error.message || 'Failed to open document')
  return data.signedUrl
}
