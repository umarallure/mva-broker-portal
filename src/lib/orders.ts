import { supabase } from './supabase'

export type OrderStatus = 'OPEN' | 'FULFILLED' | 'EXPIRED' | 'IN_PROGRESS' | 'PENDING'

export type OrderRow = {
  id: string
  lawyer_id: string
  target_states: string[]
  case_type: string
  case_subtype: string | null
  criteria: Record<string, unknown>
  quota_total: number
  quota_filled: number
  status: OrderStatus
  expires_at: string
  created_at: string
}

export type OpenOrderCountRow = {
  state_code: string
  open_orders: number
}

export async function listOpenOrderCountsByState() {
  const { data, error } = await supabase
    .from('open_order_counts_by_state')
    .select('state_code,open_orders')

  if (error) throw new Error(error.message)
  return (data ?? []) as OpenOrderCountRow[]
}

export async function createOrder(input: {
  lawyer_id: string
  target_states: string[]
  case_type: string
  case_subtype?: string | null
  criteria: Record<string, unknown>
  quota_total: number
  expires_at: string
}) {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      lawyer_id: input.lawyer_id,
      target_states: input.target_states,
      case_type: input.case_type,
      case_subtype: input.case_subtype ?? null,
      criteria: input.criteria,
      quota_total: input.quota_total,
      expires_at: input.expires_at,
      status: 'OPEN'
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as OrderRow
}

export async function listOpenOrdersForLawyer(lawyerId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('id,lawyer_id,target_states,case_type,case_subtype,criteria,quota_total,quota_filled,status,expires_at,created_at')
    .eq('lawyer_id', lawyerId)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as OrderRow[]
}

export async function listOrdersForLawyer(input: {
  lawyerId: string
  statuses?: OrderStatus[]
}) {
  let qb = supabase
    .from('orders')
    .select('id,lawyer_id,target_states,case_type,case_subtype,criteria,quota_total,quota_filled,status,expires_at,created_at')
    .eq('lawyer_id', input.lawyerId)
    .order('created_at', { ascending: false })

  if (input.statuses?.length) {
    qb = qb.in('status', input.statuses)
  }

  const { data, error } = await qb

  if (error) throw new Error(error.message)
  return (data ?? []) as OrderRow[]
}
