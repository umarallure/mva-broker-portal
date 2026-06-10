import { supabase } from './supabase'

export const SETTLEMENT_COLUMNS = {
  AWAITING_BILLABLE: {
    key: 'awaiting_billable',
    label: 'Awaiting Billable',
    field: 'status' as const,
    matchValues: ['qualified_payable', 'Awaiting Billable', 'Qualified/Payable', 'Qualified – Payable'],
  },
  INVOICE_TO_ATTORNEY: {
    key: 'attorney_payment_in_review',
    label: 'Invoice to Attorney',
    field: 'payment_status' as const,
    matchValues: ['attorney_payment_in_review'],
  },
  ATTORNEY_PAID: {
    key: 'paid_by_attorney',
    label: 'Attorney Paid',
    field: 'payment_status' as const,
    matchValues: ['paid_by_attorney'],
  },
  INVOICE_TO_PUBLISHER: {
    key: 'publisher_payment_in_review',
    label: 'Invoice to Publisher',
    field: 'payment_status' as const,
    matchValues: ['publisher_payment_in_review'],
  },
  PAID_TO_BPO: {
    key: 'paid_to_bpo',
    label: 'Paid to BPO',
    field: 'status' as const,
    matchValues: ['paid_to_bpo'],
  },
} as const

// Keep backward compat alias
export const PIPELINE_STAGES = SETTLEMENT_COLUMNS

// Labels for the status filter dropdown
export const SETTLEMENT_STAGE_LABELS = [
  SETTLEMENT_COLUMNS.AWAITING_BILLABLE.label,
  SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.label,
  SETTLEMENT_COLUMNS.ATTORNEY_PAID.label,
  SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.label,
  SETTLEMENT_COLUMNS.PAID_TO_BPO.label,
] as const

// Status values that map to the Awaiting Billable column
const BILLABLE_STATUS_VALUES = SETTLEMENT_COLUMNS.AWAITING_BILLABLE.matchValues
const PAYMENT_STATUS_VALUES = [
  ...SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.matchValues,
  ...SETTLEMENT_COLUMNS.ATTORNEY_PAID.matchValues,
  ...SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.matchValues,
]

const hasSettlementMatch = (values: readonly string[], value: string) => values.includes(value)

export type SettlementStageLabel = typeof SETTLEMENT_STAGE_LABELS[number]

export const INBOUND_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
} as const

export type InboundStatus = typeof INBOUND_STATUS[keyof typeof INBOUND_STATUS]

export const OUTBOUND_STATUS = {
  LOCKED: 'locked',
  PAID: 'paid',
} as const

export type OutboundStatus = typeof OUTBOUND_STATUS[keyof typeof OUTBOUND_STATUS]

// ── Row Type ──
export type RetainerSettlementRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date_signed: string | null
  status: string
  payment_status: string | null
  face_amount: number | null
  assigned_attorney_id: string | null
  assigned_attorney_name: string | null
  inbound_payment_status: InboundStatus
  outbound_payment_status: OutboundStatus
  created_at: string | null
  // Which settlement column this deal belongs to
  settlement_column: string
}

