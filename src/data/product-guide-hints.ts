import type { ProductGuideTarget } from '../lib/product-guide-navigation'

export type ProductGuideHintContent = {
  title: string
  description: string
  guideTarget?: ProductGuideTarget
}

export const productGuideHints = {
  dashboard: {
    retainersCard: {
      title: 'Retainers',
      description: 'Shows how many retained cases are currently assigned and links into the My Cases review board.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    activeOrdersCard: {
      title: 'Active Orders',
      description: 'Counts the firm\'s live orders and shows fulfillment progress against the total quota you purchased.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    totalInvoicedCard: {
      title: 'Total Invoiced',
      description: 'Rolls up invoice value across the loaded records and highlights how much is already paid versus still pending.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    pendingInvoicesCard: {
      title: 'Pending Invoices',
      description: 'Tracks invoice work that still needs payment follow-up or review and opens the invoicing workspace.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-kpi-header' }
    },
    invoiceTrend: {
      title: 'Invoice Trend',
      description: 'Visualizes billing activity across the last six months so month-over-month movement is easy to spot.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-invoice-trend' }
    },
    quickActions: {
      title: 'Quick Actions',
      description: 'Provides direct shortcuts into the most common workflows: placing orders, creating invoices, and reviewing retainers.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-actions-breakdown' }
    },
    invoiceBreakdown: {
      title: 'Invoice Breakdown',
      description: 'Summarizes invoice volume by stage and pairs it with overall order fulfillment so finance and operations stay aligned.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-actions-breakdown' }
    },
    workbench: {
      title: 'Workbench',
      description: 'Rotates between recent retainers, orders, and invoices so you can jump from summary metrics into live records quickly.',
      guideTarget: { sectionId: 'dashboard', subsectionId: 'dashboard-workbench' }
    }
  },
  orderMap: {
    createOrder: {
      title: 'Create Order',
      description: 'Opens the guarded order workflow where the user confirms intent first and then sets geography, case quality, quota, and expiration.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-create' }
    },
    map: {
      title: 'Interactive Map',
      description: 'Color-codes each state based on order availability and progress. Hovering a state shows live order counts, quota details, and capacity warnings.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-geography' }
    },
    myOrders: {
      title: 'My Orders',
      description: 'Lists the firm\'s active and closed orders with status, quota progress, and expiration so campaigns can be compared in one place.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-manage-orders' }
    },
    filters: {
      title: 'Order Filters',
      description: 'Narrows the My Orders list by geography and order criteria without leaving the map page.',
      guideTarget: { sectionId: 'order-map', subsectionId: 'order-map-manage-orders' }
    }
  },
  myCases: {
    newForReviewCard: {
      title: 'New for Review',
      description: 'Counts retained cases that still need the first attorney review pass.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    approvalCard: {
      title: '24 Hour Approval',
      description: 'Tracks cases that are currently sitting inside the approval window before a final outcome is recorded.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    approvedCard: {
      title: 'Approved',
      description: 'Shows how many retainers have been reviewed and accepted.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    rejectedCard: {
      title: 'Rejected',
      description: 'Shows how many retainers were declined or did not meet the firm\'s criteria.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-status-cards' }
    },
    filters: {
      title: 'Search and Filters',
      description: 'Combines keyword search, date filtering, and staged criteria so reviewers can isolate the right set of cases quickly.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-filtering' }
    },
    myCasesColumn: {
      title: 'My Cases',
      description: 'The starting lane for newly submitted retainers that still need attorney review.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    approvalColumn: {
      title: '24 Hour Approval',
      description: 'Holds cases that are still being evaluated during the approval window.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    approvedColumn: {
      title: 'Customer Approved',
      description: 'Contains retained cases that passed review and moved into an accepted state.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    },
    rejectedColumn: {
      title: 'Customer Rejected',
      description: 'Contains retained cases that were declined so follow-up stays separate from approved work.',
      guideTarget: { sectionId: 'my-cases', subsectionId: 'my-cases-pipeline' }
    }
  },
  fulfillment: {
    totalOrdersCard: {
      title: 'Total Orders',
      description: 'Counts the campaigns represented in the fulfillment workspace.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    signedRetainersCard: {
      title: 'Signed Retainers',
      description: 'Shows retained leads that are still being monitored inside the post-signing workflow.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    returnedBackCard: {
      title: 'Returned Back',
      description: 'Tracks cases that were sent back during the return window.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    droppedRetainersCard: {
      title: 'Dropped Retainers',
      description: 'Shows retained matters that did not progress successfully.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    successfulCasesCard: {
      title: 'Successful Cases',
      description: 'Highlights retained cases that stayed valid after review and the return window.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-performance' }
    },
    filters: {
      title: 'Fulfillment Filters',
      description: 'Lets the team narrow the board by search terms, geography, order type, and fulfillment stage.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-filters' }
    },
    signedColumn: {
      title: 'Signed Retainers',
      description: 'The entry lane for retained leads that are still under fulfillment review.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    returnedColumn: {
      title: 'Returned Back',
      description: 'Captures cases that moved back during the refund or replacement period.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    droppedColumn: {
      title: 'Dropped Retainers',
      description: 'Separates unsuccessful retained matters from the successful pipeline.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    },
    successfulColumn: {
      title: 'Successful Cases',
      description: 'Shows retained cases that held quality and stayed successful.',
      guideTarget: { sectionId: 'fulfillment', subsectionId: 'fulfillment-pipeline' }
    }
  },
  invoicing: {
    totalInvoicedCard: {
      title: 'Total Invoiced',
      description: 'Shows the gross invoice value across the loaded records.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    billableCard: {
      title: 'Billable',
      description: 'Represents invoice-ready value that can still be processed into or through the billing workflow.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    pendingCard: {
      title: 'Pending',
      description: 'Tracks invoice value that is still awaiting review or payment progress.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    paidCard: {
      title: 'Paid',
      description: 'Shows invoice value that has already been collected successfully.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    chargebackCard: {
      title: 'Chargeback',
      description: 'Highlights invoice value that has entered dispute or reversal handling.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-summary' }
    },
    createInvoice: {
      title: 'Create Invoice',
      description: 'Starts a new invoice record for the current invoicing mode and is available only to authorized roles.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    toolbar: {
      title: 'Invoice Toolbar',
      description: 'Combines search, date controls, advanced filters, and result counts so teams can narrow the ledger without changing pages.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    viewToggle: {
      title: 'Board and List Views',
      description: 'Switches between a pipeline-style invoice board and a denser ledger table while keeping the same result set.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-tools' }
    },
    billableColumn: {
      title: 'Billable',
      description: 'Holds invoice-ready work before it is fully collected.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    pendingColumn: {
      title: 'Pending',
      description: 'Shows invoices that have been issued or are in review and still need payment progress.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    paidColumn: {
      title: 'Paid',
      description: 'Keeps successfully collected invoices visible in one place.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    chargebackColumn: {
      title: 'Chargeback',
      description: 'Tracks invoices that have entered dispute or reversal handling.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-board' }
    },
    pagination: {
      title: 'Pagination',
      description: 'Moves through larger invoice result sets without losing the current filters or view mode.',
      guideTarget: { sectionId: 'invoicing', subsectionId: 'invoicing-refresh' }
    }
  },
  productOffering: {
    overview: {
      title: 'Product Offering',
      description: 'Explains how consumer and commercial case inventory is packaged into pricing tiers before the buyer moves into ordering.',
      guideTarget: { sectionId: 'product-offering' }
    },
    categoryToggle: {
      title: 'Case Category',
      description: 'Switches the catalog between consumer and commercial offerings.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    transferTier: {
      title: 'Tier 1 Transfer',
      description: 'The entry-level consumer tier with the lowest price point and the oldest qualifying cases.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    bronzeTier: {
      title: 'Tier 2 Bronze',
      description: 'A mid-range consumer tier with stronger case quality expectations than transfer.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    silverTier: {
      title: 'Tier 3 Silver',
      description: 'A higher-intent consumer tier with stronger documentation and recency requirements.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    goldTier: {
      title: 'Tier 4 Gold',
      description: 'The premium consumer tier focused on the freshest and strongest qualifying cases.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    commercialTier: {
      title: 'Commercial',
      description: 'The commercial offering card used when the catalog is switched into commercial mode.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-tiers' }
    },
    placeOrder: {
      title: 'Place Order',
      description: 'Hands the buyer into the Order Map create-order workflow from the selected pricing tier.',
      guideTarget: { sectionId: 'product-offering', subsectionId: 'product-offering-ordering' }
    }
  }
} as const
