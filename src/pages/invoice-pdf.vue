<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { brokerDropInvoiceWithNote, getInvoice, getLawyerProfile, markInvoiceAsPaid, requestChargeback, type InvoiceItem, type InvoiceRow } from '../lib/invoices'
import { supabase } from '../lib/supabase'

const route = useRoute()
const auth = useAuth()

const invoiceId = computed(() => (route.params as Record<string, string>).id ?? null)

const loading = ref(true)
const error = ref<string | null>(null)

const invoice = ref<InvoiceRow | null>(null)

const lawyerInfo = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
} | null>(null)

const lawyerFallback = ref<{
  display_name: string | null
  email: string | null
} | null>(null)

const vendorInfo = ref<{
  center_name: string | null
  lead_vendor: string | null
  contact_email: string | null
} | null>(null)

const brokerInfo = ref<{
  full_name: string | null
  company_name: string | null
  primary_email: string | null
  direct_phone: string | null
  office_address: string | null
} | null>(null)

const isPublisherInvoice = computed(() => invoice.value?.invoice_type === 'publisher')
const isBrokerInvoice = computed(() => invoice.value?.invoice_type === 'broker')

const billToName = computed(() => {
  if (isBrokerInvoice.value) return brokerInfo.value?.company_name ?? brokerInfo.value?.full_name ?? '-'
  if (isPublisherInvoice.value) return vendorInfo.value?.center_name ?? vendorInfo.value?.lead_vendor ?? '—'
  return lawyerName.value
})

const billToSubName = computed(() => {
  if (isBrokerInvoice.value) return brokerInfo.value?.full_name ?? null
  if (isPublisherInvoice.value) return vendorInfo.value?.lead_vendor ?? null
  return lawyerInfo.value?.firm_name ?? null
})

const billToEmail = computed(() => {
  if (isBrokerInvoice.value) return brokerInfo.value?.primary_email ?? '-'
  if (isPublisherInvoice.value) return vendorInfo.value?.contact_email ?? '—'
  return lawyerEmail.value
})

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
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const formatDateShort = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const getStatusLabel = (status: string) => {
  if (status === 'billable') return 'BILLABLE'
  if (status === 'pending') return 'BILLABLE'
  if (status === 'in_review') return 'IN REVIEW'
  if (status === 'signed_awaiting') return 'SIGNED – AWAITING PAYMENT'
  if (status === 'in_preview') return 'IN PREVIEW'
  if (status === 'paid') return 'PAID'
  return 'CHARGEBACK'
}

const getStatusClass = (status: string) => {
  if (status === 'billable') return 'status-billable'
  if (status === 'paid') return 'status-paid'
  if (status === 'pending') return 'status-pending'
  if (status === 'in_review') return 'status-in-review'
  if (status === 'signed_awaiting') return 'status-signed-awaiting'
  if (status === 'in_preview') return 'status-in-preview'
  return 'status-chargeback'
}

const lawyerName = computed(() =>
  lawyerInfo.value?.full_name || lawyerFallback.value?.display_name || lawyerFallback.value?.email || '—'
)

const lawyerEmail = computed(() =>
  lawyerInfo.value?.primary_email || lawyerFallback.value?.email || '—'
)

const markingPaid = ref(false)
const markPaidError = ref<string | null>(null)
const requestingChargeback = ref(false)
const chargebackError = ref<string | null>(null)
const brokerDropConfirmOpen = ref(false)
const brokerDropNote = ref('')
const brokerDropNoteTrimmed = computed(() => brokerDropNote.value.trim())

const handlePrint = () => {
  window.print()
}

const handleMarkAsPaid = async () => {
  if (!invoice.value || invoice.value.status !== 'in_review' || isBrokerInvoice.value) return
  markingPaid.value = true
  markPaidError.value = null
  try {
    const updated = await markInvoiceAsPaid(invoice.value.id)
    invoice.value = updated
  } catch (e) {
    markPaidError.value = e instanceof Error ? e.message : 'Failed to mark as paid'
  } finally {
    markingPaid.value = false
  }
}