// ── Attorney Badge Colors ──
const ATTORNEY_COLORS = [
  { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' },
  { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/25' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/25' },
] as const

export function getAttorneyColor(name: string | null) {
  if (!name) return ATTORNEY_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return ATTORNEY_COLORS[Math.abs(hash) % ATTORNEY_COLORS.length]
}

// ── Derive initial payment state from settlement column ──
export function derivePaymentState(columnKey: string): {
  inbound: InboundStatus
  outbound: OutboundStatus
} {
  if (columnKey === SETTLEMENT_COLUMNS.PAID_TO_BPO.key) {
    return { inbound: INBOUND_STATUS.RECEIVED, outbound: OUTBOUND_STATUS.PAID }
  }
  if (
    columnKey === SETTLEMENT_COLUMNS.ATTORNEY_PAID.key ||
    columnKey === SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.key
  ) {
    return { inbound: INBOUND_STATUS.RECEIVED, outbound: OUTBOUND_STATUS.LOCKED }
  }
  return { inbound: INBOUND_STATUS.PENDING, outbound: OUTBOUND_STATUS.LOCKED }
}

// ── Determine which settlement column a deal belongs to ──
function resolveSettlementColumn(status: string, paymentStatus: string | null): string {
  // Check payment_status first (columns 2-4) since it's more specific
  if (paymentStatus) {
    for (const col of [SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY, SETTLEMENT_COLUMNS.ATTORNEY_PAID, SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER]) {
      if (hasSettlementMatch(col.matchValues, paymentStatus)) return col.key
    }
  }
  // Check status field (columns 1 and 5)
  if (hasSettlementMatch(SETTLEMENT_COLUMNS.PAID_TO_BPO.matchValues, status)) return SETTLEMENT_COLUMNS.PAID_TO_BPO.key
  if (hasSettlementMatch(SETTLEMENT_COLUMNS.AWAITING_BILLABLE.matchValues, status)) return SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key
  // Fallback to awaiting billable
  return SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key
}

// ── Supabase Queries ──

export async function listSettlements(): Promise<RetainerSettlementRow[]> {
  // Fetch deals that belong to any settlement column:
  // - status in billable values OR paid_to_bpo  (columns 1 & 5)
  // - payment_status in payment pipeline values (columns 2-4)
  const statusValues = [...BILLABLE_STATUS_VALUES, ...SETTLEMENT_COLUMNS.PAID_TO_BPO.matchValues]
  const paymentValues = PAYMENT_STATUS_VALUES

  const { data, error } = await supabase
    .from('daily_deal_flow')
    .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,payment_status,face_amount,assigned_attorney_id,created_at')
    .or(`status.in.(${statusValues.map(v => `"${v}"`).join(',')}),payment_status.in.(${paymentValues.map(v => `"${v}"`).join(',')})`)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!data?.length) return []

  const rows = data as Array<Record<string, unknown>>

  // Resolve attorney names from attorney_profiles
  const attorneyIds = [...new Set(
    rows
      .map(r => r.assigned_attorney_id)
      .filter((id): id is string => Boolean(id))
      .map(String)
  )]

  let attorneyMap = new Map<string, string>()
  if (attorneyIds.length) {
    const { data: attorneys } = await supabase
      .from('attorney_profiles')
      .select('user_id,full_name')
      .in('user_id', attorneyIds)

    attorneyMap = new Map(
      (attorneys ?? []).map((a: Record<string, unknown>) =>
        [String(a.user_id), String(a.full_name ?? '').trim()]
      )
    )
  }

  return rows.map((r): RetainerSettlementRow => {
    const attId = r.assigned_attorney_id ? String(r.assigned_attorney_id) : null
    const attName = attId ? (attorneyMap.get(attId) || null) : null
    const rawStatus = String(r.status ?? '')
    const rawPaymentStatus = r.payment_status ? String(r.payment_status) : null
    const colKey = resolveSettlementColumn(rawStatus, rawPaymentStatus)
    const payment = derivePaymentState(colKey)

    return {
      id: String(r.id),
      submission_id: String(r.submission_id ?? ''),
      insured_name: r.insured_name ? String(r.insured_name) : null,
      client_phone_number: r.client_phone_number ? String(r.client_phone_number) : null,
      lead_vendor: r.lead_vendor ? String(r.lead_vendor) : null,
      date_signed: r.date ? String(r.date) : null,
      status: rawStatus,
      payment_status: rawPaymentStatus,
      face_amount: (r.face_amount === null || r.face_amount === undefined) ? null : Number(r.face_amount),
      assigned_attorney_id: attId,
      assigned_attorney_name: attName,
      inbound_payment_status: payment.inbound,
      outbound_payment_status: payment.outbound,
      created_at: r.created_at ? String(r.created_at) : null,
      settlement_column: colKey,
    }
  })
}

