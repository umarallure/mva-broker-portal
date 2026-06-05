<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import {
  createBrokerInvoice,
  createInvoice,
  generateInvoiceNumber,
  getBrokerInvoiceLead,
  getInvoice,
  getLawyerProfile,
  linkDealsToInvoice,
  linkDealsToPublisherInvoice,
  listBrokerLeadsForInvoice,
  listBrokersForInvoice,
  listLawyers,
  listDealsForInvoice,
  listDealsForPublisherInvoice,
  unlinkDealsFromInvoice,
  unlinkDealsFromPublisherInvoice,
  updateBrokerInvoice,
  updateInvoice,
  type BrokerInvoiceBrokerOption,
  type BrokerInvoiceLeadRow,
  type InvoiceItem,
  type InvoiceType,
  type InvoiceStatus,
  type DealFlowRow
} from '../lib/invoices'
import { listCenters, type CenterRow } from '../lib/centers'
import { supabase } from '../lib/supabase'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

type SelectableInvoiceDeal = DealFlowRow & {
  selected: boolean
  broker_id?: string | null
  broker_name?: string | null
  broker_attorney_name?: string | null
  broker_invoice_id?: string | null
}

const isEdit = computed(() => route.path.includes('/edit/'))
const invoiceId = computed(() => (route.params as Record<string, string>).id ?? null)
const editingInvoiceType = ref<InvoiceType | null>(null)
const requestedMode = computed(() => typeof route.query.mode === 'string' ? route.query.mode : 'broker')
const isBrokerMode = computed(() => requestedMode.value === 'broker' || editingInvoiceType.value === 'broker')
const isPublisherMode = computed(() => !isBrokerMode.value && (requestedMode.value === 'publisher' || editingInvoiceType.value === 'publisher'))
const isQuickFlow = computed(() => route.query.quick === '1')
const pageTitle = computed(() => {
  if (isEdit.value) {
    if (isBrokerMode.value) return 'Edit Broker Invoice'
    return isPublisherMode.value ? 'Edit Publisher Invoice' : 'Edit Invoice'
  }
  if (isBrokerMode.value) return 'Create Broker Invoice'
  return isPublisherMode.value ? 'Create Publisher Invoice' : 'Create Invoice'
})
const submitLabel = computed(() => {
  if (isEdit.value) return 'Update Invoice'
  if (isBrokerMode.value) return 'Create Broker Invoice'
  return isPublisherMode.value ? 'Create Publisher Invoice' : 'Create Invoice'
})

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const lawyers = ref<Array<{ user_id: string; email: string; display_name: string | null }>>([])
const vendors = ref<CenterRow[]>([])
const brokers = ref<BrokerInvoiceBrokerOption[]>([])
const selectedVendor = ref<CenterRow | null>(null)
const deals = ref<SelectableInvoiceDeal[]>([])
const loadingDeals = ref(false)
const lockedBrokerId = ref<string | null>(null)

const invoiceNumber = ref('')

const form = ref({
  lawyer_id: '',
  lead_vendor_id: '',
  broker_id: '',
  date_range_start: '',
  date_range_end: '',
  deal_ids: [] as string[],
  items: [] as Array<InvoiceItem & { deal_id?: string }>,
  tax_rate: 0,
  status: 'in_review' as InvoiceStatus,
  notes: '',
  due_date: ''
})

const isUpfrontPayment = ref(false)
const upfrontPercent = ref<number>(50)

const upfrontMultiplier = computed(() => {
  if (!isUpfrontPayment.value) return 1
  const p = Number(upfrontPercent.value)
  if (!Number.isFinite(p)) return 0
  return Math.min(1, Math.max(0, p / 100))
})

const lawyerProfile = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
  case_rate_per_deal: number | null
  payment_window_days: number | null
} | null>(null)