const handleRequestChargeback = async () => {
  if (!invoice.value || invoice.value.status !== 'paid') return

  if (isBrokerInvoice.value) {
    brokerDropConfirmOpen.value = true
    brokerDropNote.value = ''
    chargebackError.value = null
    return
  }

  requestingChargeback.value = true
  chargebackError.value = null
  try {
    const updated = await requestChargeback(invoice.value.id)
    invoice.value = updated
  } catch (e) {
    chargebackError.value = e instanceof Error ? e.message : 'Failed to request chargeback'
  } finally {
    requestingChargeback.value = false
  }
}

const closeBrokerDropConfirm = () => {
  if (requestingChargeback.value) return
  brokerDropConfirmOpen.value = false
  brokerDropNote.value = ''
}

const confirmBrokerDrop = async () => {
  if (!invoice.value || !brokerDropNoteTrimmed.value) return

  requestingChargeback.value = true
  chargebackError.value = null

  try {
    const updated = await brokerDropInvoiceWithNote(invoice.value.id, brokerDropNoteTrimmed.value)
    invoice.value = updated
    brokerDropConfirmOpen.value = false
    brokerDropNote.value = ''
  } catch (e) {
    chargebackError.value = e instanceof Error ? e.message : 'Failed to drop invoice'
  } finally {
    requestingChargeback.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await auth.init()

    if (!invoiceId.value) {
      error.value = 'No invoice ID provided'
      return
    }

    const inv = await getInvoice(invoiceId.value)
    if (!inv) {
      error.value = 'Invoice not found'
      return
    }

    invoice.value = inv

    if (inv.invoice_type === 'publisher' && inv.lead_vendor_id) {
      // Fetch vendor info from centers table
      const { data: center } = await supabase
        .from('centers')
        .select('center_name,lead_vendor,contact_email')
        .eq('id', inv.lead_vendor_id)
        .maybeSingle()
      vendorInfo.value = center ? {
        center_name: center.center_name ?? null,
        lead_vendor: center.lead_vendor ?? null,
        contact_email: center.contact_email ?? null
      } : null
    } else if (inv.invoice_type === 'broker' && inv.broker_id) {
      const { data: broker } = await supabase
        .from('broker_profiles')
        .select('full_name,company_name,primary_email,direct_phone,office_address')
        .eq('user_id', inv.broker_id)
        .maybeSingle()

      brokerInfo.value = broker ? {
        full_name: broker.full_name ?? null,
        company_name: broker.company_name ?? null,
        primary_email: broker.primary_email ?? null,
        direct_phone: broker.direct_phone ?? null,
        office_address: broker.office_address ?? null
      } : null
    } else if (inv.lawyer_id) {
      try {
        lawyerInfo.value = await getLawyerProfile(inv.lawyer_id)
      } catch {
        lawyerInfo.value = null
      }

      const { data: appUser } = await supabase
        .from('app_users')
        .select('display_name,email')
        .eq('user_id', inv.lawyer_id)
        .maybeSingle()

      lawyerFallback.value = appUser ? {
        display_name: appUser.display_name ?? null,
        email: appUser.email ?? null
      } : null
    }

  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="invoice-pdf-page">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner" />
      <p>Loading invoice...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <!-- Invoice -->
    <div v-else-if="invoice" class="invoice-container">
      <!-- Action Buttons (hidden on print) -->
      <div class="print-actions no-print">
        <button
          v-if="invoice.status === 'in_review' && !isBrokerInvoice"
          class="mark-paid-btn"
          :disabled="markingPaid"
          @click="handleMarkAsPaid"
        >
          {{ markingPaid ? 'Marking...' : 'Mark as Paid' }}
        </button>
        <button
          v-if="invoice.status === 'paid'"
          class="chargeback-btn"
          :disabled="requestingChargeback"
          @click="handleRequestChargeback"
        >
          {{ requestingChargeback ? 'Requesting...' : (isBrokerInvoice ? 'Drop Invoice' : 'Request Chargeback') }}
        </button>
        <button class="print-btn" @click="handlePrint">
          Print / Save as PDF
        </button>
      </div>
      <div v-if="markPaidError" class="mark-paid-error no-print">
        {{ markPaidError }}
      </div>
      <div v-if="chargebackError" class="mark-paid-error no-print">
        {{ chargebackError }}
      </div>

      <div v-if="brokerDropConfirmOpen" class="broker-drop-modal no-print">
        <div class="broker-drop-dialog">
          <div>
            <h2>Drop Broker Invoice</h2>
            <p>
              Add the dropped reason. This note will be saved to the linked lead rows and shown in the closer portal.
            </p>
          </div>
          <textarea
            v-model="brokerDropNote"
            rows="5"
            placeholder="Explain why this invoice or its linked lead was dropped..."
            :disabled="requestingChargeback"
          />
          <div class="broker-drop-actions">
            <button
              type="button"
              class="broker-drop-cancel"
              :disabled="requestingChargeback"
              @click="closeBrokerDropConfirm"
            >
              Cancel
            </button>
            <button
              type="button"
              class="broker-drop-confirm"
              :disabled="requestingChargeback || !brokerDropNoteTrimmed"
              @click="confirmBrokerDrop"
            >
              {{ requestingChargeback ? 'Dropping...' : 'Drop invoice' }}
            </button>
          </div>
        </div>
      </div>

      <div class="invoice-paper">
        <!-- Top accent bar -->
        <div class="accent-bar" />

        <!-- Header -->
        <div class="invoice-header">
          <div class="header-left">
            <img src="/assets/logo-black.png" alt="Accident Payments" class="company-logo">
          </div>
          <div class="header-right">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">{{ invoice.invoice_number }}</div>
            <div :class="['status-badge', getStatusClass(invoice.status)]">
              {{ getStatusLabel(invoice.status) }}
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="divider" />

        <!-- Billing Info -->
        <div class="billing-section">
          <div class="billing-from">
            <div class="billing-label">FROM</div>
            <div class="billing-name">Accident Payments</div>
            <div class="billing-detail">Motor Vehicle Accident Division</div>
            <div class="billing-detail">admin@accidentpayments.com</div>
          </div>

          <div class="billing-to">
            <div class="billing-label">BILL TO</div>
            <div class="billing-name">{{ billToName }}</div>
            <div v-if="billToSubName" class="billing-detail">{{ billToSubName }}</div>
            <div class="billing-detail">{{ billToEmail }}</div>
          </div>

          <div class="billing-dates">
            <div class="date-row">
              <span class="date-label">Invoice Date</span>
              <span class="date-value">{{ formatDate(invoice.created_at) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Due Date</span>
              <span class="date-value">{{ formatDate(invoice.due_date) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Period</span>
              <span class="date-value">{{ formatDateShort(invoice.date_range_start) }} — {{ formatDateShort(invoice.date_range_end) }}</span>
            </div>
          </div>
        </div>

        <!-- Line Items Table -->
        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th class="th-num">#</th>
                <th class="th-desc">Description</th>
                <th class="th-qty">Qty</th>
                <th class="th-price">Unit Price</th>
                <th class="th-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in (invoice.items as InvoiceItem[])" :key="idx">
                <td class="td-num">{{ idx + 1 }}</td>
                <td class="td-desc">{{ item.description }}</td>
                <td class="td-qty">{{ item.quantity }}</td>
                <td class="td-price">{{ formatMoney(item.unit_price) }}</td>
                <td class="td-amount">{{ formatMoney(item.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="totals-section">
          <div class="totals-box">
            <div class="total-row">
              <span class="total-label">Subtotal</span>
              <span class="total-value">{{ formatMoney(Number(invoice.subtotal)) }}</span>
            </div>
            <div v-if="Number(invoice.tax_rate) > 0" class="total-row">
              <span class="total-label">Tax ({{ (Number(invoice.tax_rate) * 100).toFixed(1) }}%)</span>
              <span class="total-value">{{ formatMoney(Number(invoice.tax_amount)) }}</span>
            </div>
            <div class="total-row total-grand">
              <span class="total-label">Total Due</span>
              <span class="total-value">{{ formatMoney(Number(invoice.total_amount)) }}</span>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="invoice.notes" class="notes-section">
          <div class="notes-label">Notes</div>
          <div class="notes-text">{{ invoice.notes }}</div>
        </div>

        <!-- Footer -->
        <div class="invoice-footer">
          <div class="footer-left">
            <div class="footer-text">Thank you for your business.</div>
            <div class="footer-sub">Payment is due by {{ formatDate(invoice.due_date) }}.</div>
          </div>
          <div class="footer-right" />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Reset for PDF page — Accident Payments brand palette */
.invoice-pdf-page {
  min-height: 100vh;
  background: #f5f0ec;
  font-family: 'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #141010;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 16px;
  color: #7c6a5a;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8ddd3;
  border-top-color: #ae4010;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state p {
  color: #ae4010;
  font-size: 14px;
}

.invoice-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
}

.print-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 20px;
}

.mark-paid-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.mark-paid-btn:hover {
  background: #15803d;
}

.mark-paid-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mark-paid-error {
  text-align: right;
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.chargeback-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #b91c1c;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.chargeback-btn:hover {
  background: #991b1b;
}

.chargeback-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #ae4010;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.print-btn:hover {
  background: #7c2c0a;
}

/* Invoice Paper */
.invoice-paper {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 32px rgba(174, 64, 16, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04);
  padding: 48px;
  position: relative;
  overflow: hidden;
}

.accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, #7c2c0a, #ae4010, #f7c480);
}

/* Header */
.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-top: 8px;
}

.company-logo {
  height: 44px;
  width: auto;
  object-fit: contain;
}

.company-tagline {
  font-size: 11px;
  color: #9a8a7c;
  margin-top: 6px;
  letter-spacing: 0.3px;
}

.header-right {
  text-align: right;
}

.invoice-title {
  font-size: 30px;
  font-weight: 800;
  color: #ae4010;
  letter-spacing: 5px;
}

.invoice-number {
  font-size: 14px;
  font-weight: 600;
  color: #7c6a5a;
  margin-top: 4px;
}

.status-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.status-billable {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-paid {
  background: #e6f4ea;
  color: #1a7a3a;
}

.status-pending {
  background: #fef3e2;
  color: #ae4010;
}

.status-in-review {
  background: #f5f3ff;
  color: #6d28d9;
}

.status-signed-awaiting {
  background: #ecfdf5;
  color: #065f46;
}

.status-in-preview {
  background: #e0f2fe;
  color: #0369a1;
}

.status-chargeback {
  background: #fde8e8;
  color: #b91c1c;
}

/* Divider */
.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #e8ddd3, transparent);
  margin: 24px 0;
}

/* Billing Section */
.billing-section {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 32px;
  margin-bottom: 40px;
}

.billing-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.billing-name {
  font-size: 15px;
  font-weight: 700;
  color: #141010;
  margin-bottom: 4px;
}

.billing-detail {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
}

.billing-dates {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #faf7f4;
  border-radius: 8px;
  border: 1px solid #f0e8e0;
}

.date-label {
  font-size: 12px;
  font-weight: 600;
  color: #9a8a7c;
}

.date-value {
  font-size: 13px;
  font-weight: 600;
  color: #141010;
}

/* Items Table */
.items-section {
  margin-bottom: 32px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table thead tr {
  background: #faf7f4;
}

.items-table th {
  padding: 12px 16px;
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  text-align: left;
  border-bottom: 2px solid #e8ddd3;
}

.th-num { width: 50px; }
.th-desc { width: auto; }
.th-qty { width: 80px; text-align: center; }
.th-price { width: 120px; text-align: right; }
.th-amount { width: 120px; text-align: right; }

.items-table td {
  padding: 14px 16px;
  font-size: 14px;
  color: #3d3530;
  border-bottom: 1px solid #f0e8e0;
}

.td-num {
  color: #9a8a7c;
  font-weight: 600;
  font-size: 13px;
}

.td-desc {
  font-weight: 500;
}

.td-qty {
  text-align: center;
  color: #7c6a5a;
}

.td-price {
  text-align: right;
  color: #7c6a5a;
  font-variant-numeric: tabular-nums;
}

.td-amount {
  text-align: right;
  font-weight: 600;
  color: #141010;
  font-variant-numeric: tabular-nums;
}

.items-table tbody tr:last-child td {
  border-bottom: 2px solid #e8ddd3;
}

/* Totals */
.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 40px;
}

.totals-box {
  width: 300px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.total-label {
  font-size: 14px;
  color: #7c6a5a;
}

.total-value {
  font-size: 14px;
  font-weight: 600;
  color: #3d3530;
  font-variant-numeric: tabular-nums;
}

.total-grand {
  border-top: 2px solid #e8ddd3;
  margin-top: 8px;
  padding-top: 12px;
}

.total-grand .total-label {
  font-size: 16px;
  font-weight: 800;
  color: #141010;
}

.total-grand .total-value {
  font-size: 22px;
  font-weight: 800;
  color: #ae4010;
}

/* Notes */
.notes-section {
  background: #faf7f4;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 40px;
  border: 1px solid #f0e8e0;
}

.notes-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.notes-text {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.broker-drop-modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 16, 16, 0.55);
  backdrop-filter: blur(8px);
}

.broker-drop-dialog {
  width: min(520px, 100%);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 14px;
  background: #fffaf7;
  box-shadow: 0 24px 80px rgba(20, 16, 16, 0.28);
  padding: 22px;
}

.broker-drop-dialog h2 {
  margin: 0;
  color: #141010;
  font-size: 20px;
  font-weight: 800;
}

.broker-drop-dialog p {
  margin: 8px 0 16px;
  color: #7c6a5a;
  font-size: 13px;
  line-height: 1.5;
}

.broker-drop-dialog textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid #eaded4;
  border-radius: 10px;
  background: white;
  color: #141010;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  outline: none;
}

.broker-drop-dialog textarea:focus {
  border-color: #d65f1f;
  box-shadow: 0 0 0 3px rgba(214, 95, 31, 0.14);
}

.broker-drop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.broker-drop-cancel,
.broker-drop-confirm {
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.broker-drop-cancel {
  background: #f4ece4;
  color: #5d4c3f;
}

.broker-drop-confirm {
  background: #dc2626;
  color: white;
}

.broker-drop-cancel:disabled,
.broker-drop-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Footer */
.invoice-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-top: 24px;
  border-top: 1px solid #e8ddd3;
}

.footer-text {
  font-size: 14px;
  font-weight: 600;
  color: #141010;
}

.footer-sub {
  font-size: 12px;
  color: #9a8a7c;
  margin-top: 4px;
}

.footer-id {
  font-size: 11px;
  color: #c4b8ac;
  font-family: monospace;
}

/* Print Styles */
@media print {
  .no-print {
    display: none !important;
  }

  .invoice-pdf-page {
    background: white;
    padding: 0;
  }

  .invoice-container {
    padding: 0;
    max-width: none;
  }

  .invoice-paper {
    box-shadow: none;
    border-radius: 0;
    padding: 24px;
  }

  body {
    margin: 0;
    padding: 0;
  }

  @page {
    margin: 0.5in;
    size: letter;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .invoice-paper {
    padding: 24px;
  }

  .invoice-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-right {
    text-align: left;
  }

  .billing-section {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .items-table {
    font-size: 12px;
  }

  .items-table th,
  .items-table td {
    padding: 8px;
  }
}
</style>
