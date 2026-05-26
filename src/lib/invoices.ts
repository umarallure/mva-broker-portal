import { supabase } from './supabase'

export type InvoiceStatus = 'billable' | 'pending' | 'in_review' | 'signed_awaiting' | 'in_preview' | 'paid' | 'chargeback'

export type InvoiceItem = {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export type InvoiceType = 'lawyer' | 'publisher' | 'broker'

export type DealPaymentStatus =
  | 'attorney_payment_in_review'
  | 'paid_by_attorney'
  | 'attorney_chargeback'
  | 'publisher_payment_in_review'
  | 'publisher_chargeback'

export type InvoiceRow = {
  id: string
  invoice_number: string
  lawyer_id: string | null
  lead_vendor_id: string | null
  broker_id: string | null
  invoice_type: InvoiceType
  created_by: string
  date_range_start: string
  date_range_end: string
  deal_ids: string[]
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  status: InvoiceStatus
  notes: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export type InvoiceWithLawyer = InvoiceRow & {
  lawyer_name?: string | null
  lawyer_email?: string | null
  lawyer_firm?: string | null
}

export type InvoiceWithVendor = InvoiceRow & {
  vendor_center_name?: string | null
  vendor_lead_name?: string | null
  vendor_contact_email?: string | null
}

const INVOICE_COLUMNS = 'id,invoice_number,lawyer_id,lead_vendor_id,broker_id,invoice_type,created_by,date_range_start,date_range_end,deal_ids,items,subtotal,tax_rate,tax_amount,total_amount,status,notes,due_date,created_at,updated_at'

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .ilike('invoice_number', `INV-${year}-%`)

  if (error) throw new Error(error.message)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `INV-${year}-${seq}`
}

export async function createInvoice(input: {
  invoice_number: string
  lawyer_id?: string | null
  lead_vendor_id?: string | null
  broker_id?: string | null
  invoice_type?: InvoiceType
  created_by: string
  date_range_start: string
  date_range_end: string
  deal_ids: string[]
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  status?: InvoiceStatus
  notes?: string | null
  due_date?: string | null
}): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: input.invoice_number,
      lawyer_id: input.lawyer_id ?? null,
      lead_vendor_id: input.lead_vendor_id ?? null,
      broker_id: input.broker_id ?? null,
      invoice_type: input.invoice_type ?? 'lawyer',
      created_by: input.created_by,
      date_range_start: input.date_range_start,
      date_range_end: input.date_range_end,
      deal_ids: input.deal_ids,
      items: input.items,
      subtotal: input.subtotal,
      tax_rate: input.tax_rate,
      tax_amount: input.tax_amount,
      total_amount: input.total_amount,
      status: input.status ?? 'in_review',
      notes: input.notes ?? null,
      due_date: input.due_date ?? null
    })
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function updateInvoice(
  invoiceId: string,
  input: Partial<{
    lawyer_id: string | null
    lead_vendor_id: string | null
    broker_id: string | null
    invoice_type: InvoiceType
    date_range_start: string
    date_range_end: string
    deal_ids: string[]
    items: InvoiceItem[]
    subtotal: number
    tax_rate: number
    tax_amount: number
    total_amount: number
    status: InvoiceStatus
    notes: string | null
    due_date: string | null
  }>
): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update(input)
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as InvoiceRow) ?? null
}

export async function listInvoices(filters?: {
  lawyer_id?: string
  broker_id?: string
  status?: InvoiceStatus
  invoice_type?: InvoiceType
}): Promise<InvoiceRow[]> {
  let qb = supabase
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .order('created_at', { ascending: false })

  if (filters?.lawyer_id) {
    qb = qb.eq('lawyer_id', filters.lawyer_id)
  }

  if (filters?.broker_id) {
    qb = qb.eq('broker_id', filters.broker_id)
  }

  if (filters?.status) {
    qb = qb.eq('status', filters.status)
  }

  if (filters?.invoice_type) {
    qb = qb.eq('invoice_type', filters.invoice_type)
  }

  const { data, error } = await qb

  if (error) throw new Error(error.message)
  return (data ?? []) as InvoiceRow[]
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)

  if (error) throw new Error(error.message)
}