const caseRatePerDeal = computed(() => {
  const n = Number(lawyerProfile.value?.case_rate_per_deal ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
})

const paymentWindowDays = computed(() => {
  const n = Number(lawyerProfile.value?.payment_window_days ?? 0)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  return Math.floor(n)
})

const selectedLawyerLabel = computed(() => {
  if (!form.value.lawyer_id) return ''
  const l = lawyers.value.find(lw => lw.user_id === form.value.lawyer_id)
  if (!l) return ''
  return l.display_name || l.email
})

const lawyerOptions = computed(() =>
  lawyers.value.map(l => ({
    label: l.display_name || l.email,
    value: l.user_id
  }))
)

const vendorOptions = computed(() =>
  vendors.value.map(v => ({
    label: v.center_name,
    value: v.id
  }))
)

const brokerDisplayName = (broker: BrokerInvoiceBrokerOption) =>
  String(broker.company_name || broker.full_name || broker.primary_email || '').trim() || 'Unnamed broker'

const brokerOptions = computed(() =>
  brokers.value.map(b => ({
    label: brokerDisplayName(b),
    value: b.user_id
  }))
)

const selectedBroker = computed(() => brokers.value.find(b => b.user_id === form.value.broker_id) ?? null)
const selectedBrokerLabel = computed(() => selectedBroker.value ? brokerDisplayName(selectedBroker.value) : '')
const brokerSelectorLocked = computed(() => isBrokerMode.value && Boolean(lockedBrokerId.value || isEdit.value))

const recipientLabel = computed(() => {
  if (isBrokerMode.value) return 'Broker'
  return isPublisherMode.value ? 'Lead Vendor' : 'Lawyer'
})
const recipientOptions = computed(() => {
  if (isBrokerMode.value) return brokerOptions.value
  return isPublisherMode.value ? vendorOptions.value : lawyerOptions.value
})
const recipientValue = computed({
  get: () => {
    if (isBrokerMode.value) return form.value.broker_id
    return isPublisherMode.value ? form.value.lead_vendor_id : form.value.lawyer_id
  },
  set: (v: string) => {
    if (isBrokerMode.value) form.value.broker_id = v
    else if (isPublisherMode.value) form.value.lead_vendor_id = v
    else form.value.lawyer_id = v
  }
})
const recipientPlaceholder = computed(() => {
  if (isBrokerMode.value) return 'Choose a broker...'
  return isPublisherMode.value ? 'Choose a vendor...' : 'Choose a lawyer...'
})

const statusOptions = [
  { label: 'In Review', value: 'in_review' },
  { label: 'Paid', value: 'paid' },
  { label: 'Chargeback', value: 'chargeback' }
]
const visibleStatusOptions = computed(() =>
  isBrokerMode.value ? [{ label: 'In Review', value: 'in_review' }] : statusOptions
)

const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toMoneyNumber = (value: unknown, fallback = 0) =>
  Math.round(toFiniteNumber(value, fallback) * 100) / 100

const normalizedTaxRate = computed(() =>
  Math.min(1, Math.max(0, toFiniteNumber(form.value.tax_rate, 0)))
)

watch([isPublisherMode, isBrokerMode], () => {
  // Default newly-created invoices to review stage
  if (!isEdit.value) {
    form.value.status = 'in_review' as InvoiceStatus
  }
})

const validItems = computed(() => {
  return form.value.items
    .map((i) => {
      const description = String(i.description ?? '').trim()
      const quantity = toFiniteNumber(i.quantity, 0)
      const unit_price = toMoneyNumber(i.unit_price, 0)
      const amount = toMoneyNumber(quantity * unit_price)
      return {
        ...i,
        description,
        quantity,
        unit_price,
        amount
      }
    })
    .filter(i => i.description.length > 0 && i.quantity > 0 && i.unit_price >= 0)
})

const subtotal = computed(() =>
  toMoneyNumber(validItems.value.reduce((sum, item) => sum + item.amount, 0))
)

const taxAmount = computed(() =>
  toMoneyNumber(subtotal.value * normalizedTaxRate.value)
)

const totalAmount = computed(() =>
  toMoneyNumber(subtotal.value + taxAmount.value)
)

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const addItem = () => {
  const unit = isPublisherMode.value || isBrokerMode.value ? 0 : caseRatePerDeal.value
  form.value.items.push({
    description: '',
    quantity: 1,
    unit_price: unit,
    amount: unit
  })
}

const removeItem = (index: number) => {
  form.value.items.splice(index, 1)
}

const recalcItem = (index: number) => {
  const item = form.value.items[index]
  if (item) {
    item.amount = toMoneyNumber(toFiniteNumber(item.quantity, 0) * toFiniteNumber(item.unit_price, 0))
  }
}

const toDealUnitPrice = (deal: DealFlowRow) => {
  const raw = (deal as unknown as { face_amount?: unknown }).face_amount
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0
    return Math.max(0, Math.round(raw * 100) / 100)
  }

  const s = String(raw).trim()
  if (!s) return 0
  const normalized = s.replace(/[^0-9.-]/g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

const dateInputFromTimestamp = (value: string | null) => {
  if (!value) return ''
  return value.slice(0, 10)
}

const brokerLeadDescription = (deal: Pick<SelectableInvoiceDeal, 'insured_name' | 'submission_id'>) => {
  const name = String(deal.insured_name ?? '').trim() || 'Unknown'
  const submission = String(deal.submission_id ?? '').trim()
  return submission ? `${name} (${submission})` : name
}

const mapBrokerLeadToDeal = (lead: BrokerInvoiceLeadRow): SelectableInvoiceDeal => ({
  id: lead.id,
  submission_id: lead.submission_id ?? '',
  insured_name: lead.customer_full_name,
  client_phone_number: lead.phone_number,
  lead_vendor: lead.lead_vendor,
  status: lead.status,
  payment_status: null,
  assigned_attorney_id: lead.assigned_broker_attorney_id,
  agent: null,
  carrier: null,
  face_amount: null,
  invoice_id: lead.broker_invoice_id,
  publisher_invoice_id: null,
  created_at: lead.created_at,
  selected: form.value.deal_ids.includes(lead.id),
  broker_id: lead.broker_id,
  broker_name: lead.broker_name,
  broker_attorney_name: lead.broker_attorney_name,
  broker_invoice_id: lead.broker_invoice_id
})

const syncItemsWithSelectedDeals = () => {
  const selected = deals.value.filter(d => d.selected)
  const selectedForInvoice = selected.filter(d => {
    const name = String(d.insured_name ?? '').trim()
    return name.length > 0
  })
  const selectedIds = new Set(selected.map(d => d.id))

  // Keep any manually-added items (no deal_id)
  const manualItems = form.value.items.filter(i => !i.deal_id)

  const dealItems = selectedForInvoice.map((d) => {
    const existing = form.value.items.find(i => i.deal_id === d.id)
    const baseUnit = isBrokerMode.value
      ? toFiniteNumber(existing?.unit_price, 0)
      : isPublisherMode.value
        ? toDealUnitPrice(d)
        : caseRatePerDeal.value
    const unit = Math.round(baseUnit * (isBrokerMode.value ? 1 : upfrontMultiplier.value) * 100) / 100
    const description = isBrokerMode.value ? brokerLeadDescription(d) : `${d.insured_name ?? 'Unknown'}`
    if (existing) {
      existing.description = description
      existing.quantity = 1
      existing.unit_price = unit
      existing.amount = unit
      return existing
    }

    return {
      deal_id: d.id,
      description,
      quantity: 1,
      unit_price: unit,
      amount: unit
    }
  })

  // Drop deal items for deals that are no longer selected
  form.value.items = [...manualItems, ...dealItems]
  // Also ensure deal_ids matches selected
  form.value.deal_ids = [...selectedIds]
}

watch([isUpfrontPayment, upfrontPercent], () => {
  if (isPublisherMode.value || isBrokerMode.value) return
  syncItemsWithSelectedDeals()
})

const fullSubtotal = computed(() => {
  const manual = form.value.items
    .filter(i => !i.deal_id)
    .map(i => ({
      description: String(i.description ?? '').trim(),
      quantity: toFiniteNumber(i.quantity, 0),
      unit_price: toFiniteNumber(i.unit_price, 0)
    }))
    .filter(i => i.description.length > 0 && i.quantity > 0 && i.unit_price >= 0)
    .reduce((sum, i) => sum + (Math.round(i.quantity * i.unit_price * 100) / 100), 0)

  const selectedDeals = deals.value.filter(d => d.selected)
  const dealSum = selectedDeals.reduce((sum, d) => {
    const unit = isBrokerMode.value ? 0 : isPublisherMode.value ? toDealUnitPrice(d) : caseRatePerDeal.value
    return sum + unit
  }, 0)
  return Math.round((manual + dealSum) * 100) / 100
})

const fullTaxAmount = computed(() => toMoneyNumber(fullSubtotal.value * normalizedTaxRate.value))
const fullTotalAmount = computed(() => toMoneyNumber(fullSubtotal.value + fullTaxAmount.value))

const canSubmit = computed(() => {
  if (isBrokerMode.value) {
    if (!form.value.broker_id) return false
    if (!form.value.date_range_start || !form.value.date_range_end) return false
    if (form.value.deal_ids.length === 0) return false
    if (totalAmount.value <= 0) return false
  } else if (isPublisherMode.value) {
    if (!form.value.lead_vendor_id) return false
  } else {
    if (!form.value.lawyer_id) return false
    if (!isQuickFlow.value && (!form.value.date_range_start || !form.value.date_range_end)) return false
  }
  if (!form.value.due_date) return false
  if (validItems.value.length === 0) return false
  return true
})

const fetchDeals = async () => {
  if (isBrokerMode.value) {
    if (!form.value.broker_id || !form.value.date_range_start || !form.value.date_range_end) {
      deals.value = []
      return
    }

    loadingDeals.value = true
    try {
      const data = await listBrokerLeadsForInvoice({
        brokerId: form.value.broker_id,
        dateStart: form.value.date_range_start,
        dateEnd: form.value.date_range_end,
        editingInvoiceId: isEdit.value ? invoiceId.value : null
      })

      deals.value = data.map(mapBrokerLeadToDeal)
      syncItemsWithSelectedDeals()
    } catch (e) {
      console.error('Failed to fetch broker leads:', e)
    } finally {
      loadingDeals.value = false
    }
    return
  }

  if (isPublisherMode.value) {
    if (!form.value.lead_vendor_id || !selectedVendor.value?.lead_vendor) {
      deals.value = []
      return
    }

    if (!isQuickFlow.value && (!form.value.date_range_start || !form.value.date_range_end)) {
      deals.value = []
      return
    }
    loadingDeals.value = true
    try {
      const data = await listDealsForPublisherInvoice({
        vendorLeadName: selectedVendor.value.lead_vendor,
        dateStart: form.value.date_range_start || null,
        dateEnd: form.value.date_range_end || null,
        editingInvoiceId: isEdit.value ? invoiceId.value : null
      })
      deals.value = data.map((d: DealFlowRow) => ({
        ...d,
        selected: form.value.deal_ids.includes(d.id)
      }))
      syncItemsWithSelectedDeals()
    } catch (e) {
      console.error('Failed to fetch publisher deals:', e)
    } finally {
      loadingDeals.value = false
    }
    return
  }

  if (!form.value.lawyer_id || !form.value.date_range_start || !form.value.date_range_end) {
    if (form.value.deal_ids.length && deals.value.some(d => form.value.deal_ids.includes(d.id))) {
      deals.value.forEach((d) => {
        d.selected = form.value.deal_ids.includes(d.id)
      })
      syncItemsWithSelectedDeals()
      return
    }

    deals.value = []
    return
  }

  loadingDeals.value = true
  try {
    const data = await listDealsForInvoice({
      lawyerId: form.value.lawyer_id,
      dateStart: form.value.date_range_start,
      dateEnd: form.value.date_range_end,
      editingInvoiceId: isEdit.value ? invoiceId.value : null
    })

    deals.value = data.map((d: DealFlowRow) => ({
      ...d,
      selected: form.value.deal_ids.includes(d.id)
    }))
    syncItemsWithSelectedDeals()
  } catch (e) {
    console.error('Failed to fetch deals:', e)
  } finally {
    loadingDeals.value = false
  }
}

const ensureDealSelected = async (dealId: string) => {
  if (!dealId) return

  if (!form.value.deal_ids.includes(dealId)) {
    form.value.deal_ids = [dealId]
  }

  const existing = deals.value.find(d => d.id === dealId)
  if (existing) {
    existing.selected = true
    syncItemsWithSelectedDeals()
    return
  }

  if (isBrokerMode.value) {
    const lead = await getBrokerInvoiceLead(dealId)
    if (!lead) return

    if (form.value.broker_id && form.value.broker_id !== lead.broker_id) {
      throw new Error('The selected lead belongs to a different broker')
    }

    form.value.broker_id = lead.broker_id
    lockedBrokerId.value = lead.broker_id

    const createdDate = dateInputFromTimestamp(lead.created_at)
    if (createdDate) {
      form.value.date_range_start ||= createdDate
      form.value.date_range_end ||= createdDate
    }

    deals.value = [
      {
        ...mapBrokerLeadToDeal(lead),
        selected: true,
      },
      ...deals.value,
    ]
    syncItemsWithSelectedDeals()
    return
  }

  const { data, error } = await supabase
    .from('daily_deal_flow')
    .select('id,submission_id,insured_name,client_phone_number,lead_vendor,status,assigned_attorney_id,agent,carrier,face_amount,invoice_id,publisher_invoice_id,created_at')
    .eq('id', dealId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return

  const fetched = data as DealFlowRow
  const baseUnit = isPublisherMode.value ? toDealUnitPrice(fetched) : caseRatePerDeal.value
  const unit = Math.round(baseUnit * upfrontMultiplier.value * 100) / 100
  const desc = String(fetched.insured_name ?? '').trim() || 'Unknown'

  deals.value = [
    {
      ...fetched,
      selected: true,
    },
    ...deals.value,
  ]

  if (isQuickFlow.value || unit > 0) {
    const existing = form.value.items.find(i => i.deal_id === dealId)
    if (existing) {
      existing.description = desc
      existing.quantity = 1
      existing.unit_price = unit
      existing.amount = unit
    } else {
      form.value.items = [
        ...form.value.items,
        {
          deal_id: dealId,
          description: desc,
          quantity: 1,
          unit_price: unit,
          amount: unit,
        },
      ]
    }
  }

  syncItemsWithSelectedDeals()
}

const toggleDeal = (dealId: string) => {
  const deal = deals.value.find(d => d.id === dealId)
  if (!deal) return

  error.value = null

  deal.selected = !deal.selected

  if (deal.selected) {
    if (!form.value.deal_ids.includes(dealId)) {
      form.value.deal_ids.push(dealId)
    }
  } else {
    form.value.deal_ids = form.value.deal_ids.filter(id => id !== dealId)
  }

  syncItemsWithSelectedDeals()
}

const selectAllDeals = () => {
  const allSelected = deals.value.every(d => d.selected)
  deals.value.forEach(d => {
    d.selected = !allSelected
  })
  form.value.deal_ids = allSelected ? [] : deals.value.map(d => d.id)

  syncItemsWithSelectedDeals()
}

const autoGenerateItems = () => {
  syncItemsWithSelectedDeals()
}

const fetchLawyerProfile = async () => {
  if (!form.value.lawyer_id) {
    lawyerProfile.value = null
    return
  }
  try {
    lawyerProfile.value = await getLawyerProfile(form.value.lawyer_id)
  } catch {
    lawyerProfile.value = null
  }
}

const fetchVendorInfo = () => {
  if (!form.value.lead_vendor_id) {
    selectedVendor.value = null
    return
  }
  selectedVendor.value = vendors.value.find(v => v.id === form.value.lead_vendor_id) ?? null
}

const loadExisting = async () => {
  if (!invoiceId.value) return

  loading.value = true
  try {
    const inv = await getInvoice(invoiceId.value)
    if (!inv) {
      error.value = 'Invoice not found'
      return
    }

    invoiceNumber.value = inv.invoice_number
    editingInvoiceType.value = inv.invoice_type

    form.value = {
      lawyer_id: inv.lawyer_id ?? '',
      lead_vendor_id: inv.lead_vendor_id ?? '',
      broker_id: inv.broker_id ?? '',
      date_range_start: inv.date_range_start,
      date_range_end: inv.date_range_end,
      deal_ids: inv.deal_ids ?? [],
      items: (inv.items ?? []) as Array<InvoiceItem & { deal_id?: string }>,
      tax_rate: Number(inv.tax_rate) || 0,
      status: inv.status,
      notes: inv.notes ?? '',
      due_date: inv.due_date ?? ''
    }

    if (isBrokerMode.value) {
      lockedBrokerId.value = inv.broker_id ?? null
    } else if (isPublisherMode.value) {
      fetchVendorInfo()
    } else {
      await fetchLawyerProfile()
    }
    await fetchDeals()
    syncItemsWithSelectedDeals()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  error.value = null
  success.value = null

  if (isBrokerMode.value) {
    if (!form.value.broker_id) {
      error.value = 'Please select a broker'
      return
    }
    if (!form.value.date_range_start || !form.value.date_range_end) {
      error.value = 'Please select a date range'
      return
    }
    if (form.value.deal_ids.length === 0) {
      error.value = 'Please select at least one broker lead'
      return
    }
  } else if (isPublisherMode.value) {
    if (!form.value.lead_vendor_id) {
      error.value = 'Please select a lead vendor'
      return
    }
  } else {
    if (!form.value.lawyer_id) {
      error.value = 'Please select a lawyer'
      return
    }
    if (!isQuickFlow.value && (!form.value.date_range_start || !form.value.date_range_end)) {
      error.value = 'Please select a date range'
      return
    }
  }
  if (!form.value.due_date) {
    error.value = 'Please select a due date'
    return
  }
  if (!validItems.value.length) {
    error.value = 'Please add at least one line item with a description'
    return
  }
  if (isBrokerMode.value && totalAmount.value <= 0) {
    error.value = 'Broker invoices require a positive total amount'
    return
  }

  saving.value = true
  try {
    const userId = auth.state.value.user?.id
    if (!userId) throw new Error('Not authenticated')

    const today = new Date().toISOString().slice(0, 10)
    const basePayload = {
      date_range_start: isQuickFlow.value && !isBrokerMode.value ? today : (form.value.date_range_start || today),
      date_range_end: isQuickFlow.value && !isBrokerMode.value ? today : (form.value.date_range_end || today),
      deal_ids: form.value.deal_ids,
      items: validItems.value.map(({ description, quantity, unit_price, amount }) => ({
        description,
        quantity,
        unit_price,
        amount
      })),
      subtotal: subtotal.value,
      tax_rate: normalizedTaxRate.value,
      tax_amount: taxAmount.value,
      total_amount: totalAmount.value,
      status: form.value.status,
      notes: form.value.notes || null,
      due_date: form.value.due_date || null
    }

    if (isBrokerMode.value) {
      const brokerPayload = {
        broker_id: form.value.broker_id,
        lead_ids: form.value.deal_ids,
        date_range_start: basePayload.date_range_start,
        date_range_end: basePayload.date_range_end,
        items: basePayload.items,
        subtotal: basePayload.subtotal,
        tax_rate: basePayload.tax_rate,
        tax_amount: basePayload.tax_amount,
        total_amount: basePayload.total_amount,
        due_date: form.value.due_date,
        notes: basePayload.notes
      }

      if (isEdit.value && invoiceId.value) {
        await updateBrokerInvoice(invoiceId.value, brokerPayload)
        success.value = 'Invoice updated successfully'
      } else {
        const created = await createBrokerInvoice({
          ...brokerPayload,
          invoice_number: null
        })
        invoiceNumber.value = created.invoice_number
        success.value = 'Invoice created successfully'
      }

      setTimeout(() => {
        router.push('/invoicing/broker')
      }, 1200)
      return
    }

    const payload = isPublisherMode.value
      ? { ...basePayload, invoice_type: 'publisher' as const, lead_vendor_id: form.value.lead_vendor_id, lawyer_id: null }
      : { ...basePayload, invoice_type: 'lawyer' as const, lawyer_id: form.value.lawyer_id, lead_vendor_id: null }

    const backRoute = isPublisherMode.value ? '/invoicing/publisher' : '/invoicing/broker'

    if (isEdit.value && invoiceId.value) {
      if (isPublisherMode.value) {
        await unlinkDealsFromPublisherInvoice(invoiceId.value)
        await updateInvoice(invoiceId.value, payload)
        await linkDealsToPublisherInvoice(form.value.deal_ids, invoiceId.value)
      } else {
        await unlinkDealsFromInvoice(invoiceId.value)
        await updateInvoice(invoiceId.value, payload)
        await linkDealsToInvoice(form.value.deal_ids, invoiceId.value)
      }
      success.value = 'Invoice updated successfully'
    } else {
      const invNumber = invoiceNumber.value || await generateInvoiceNumber()
      const created = await createInvoice({
        ...payload,
        invoice_number: invNumber,
        created_by: userId
      })
      if (isPublisherMode.value) {
        await linkDealsToPublisherInvoice(form.value.deal_ids, created.id)
      } else {
        await linkDealsToInvoice(form.value.deal_ids, created.id)
      }
      success.value = 'Invoice created successfully'
    }

    setTimeout(() => {
      router.push(backRoute)
    }, 1200)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save invoice'
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  if (isBrokerMode.value) {
    router.push('/invoicing/broker')
    return
  }
  router.push(isPublisherMode.value ? '/invoicing/publisher' : '/invoicing/broker')
}

watch(() => form.value.lawyer_id, () => {
  if (!isPublisherMode.value && !isBrokerMode.value) {
    fetchLawyerProfile()
    fetchDeals()
  }
})

watch(() => form.value.lead_vendor_id, () => {
  if (isPublisherMode.value) {
    fetchVendorInfo()
    fetchDeals()
  }
})

watch(() => form.value.broker_id, () => {
  if (isBrokerMode.value) {
    fetchDeals()
  }
})

watch([() => form.value.date_range_start, () => form.value.date_range_end], () => {
  fetchDeals()
})

const dealSectionTitle = computed(() => isBrokerMode.value ? 'Broker Leads' : 'Assigned Deals')
const dealSelectionBlocked = computed(() => {
  if (isBrokerMode.value) return !form.value.broker_id || !form.value.date_range_start || !form.value.date_range_end
  return isPublisherMode.value
    ? !form.value.lead_vendor_id
    : (!form.value.lawyer_id || (!isQuickFlow.value && (!form.value.date_range_start || !form.value.date_range_end)))
})
const dealSelectionPrompt = computed(() => {
  if (isBrokerMode.value) return 'Select a broker and date range to load qualified payable leads'
  if (isPublisherMode.value) return 'Select a lead vendor to load their approved deals'
  return isQuickFlow.value
    ? 'Select a lawyer to attach this retainer'
    : 'Select a lawyer and date range to load deals'
})
const noDealsMessage = computed(() => {
  if (isBrokerMode.value) return 'No uninvoiced qualified payable leads found for this broker'
  return isPublisherMode.value ? 'No approved payable deals found for this vendor' : 'No deals found for this lawyer in the selected date range'
})
const selectedRecipientSummary = computed(() => {
  if (isBrokerMode.value) return selectedBrokerLabel.value || '—'
  return isPublisherMode.value ? (selectedVendor.value?.center_name || '—') : (selectedLawyerLabel.value || '—')
})

onMounted(async () => {
  loading.value = true
  try {
    await auth.init()

    const role = auth.state.value.profile?.role
    if (role !== 'super_admin' && role !== 'admin') {
      router.push('/invoicing/broker')
      return
    }

    if (!isEdit.value && requestedMode.value !== 'broker') {
      await router.replace({
        path: '/invoicing/create',
        query: { ...route.query, mode: 'broker' }
      })
    }

    // Load invoice recipient lists in parallel. Broker mode uses the broker list;
    // the legacy modes continue to use lawyers/vendors.
    const [lawyerData, vendorData, brokerData] = await Promise.all([
      listLawyers(),
      listCenters(),
      listBrokersForInvoice()
    ])
    lawyers.value = lawyerData
    vendors.value = vendorData
    brokers.value = brokerData

    if (isEdit.value) {
      await loadExisting()
    } else {
      if (!isBrokerMode.value) {
        invoiceNumber.value = await generateInvoiceNumber()
      }

      // Pre-select from query params (e.g. navigating from retainers-details)
      const qLawyerId = route.query.lawyer_id as string | undefined
      const qCenterId = route.query.center_id as string | undefined
      const qDealId = route.query.deal_id as string | undefined
      const qBrokerId = route.query.broker_id as string | undefined
      const qLeadId = route.query.lead_id as string | undefined

      if (isBrokerMode.value) {
        if (qBrokerId) {
          form.value.broker_id = qBrokerId
        }
        if (qLeadId) {
          await ensureDealSelected(qLeadId)
          await fetchDeals()
        } else if (form.value.broker_id) {
          await fetchDeals()
        }
      } else if (isPublisherMode.value && qCenterId) {
        form.value.lead_vendor_id = qCenterId
        fetchVendorInfo()
        await fetchDeals()
        if (qDealId) {
          const deal = deals.value.find(d => d.id === qDealId)
          if (deal) {
            deal.selected = true
            form.value.deal_ids = [qDealId]
            syncItemsWithSelectedDeals()
          } else {
            await ensureDealSelected(qDealId)
          }
        }
      } else if (!isPublisherMode.value && qLawyerId) {
        form.value.lawyer_id = qLawyerId
        await fetchLawyerProfile()
        // Deals need a date range — we can't auto-load without one
        // but we store the deal_id so it auto-selects once dates are picked
        if (qDealId) {
          await ensureDealSelected(qDealId)
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to initialize'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <UDashboardPanel id="create-invoice">
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left"
              size="sm"
              class="rounded-lg"
              @click="goBack"
            >
              Back
            </UButton>

            <UButton
              color="primary"
              icon="i-lucide-save"
              size="sm"
              class="rounded-lg"
              :loading="saving"
              :disabled="saving || !canSubmit"
              @click="handleSave"
            >
              {{ submitLabel }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 create-invoice-scroll">
        <!-- Loading -->
        <div v-if="loading" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
            <span class="text-sm text-muted">Loading...</span>
          </div>
        </div>

        <template v-else>
          <!-- Alerts -->
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            title="Error"
            class="w-full h-24 rounded-xl shrink-0"
          >
            <template #description>
              <div class="max-h-14 overflow-y-auto whitespace-pre-wrap break-words">
                {{ error }}
              </div>
            </template>
          </UAlert>
          <UAlert
            v-if="success"
            color="success"
            variant="subtle"
            title="Success"
            class="w-full h-24 rounded-xl shrink-0"
          >
            <template #description>
              <div class="max-h-14 overflow-y-auto whitespace-pre-wrap break-words">
                {{ success }}
              </div>
            </template>
          </UAlert>

          <div class="grid gap-6 lg:grid-cols-3">
            <!-- Left Column: Main Form -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Invoice Details -->
              <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  Invoice Details
                </h3>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Status</label>
                    <USelect
                      v-model="form.status"
                      :items="visibleStatusOptions"
                      :disabled="isBrokerMode"
                      class="w-full [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
                      value-key="value"
                      label-key="label"
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">
                      {{ recipientLabel }} <span class="text-red-400">*</span>
                    </label>
                    <USelect
                      v-model="recipientValue"
                      :items="recipientOptions"
                      :disabled="brokerSelectorLocked"
                      class="w-full [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
                      value-key="value"
                      label-key="label"
                      :placeholder="recipientPlaceholder"
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Due Date <span class="text-red-400">*</span></label>
                    <UInput
                      v-model="form.due_date"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
                    />
                  </div>

                  <div v-if="!isQuickFlow || isBrokerMode">
                    <label class="mb-1.5 block text-xs font-medium text-muted">
                      Date Range Start <span v-if="!isPublisherMode" class="text-red-400">*</span>
                    </label>
                    <UInput
                      v-model="form.date_range_start"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
                    />
                  </div>

                  <div v-if="!isQuickFlow || isBrokerMode">
                    <label class="mb-1.5 block text-xs font-medium text-muted">
                      Date Range End <span v-if="!isPublisherMode" class="text-red-400">*</span>
                    </label>
                    <UInput
                      v-model="form.date_range_end"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
                    />
                  </div>
                </div>

                <div v-if="!isPublisherMode && !isBrokerMode" class="mt-4">
                  <div class="flex items-center gap-3">
                    <UCheckbox v-model="isUpfrontPayment" label="Upfront payment" />

                    <div v-if="isUpfrontPayment" class="flex items-center gap-2">
                      <span class="text-xs text-muted">%</span>
                      <UInput
                        v-model.number="upfrontPercent"
                        type="number"
                        :min="0"
                        :max="100"
                        class="w-24 [&_input]:rounded-lg [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div class="mt-4">
                  <label class="mb-1.5 block text-xs font-medium text-muted">Notes</label>
                  <UTextarea
                    v-model="form.notes"
                    class="w-full [&_textarea]:rounded-xl [&_textarea]:border-[var(--ap-card-border)] [&_textarea]:bg-[var(--ap-card-hover)]"
                    placeholder="Additional notes..."
                    :rows="3"
                  />
                </div>
              </div>

              <!-- Deals Selection -->
              <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-highlighted">
                    {{ dealSectionTitle }}
                  </h3>
                  <div class="flex items-center gap-2">
                    <UButton
                      v-if="deals.length"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="rounded-lg"
                      @click="selectAllDeals"
                    >
                      {{ deals.every(d => d.selected) ? 'Deselect All' : 'Select All' }}
                    </UButton>
                    <UButton
                      v-if="deals.some(d => d.selected)"
                      color="primary"
                      variant="soft"
                      size="xs"
                      class="rounded-lg"
                      icon="i-lucide-sparkles"
                      @click="autoGenerateItems"
                    >
                      Auto-generate Items
                    </UButton>
                  </div>
                </div>

                <div
                  v-if="dealSelectionBlocked"
                  class="rounded-xl border border-dashed border-[var(--ap-card-border)] px-4 py-8 text-center text-xs text-muted"
                >
                  {{ dealSelectionPrompt }}
                </div>

                <div v-else-if="loadingDeals" class="flex items-center justify-center py-8">
                  <UIcon name="i-lucide-loader-2" class="animate-spin text-lg text-[var(--ap-accent)]" />
                </div>

                <div v-else-if="!deals.length" class="rounded-xl border border-dashed border-[var(--ap-card-border)] px-4 py-8 text-center text-xs text-muted">
                  {{ noDealsMessage }}
                </div>

                <div v-else class="space-y-2 max-h-64 overflow-y-auto create-invoice-scroll">
                  <div
                    v-for="deal in deals"
                    :key="deal.id"
                    class="flex items-center gap-3 rounded-xl border p-3 transition-all cursor-pointer"
                    :class="deal.selected
                      ? 'border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/[0.06]'
                      : 'border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] hover:border-[var(--ap-card-border)]'"
                    @click="toggleDeal(deal.id)"
                  >
                    <div
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all"
                      :class="deal.selected
                        ? 'border-[var(--ap-accent)] bg-[var(--ap-accent)] text-white'
                        : 'border-[var(--ap-card-border)] bg-[var(--ap-card-hover)]'"
                    >
                      <UIcon v-if="deal.selected" name="i-lucide-check" class="text-xs" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-highlighted">
                        {{ deal.insured_name ?? 'Unknown' }}
                      </div>
                      <div class="mt-0.5 text-xs text-muted">
                        <template v-if="isBrokerMode">
                          {{ deal.broker_attorney_name || 'Unknown attorney' }}
                        </template>
                        <template v-else>
                          {{ deal.status ?? 'Successfull Cases' }}
                        </template>
                      </div>
                    </div>
                    <div class="shrink-0 text-right">
                      <div v-if="isBrokerMode" class="text-sm font-semibold text-[var(--ap-accent)]">
                        Manual amount
                      </div>
                      <div v-else class="text-sm font-semibold text-[var(--ap-accent)]">
                        {{ formatMoney(isPublisherMode ? Number(deal.face_amount ?? 0) : (caseRatePerDeal || Number(deal.face_amount ?? 0))) }}
                      </div>
                      <div class="text-xs text-muted">
                        {{ formatDate(deal.created_at) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Line Items -->
              <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-highlighted">
                    Line Items
                  </h3>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-plus"
                    class="rounded-lg"
                    @click="addItem"
                  >
                    Add Item
                  </UButton>
                </div>

                <div v-if="!form.items.length" class="rounded-xl border border-dashed border-[var(--ap-card-border)] px-4 py-8 text-center text-xs text-muted">
                  No line items yet. Click "Add Item" to get started.
                </div>

                <div v-else class="space-y-3">
                  <!-- Header -->
                  <div class="grid grid-cols-12 gap-3 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    <div class="col-span-5">Description</div>
                    <div class="col-span-2">Qty</div>
                    <div class="col-span-2">Unit Price</div>
                    <div class="col-span-2">Amount</div>
                    <div class="col-span-1"></div>
                  </div>

                  <div
                    v-for="(item, idx) in form.items"
                    :key="idx"
                    class="grid grid-cols-12 gap-3 items-start rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3"
                  >
                    <div class="col-span-5">
                      <UInput
                        v-model="item.description"
                        class="w-full [&_input]:rounded-lg [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:text-sm"
                        placeholder="Description"
                      />
                    </div>
                    <div class="col-span-2">
                      <UInput
                        v-model.number="item.quantity"
                        type="number"
                        :min="1"
                        class="w-full [&_input]:rounded-lg [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:text-sm"
                        @update:model-value="recalcItem(idx)"
                      />
                    </div>
                    <div class="col-span-2">
                      <UInput
                        v-model.number="item.unit_price"
                        type="number"
                        :min="0"
                        :step="0.01"
                        class="w-full [&_input]:rounded-lg [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:text-sm"
                        @update:model-value="recalcItem(idx)"
                      />
                    </div>
                    <div class="col-span-2 flex items-center">
                      <span class="text-sm font-semibold text-highlighted">{{ formatMoney(item.amount) }}</span>
                    </div>
                    <div class="col-span-1 flex items-center justify-end">
                      <button
                        class="rounded-lg p-1.5 text-muted transition-all hover:bg-red-500/10 hover:text-red-400"
                        @click="removeItem(idx)"
                      >
                        <UIcon name="i-lucide-trash-2" class="text-sm" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Totals -->
                <div v-if="form.items.length" class="mt-6 border-t border-[var(--ap-card-border)] pt-4">
                  <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center gap-8">
                      <span class="text-sm text-muted">Subtotal</span>
                      <span class="text-sm font-semibold text-highlighted w-28 text-right">{{ formatMoney(subtotal) }}</span>
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-muted">Tax Rate (%)</span>
                      <UInput
                        v-model.number="form.tax_rate"
                        type="number"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        class="w-24 [&_input]:rounded-lg [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:text-sm [&_input]:text-right"
                      />
                      <span class="text-sm font-semibold text-highlighted w-28 text-right">{{ formatMoney(taxAmount) }}</span>
                    </div>
                    <div class="flex items-center gap-8 border-t border-[var(--ap-card-border)] pt-2">
                      <span class="text-base font-bold text-highlighted">Total</span>
                      <span class="text-lg font-bold text-[var(--ap-accent)] w-28 text-right">{{ formatMoney(totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Preview & Info -->
            <div class="space-y-6">
              <!-- Recipient Info Card -->
              <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  {{ isBrokerMode ? 'Broker Info' : isPublisherMode ? 'Vendor Info' : 'Lawyer Info' }}
                </h3>

                <template v-if="isBrokerMode">
                  <div v-if="!form.broker_id" class="text-xs text-muted">
                    Select a broker to see their details
                  </div>
                  <div v-else-if="selectedBroker" class="space-y-3">
                    <div>
                      <div class="text-xs text-muted">Broker</div>
                      <div class="text-sm font-medium text-highlighted">{{ selectedBrokerLabel }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Company</div>
                      <div class="text-sm text-default">{{ selectedBroker.company_name ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Contact Email</div>
                      <div class="text-sm text-default">{{ selectedBroker.primary_email ?? '—' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-xs text-muted">
                    No details found for this broker
                  </div>
                </template>

                <!-- Publisher mode: Vendor Info -->
                <template v-else-if="isPublisherMode">
                  <div v-if="!form.lead_vendor_id" class="text-xs text-muted">
                    Select a lead vendor to see their details
                  </div>
                  <div v-else-if="selectedVendor" class="space-y-3">
                    <div>
                      <div class="text-xs text-muted">Center Name</div>
                      <div class="text-sm font-medium text-highlighted">{{ selectedVendor.center_name }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Lead Vendor</div>
                      <div class="text-sm text-default">{{ selectedVendor.lead_vendor ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Contact Email</div>
                      <div class="text-sm text-default">{{ selectedVendor.contact_email ?? '—' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-xs text-muted">
                    No details found for this vendor
                  </div>
                </template>

                <!-- Lawyer mode: Lawyer Profile -->
                <template v-else>
                  <div v-if="!form.lawyer_id" class="text-xs text-muted">
                    Select a lawyer to see their details
                  </div>
                  <div v-else-if="lawyerProfile" class="space-y-3">
                    <div>
                      <div class="text-xs text-muted">Name</div>
                      <div class="text-sm font-medium text-highlighted">{{ lawyerProfile.full_name ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Email</div>
                      <div class="text-sm text-default">{{ lawyerProfile.primary_email ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Case per price</div>
                      <div class="text-sm text-default">{{ formatMoney(caseRatePerDeal) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Payment window days</div>
                      <div class="text-sm text-default">{{ paymentWindowDays ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Firm</div>
                      <div class="text-sm text-default">{{ lawyerProfile.firm_name ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Phone</div>
                      <div class="text-sm text-default">{{ lawyerProfile.direct_phone ?? '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">Address</div>
                      <div class="text-sm text-default">{{ lawyerProfile.office_address ?? '—' }}</div>
                    </div>
                  </div>
                  <div v-else class="text-xs text-muted">
                    No profile found for this lawyer
                  </div>
                </template>
              </div>

              <!-- Invoice Summary -->
              <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  Summary
                </h3>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Invoice #</span>
                    <span class="text-sm font-medium text-highlighted">{{ invoiceNumber || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">{{ recipientLabel }}</span>
                    <span class="text-sm text-default">{{ selectedRecipientSummary }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Date Range</span>
                    <span class="text-sm text-default">
                      {{ form.date_range_start && form.date_range_end
                        ? `${formatDate(form.date_range_start)} - ${formatDate(form.date_range_end)}`
                        : '—'
                      }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Deals</span>
                    <span class="text-sm text-default">{{ form.deal_ids.length }} selected</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Line Items</span>
                    <span class="text-sm text-default">{{ form.items.length }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Status</span>
                    <span
                      class="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium"
                      :class="{
                        'bg-blue-500/10 text-blue-400': form.status === 'billable',
                        'bg-amber-500/10 text-amber-400': form.status === 'pending',
                        'bg-violet-500/10 text-violet-400': form.status === 'in_review',
                        'bg-green-500/10 text-green-400': form.status === 'paid',
                        'bg-red-500/10 text-red-400': form.status === 'chargeback'
                      }"
                    >
                      {{ statusOptions.find(o => o.value === form.status)?.label ?? form.status }}
                    </span>
                  </div>

                  <div class="border-t border-[var(--ap-card-border)] pt-3">
                    <div v-if="!isPublisherMode && !isBrokerMode && isUpfrontPayment" class="space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-muted">Full Total</span>
                        <span class="text-sm font-semibold text-highlighted">{{ formatMoney(fullTotalAmount) }}</span>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-bold text-highlighted">Upfront Total ({{ Math.round(upfrontMultiplier * 100) }}%)</span>
                        <span class="text-lg font-bold text-[var(--ap-accent)]">{{ formatMoney(totalAmount) }}</span>
                      </div>
                    </div>
                    <div v-else class="flex items-center justify-between">
                      <span class="text-sm font-bold text-highlighted">Total</span>
                      <span class="text-lg font-bold text-[var(--ap-accent)]">{{ formatMoney(totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="space-y-2">
                <UButton
                  color="primary"
                  block
                  icon="i-lucide-save"
                  class="rounded-xl"
                  :loading="saving"
                  :disabled="saving || !canSubmit"
                  @click="handleSave"
                >
                  {{ submitLabel }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  block
                  icon="i-lucide-x"
                  class="rounded-xl"
                  @click="goBack"
                >
                  Cancel
                </UButton>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.create-invoice-scroll::-webkit-scrollbar {
  width: 4px;
}
.create-invoice-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.create-invoice-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.create-invoice-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