// Update deal to a target settlement column (used by kanban drag-and-drop)
// Determines which DB field to update based on the target column config
export async function updateDealSettlementColumn(
  dealId: string,
  targetColumnKey: string
): Promise<void> {
  const col = Object.values(SETTLEMENT_COLUMNS).find(c => c.key === targetColumnKey)
  if (!col) throw new Error(`Unknown settlement column: ${targetColumnKey}`)

  const updatePayload: Record<string, string> = {}

  if (col.field === 'payment_status') {
    updatePayload.payment_status = col.key
  } else {
    // status field (paid_to_bpo)
    updatePayload.status = col.key
  }

  const { error } = await supabase
    .from('daily_deal_flow')
    .update(updatePayload)
    .eq('id', dealId)

  if (error) throw new Error(error.message)
}

// Legacy aliases for backward compat
export const updateDealStatus = async (dealId: string, newStatus: string) => {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ status: newStatus })
    .eq('id', dealId)
  if (error) throw new Error(error.message)
}

export async function markPaidToBpo(dealId: string): Promise<void> {
  await updateDealSettlementColumn(dealId, SETTLEMENT_COLUMNS.PAID_TO_BPO.key)
}

// ── Kanban Column Definitions ──
export const KANBAN_COLUMNS = [
  {
    key: SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key,
    label: SETTLEMENT_COLUMNS.AWAITING_BILLABLE.label,
    field: SETTLEMENT_COLUMNS.AWAITING_BILLABLE.field,
    icon: 'i-lucide-file-signature',
    borderClass: 'border-t-emerald-500/50',
    headerBg: 'bg-emerald-50/60 dark:bg-emerald-950/10',
    bodyBg: 'bg-emerald-50/50 dark:bg-emerald-950/15',
    badgeClass: 'bg-emerald-500/10 text-emerald-500',
    droppable: false,
  },
  {
    key: SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.key,
    label: SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.label,
    field: SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.field,
    icon: 'i-lucide-scale',
    borderClass: 'border-t-violet-500/50',
    headerBg: 'bg-violet-50/60 dark:bg-violet-950/10',
    bodyBg: 'bg-violet-50/50 dark:bg-violet-950/15',
    badgeClass: 'bg-violet-500/10 text-violet-500',
    droppable: true,
  },
  {
    key: SETTLEMENT_COLUMNS.ATTORNEY_PAID.key,
    label: SETTLEMENT_COLUMNS.ATTORNEY_PAID.label,
    field: SETTLEMENT_COLUMNS.ATTORNEY_PAID.field,
    icon: 'i-lucide-badge-dollar-sign',
    borderClass: 'border-t-amber-500/50',
    headerBg: 'bg-amber-50/60 dark:bg-amber-950/10',
    bodyBg: 'bg-amber-50/50 dark:bg-amber-950/15',
    badgeClass: 'bg-amber-500/10 text-amber-500',
    droppable: true,
  },
  {
    key: SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.key,
    label: SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.label,
    field: SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.field,
    icon: 'i-lucide-send',
    borderClass: 'border-t-indigo-500/50',
    headerBg: 'bg-indigo-50/60 dark:bg-indigo-950/10',
    bodyBg: 'bg-indigo-50/50 dark:bg-indigo-950/15',
    badgeClass: 'bg-indigo-500/10 text-indigo-500',
    droppable: true,
  },
  {
    key: SETTLEMENT_COLUMNS.PAID_TO_BPO.key,
    label: SETTLEMENT_COLUMNS.PAID_TO_BPO.label,
    field: SETTLEMENT_COLUMNS.PAID_TO_BPO.field,
    icon: 'i-lucide-banknote',
    borderClass: 'border-t-fuchsia-500/50',
    headerBg: 'bg-fuchsia-50/60 dark:bg-fuchsia-950/10',
    bodyBg: 'bg-fuchsia-50/50 dark:bg-fuchsia-950/15',
    badgeClass: 'bg-fuchsia-500/10 text-fuchsia-500',
    droppable: true,
  },
] as const