export async function listLawyers(): Promise<Array<{
  user_id: string
  email: string
  display_name: string | null
}>> {
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id,email,display_name')
    .eq('role', 'lawyer')
    .order('display_name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ user_id: string; email: string; display_name: string | null }>
}

export async function getLawyerProfile(lawyerId: string): Promise<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
  case_rate_per_deal: number | null
  payment_window_days: number | null
} | null> {
  const { data, error } = await supabase
    .from('attorney_profiles')
    .select('full_name,firm_name,office_address,primary_email,direct_phone,bar_association_number,case_rate_per_deal,payment_window_days')
    .eq('user_id', lawyerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

export type DealFlowRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  status: string | null
  payment_status?: DealPaymentStatus | null
  assigned_attorney_id: string | null
  agent: string | null
  carrier: string | null
  face_amount: number | null
  invoice_id: string | null
  publisher_invoice_id: string | null
  created_at: string | null
}

const DEAL_FLOW_COLUMNS = 'id,submission_id,insured_name,client_phone_number,lead_vendor,status,payment_status,assigned_attorney_id,agent,carrier,face_amount,invoice_id,publisher_invoice_id,created_at'

const QUALIFIED_PAYABLE_KEY = 'qualified_payable'
const QUALIFIED_PAYABLE_LABEL = 'Awaiting Billable'
const LEGACY_QUALIFIED_PAYABLE_LABEL = 'Qualified/Payable'

const APPROVED_PAYABLE_KEY = 'approved_payable'
const APPROVED_PAYABLE_LABEL = 'Payable to BPO'
const LEGACY_APPROVED_PAYABLE_LABEL = 'Approved – Payable'

const BILLABLE_DEAL_STATUSES = [
  QUALIFIED_PAYABLE_KEY,
  QUALIFIED_PAYABLE_LABEL,
  LEGACY_QUALIFIED_PAYABLE_LABEL,
  APPROVED_PAYABLE_KEY,
  APPROVED_PAYABLE_LABEL,
  LEGACY_APPROVED_PAYABLE_LABEL,
]

export async function listDealsForInvoice(input: {
  lawyerId: string
  dateStart: string
  dateEnd: string
  editingInvoiceId?: string | null
}): Promise<DealFlowRow[]> {
  let qb = supabase
    .from('daily_deal_flow')
    .select(DEAL_FLOW_COLUMNS)
    .eq('assigned_attorney_id', input.lawyerId)
    .gte('created_at', input.dateStart)
    .lte('created_at', input.dateEnd + 'T23:59:59.999Z')
    .order('created_at', { ascending: false })

  if (input.editingInvoiceId) {
    qb = qb.or(
      `status.in.("${QUALIFIED_PAYABLE_KEY}","${QUALIFIED_PAYABLE_LABEL}","${LEGACY_QUALIFIED_PAYABLE_LABEL}","${APPROVED_PAYABLE_KEY}","${APPROVED_PAYABLE_LABEL}","${LEGACY_APPROVED_PAYABLE_LABEL}"),invoice_id.eq.${input.editingInvoiceId}`
    )
  } else {
    qb = qb.in('status', BILLABLE_DEAL_STATUSES)
  }

  const { data, error } = await qb

  if (error) throw new Error(error.message)

  // Filter out deals already linked to a different invoice
  const rows = (data ?? []) as DealFlowRow[]
  return rows.filter(d => {
    if (!d.invoice_id) return true
    // If editing an existing invoice, keep deals that belong to it
    if (input.editingInvoiceId && d.invoice_id === input.editingInvoiceId) return true
    return false
  })
}

export async function listDealsForPublisherInvoice(input: {
  vendorLeadName: string
  dateStart?: string | null
  dateEnd?: string | null
  editingInvoiceId?: string | null
}): Promise<DealFlowRow[]> {
  let qb = supabase
    .from('daily_deal_flow')
    .select(DEAL_FLOW_COLUMNS)
    .eq('lead_vendor', input.vendorLeadName)
    .order('created_at', { ascending: false })

  if (input.editingInvoiceId) {
    qb = qb.or(
      `status.in.("${QUALIFIED_PAYABLE_KEY}","${QUALIFIED_PAYABLE_LABEL}","${LEGACY_QUALIFIED_PAYABLE_LABEL}","${APPROVED_PAYABLE_KEY}","${APPROVED_PAYABLE_LABEL}","${LEGACY_APPROVED_PAYABLE_LABEL}"),publisher_invoice_id.eq.${input.editingInvoiceId}`
    )
  } else {
    // Publisher billable deals are only those that were paid by attorney.
    qb = qb.eq('payment_status', 'paid_by_attorney')
  }

  if (input.dateStart) {
    qb = qb.gte('created_at', input.dateStart)
  }
  if (input.dateEnd) {
    qb = qb.lte('created_at', input.dateEnd + 'T23:59:59.999Z')
  }

  const { data, error } = await qb

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as DealFlowRow[]
  return rows.filter(d => {
    if (!d.publisher_invoice_id) return true
    if (input.editingInvoiceId && d.publisher_invoice_id === input.editingInvoiceId) return true
    return false
  })
}

export async function markInvoiceAsPaid(invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  const inv = data as InvoiceRow

  if (inv.deal_ids?.length) {
    // Lawyer invoice paid -> make leads billable for publisher
    if (inv.invoice_type === 'lawyer') {
      const { error: dealErr } = await supabase
        .from('daily_deal_flow')
        .update({ payment_status: 'paid_by_attorney' satisfies DealPaymentStatus })
        .in('id', inv.deal_ids)

      if (dealErr) console.error('markInvoiceAsPaid: failed to update deal payment_status', dealErr.message)
    }

    // Publisher invoice paid -> final settlement
    if (inv.invoice_type === 'publisher') {
      const { error: dealErr } = await supabase
        .from('daily_deal_flow')
        .update({
          status: 'paid_to_bpo',
        })
        .in('id', inv.deal_ids)

      if (dealErr) console.error('markInvoiceAsPaid: failed to update deal payment_status/status', dealErr.message)
    }
  }

  return inv
}

export async function requestChargeback(invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'chargeback' })
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function linkDealsToInvoice(dealIds: string[], invoiceId: string): Promise<void> {
  if (!dealIds.length) return
  const { data, error } = await supabase
    .from('daily_deal_flow')
    .update({
      invoice_id: invoiceId,
      payment_status: 'attorney_payment_in_review' satisfies DealPaymentStatus,
    })
    .in('id', dealIds)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Failed to link deals to invoice. No rows were updated — check RLS policies on daily_deal_flow.')
  }
  if (data.length < dealIds.length) {
    console.warn(`linkDealsToInvoice: only ${data.length} of ${dealIds.length} deals were linked`)
  }
}

export async function unlinkDealsFromInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ invoice_id: null, payment_status: null })
    .eq('invoice_id', invoiceId)
    .select('id')

  if (error) throw new Error(error.message)
}

export async function linkDealsToPublisherInvoice(dealIds: string[], invoiceId: string): Promise<void> {
  if (!dealIds.length) return
  const { data, error } = await supabase
    .from('daily_deal_flow')
    .update({
      publisher_invoice_id: invoiceId,
      payment_status: 'publisher_payment_in_review' satisfies DealPaymentStatus,
    })
    .in('id', dealIds)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Failed to link deals to publisher invoice. No rows were updated — check RLS policies on daily_deal_flow.')
  }
  if (data.length < dealIds.length) {
    console.warn(`linkDealsToPublisherInvoice: only ${data.length} of ${dealIds.length} deals were linked`)
  }
}

export async function unlinkDealsFromPublisherInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ publisher_invoice_id: null, payment_status: 'paid_by_attorney' satisfies DealPaymentStatus })
    .eq('publisher_invoice_id', invoiceId)
    .select('id')

  if (error) throw new Error(error.message)
}
