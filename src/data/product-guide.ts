export type GuideSubsection = {
  id: string
  title: string
  summary: string
  bullets: string[]
  note?: string
}

export type GuideSection = {
  id: string
  number: string
  title: string
  icon: string
  overview: string
  highlights: string[]
  subsections: GuideSubsection[]
}

export const productGuideSections: GuideSection[] = [
  {
    id: 'dashboard',
    number: '01',
    title: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    overview: 'The Dashboard is the portal command center. It combines signed-retainer counts, order health, invoice performance, and recent activity so firms can understand momentum before opening deeper workflow pages.',
    highlights: ['4 KPI cards', '6-month invoice trend', 'Recent workbench tabs'],
    subsections: [
      {
        id: 'dashboard-kpi-header',
        title: 'Summary KPI Header',
        summary: 'The top row gives lawyers a fast read on the most important operating numbers without leaving the page.',
        bullets: [
          'Retainers shows total signed retainers and links into My Cases.',
          'Active Orders summarizes live campaigns and overall quota progress.',
          'Total Invoiced rolls up gross billing and separates paid from pending revenue.',
          'Pending Invoices highlights items that need attention and routes into Invoicing.'
        ]
      },
      {
        id: 'dashboard-invoice-trend',
        title: 'Invoice Trend',
        summary: 'The main chart presents a rolling six-month billing view so firms can track growth over time.',
        bullets: [
          'Each month shows billed amount and invoice count.',
          'The comparison badge calls out movement versus the previous month.',
          'Hover states and tooltips make it easy to inspect a month without leaving the page.'
        ]
      },
      {
        id: 'dashboard-actions-breakdown',
        title: 'Quick Actions and Breakdown',
        summary: 'The right side balances action and visibility by pairing shortcuts with a compact financial status snapshot.',
        bullets: [
          'Quick Actions includes routes such as placing a new order.',
          'Invoice Breakdown visualizes Billable, Pending, Paid, and Chargeback states in one bar.',
          'Order Fulfillment summarizes how many cases have been filled across active orders.'
        ]
      },
      {
        id: 'dashboard-workbench',
        title: 'Tabbed Data Management',
        summary: 'The lower workbench rotates between recent retainers, orders, and invoices so users can jump from summary to specific records quickly.',
        bullets: [
          'Retainers shows the five most recent case records.',
          'Orders previews campaign progress and status.',
          'Invoices surfaces the latest billing items.',
          'See All routes to My Cases, Fulfillment, or Invoicing based on the active tab.'
        ]
      }
    ]
  },
  {
    id: 'order-map',
    number: '02',
    title: 'Order Map',
    icon: 'i-lucide-map',
    overview: 'The Order Map is the portal\'s geographic control center. Lawyers use it to launch campaigns by state, understand whether territories are available, and manage quota-based orders already in motion.',
    highlights: ['State-based campaign map', '2-step order creation', 'Filterable order table'],
    subsections: [
      {
        id: 'order-map-geography',
        title: 'Geographic Interface and Statistics',
        summary: 'The top of the page combines map visibility with portfolio-level order stats so territory decisions can be made quickly.',
        bullets: [
          'The summary highlights total, open, pending, and completed campaigns.',
          'The interactive US map color-codes states based on order activity.',
          'Open orders appear green when newly placed, shift to yellow once quota starts filling, and closed territories appear red.',
          'Legend controls and state filtering make it easy to focus on a specific region.'
        ]
      },
      {
        id: 'order-map-create',
        title: 'Creating a New Order',
        summary: 'New campaigns are launched through a guided two-step modal that reduces mistakes before a case acquisition order goes live.',
        bullets: [
          'Step 1 is a verification gate where the user types the confirmation phrase.',
          'Step 2 collects state, case category, injury severity, liability, insurance, medical treatment, languages, quota, and expiration.',
          'Commercial orders and temporarily unavailable states are blocked when they are not currently open.',
          'Expiration settings determine when the system stops accepting new retainers for the order.'
        ],
        note: 'Use this step to match campaign quality to firm capacity before quota is committed.'
      },
      {
        id: 'order-map-manage-orders',
        title: 'Managing My Orders',
        summary: 'The My Orders table gives a row-by-row operational view of every campaign after it has been launched.',
        bullets: [
          'Rows surface state, category, quota, progress, expiration, and status.',
          'Status language distinguishes Pending, In Progress, Completed, and Expired behavior.',
          'Filters support state, category, injury severity, insurance, liability, treatment, language, and expiration windows.',
          'The table is the fastest way to compare multiple campaigns without re-reading map tooltips.'
        ]
      }
    ]
  },
  {
    id: 'my-cases',
    number: '03',
    title: 'My Cases',
    icon: 'i-lucide-briefcase',
    overview: 'My Cases acts as the firm\'s internal CRM for signed retainers. It organizes cases into a kanban-style pipeline and gives teams flexible search and filtering for daily case handling.',
    highlights: ['Kanban case pipeline', 'Advanced filters', 'Live refresh'],
    subsections: [
      {
        id: 'my-cases-status-cards',
        title: 'Status Counter Cards',
        summary: 'The page header gives an at-a-glance count of signed-case inventory across the major review stages.',
        bullets: [
          'Counts are grouped across My Cases, 24 Hour Approval, Customer Approved, and Customer Rejected.',
          'This helps lawyers understand pipeline health before opening individual cards.',
          'The counters are useful for both daily triage and management reporting.'
        ]
      },
      {
        id: 'my-cases-filtering',
        title: 'Advanced Search and Filtering',
        summary: 'The search bar and filter drawer help firms narrow a large case list into the exact client or segment they need.',
        bullets: [
          'Search looks up a client by name or phone number.',
          'The Filters drawer supports stage, date range, state, case category, injury severity, insurance, liability, treatment, language, and expiry criteria.',
          'Hide Filters collapses the advanced controls back into a cleaner daily workspace.',
          'Reset controls clear the drawer quickly when users want to return to the full pipeline.'
        ]
      },
      {
        id: 'my-cases-pipeline',
        title: 'Pipeline Columns',
        summary: 'Each case appears as a card that moves across a structured review flow as the firm evaluates the retained client.',
        bullets: [
          'Cards move left to right through My Cases, 24 Hour Approval, Customer Approved, and Customer Rejected.',
          'Each card shows client name, phone number, sign date, and state code for fast scanning.',
          'The layout is designed for quick review without opening every underlying record.'
        ]
      },
      {
        id: 'my-cases-refresh',
        title: 'Live Data Refresh',
        summary: 'Refresh updates the board with the latest intake activity without forcing the user to reload the whole browser session.',
        bullets: [
          'Use Refresh when new retainers have been signed or statuses have changed recently.',
          'This keeps day-to-day case handling aligned with intake activity in near real time.'
        ]
      }
    ]
  },
  {
    id: 'fulfillment',
    number: '04',
    title: 'Fulfillment',
    icon: 'i-lucide-package',
    overview: 'Fulfillment focuses on outcome quality after a retainer is signed. It helps firms understand whether signed cases are sticking, being returned, dropping off, or converting into successful matters.',
    highlights: ['Performance header', 'Outcome filters', 'Fulfillment board'],
    subsections: [
      {
        id: 'fulfillment-performance',
        title: 'Fulfillment Performance Header',
        summary: 'The header metrics summarize order quality across active campaigns and make return-window exposure visible immediately.',
        bullets: [
          'Total Orders shows how many acquisition campaigns are currently in scope.',
          'Signed Retainers counts all retained cases tied to those active orders.',
          'Returned Back tracks cases sent back inside the 14-day return window.',
          'Dropped Retainers highlights unsuccessful matters.',
          'Successful Cases counts retainers that have cleared the return window and held quality.'
        ]
      },
      {
        id: 'fulfillment-filters',
        title: 'Fulfillment Filters',
        summary: 'Filters make it easy to isolate the exact set of leads or orders that need review.',
        bullets: [
          'Search Leads narrows results by client name or phone number.',
          'State filters focus the board on specific geographies.',
          'Orders filters drill into a single campaign.',
          'Stages filters isolate Signed Retainers, Returned Back, Dropped Retainers, or Successful Cases.'
        ]
      },
      {
        id: 'fulfillment-pipeline',
        title: 'Fulfillment Pipeline',
        summary: 'The board shows how durable signed cases are after intake hands them off to the firm.',
        bullets: [
          'Columns are organized as Signed Retainers, Returned Back, Dropped Retainers, and Successful Cases.',
          'This lets teams evaluate post-sign quality and campaign stickiness at a glance.',
          'Cards keep client and state context visible while the case moves through fulfillment outcomes.'
        ]
      },
      {
        id: 'fulfillment-refresh',
        title: 'Global Navigation and Refresh',
        summary: 'Because fulfillment changes as returns and approvals come in, refresh is an important control on this page.',
        bullets: [
          'Refresh updates counts, cards, and totals with the latest fulfillment movement.',
          'Use it whenever intake or fulfillment teams have just processed a batch of changes.'
        ]
      }
    ]
  },
  {
    id: 'invoicing',
    number: '05',
    title: 'Invoicing',
    icon: 'i-lucide-receipt',
    overview: 'Invoicing is the financial ledger for the portal. It tracks what is ready to bill, what has been issued, what has been paid, and what has moved into chargeback or dispute handling.',
    highlights: ['Financial summary cards', 'Board or list view', 'Role-aware filters'],
    subsections: [
      {
        id: 'invoicing-summary',
        title: 'Financial Summary Header',
        summary: 'The summary row provides the core accounting snapshot for the currently visible invoice portfolio.',
        bullets: [
          'Total Invoiced shows gross billed value.',
          'Billable shows approved revenue ready for invoice work.',
          'Pending shows invoices waiting for payment.',
          'Paid shows collected revenue.',
          'Chargeback tracks reversed or disputed funds.'
        ]
      },
      {
        id: 'invoicing-tools',
        title: 'Invoicing Tools and Display Controls',
        summary: 'Search, filters, and mode switching let teams work the page as either an operational board or a detailed ledger.',
        bullets: [
          'Search locates invoices by invoice ID or client name.',
          'Filters support status, date range, due date, state, and role-specific attorney or vendor criteria.',
          'The page can switch between Board and List views depending on preference.',
          'The controls support both lawyer invoicing and publisher invoicing workflows.'
        ]
      },
      {
        id: 'invoicing-board',
        title: 'Invoicing Pipeline',
        summary: 'Board view groups financial work into clear status columns so teams can see money movement instead of reading a flat list.',
        bullets: [
          'Columns are organized as Billable, Pending, Paid, and Chargeback.',
          'Billable can include qualified deals ready to convert into invoice work.',
          'Cards expose the key billing details needed for review and follow-up.',
          'When permissions allow it, users can mark invoices paid or initiate chargebacks.'
        ]
      },
      {
        id: 'invoicing-refresh',
        title: 'Global Controls',
        summary: 'Because payment status can change quickly, refresh is essential for keeping the displayed balance trustworthy.',
        bullets: [
          'Refresh re-syncs invoice state without requiring a full page reload.',
          'List view remains available for spreadsheet-style review when teams need denser scanning.'
        ]
      }
    ]
  },
  {
    id: 'product-offering',
    number: '06',
    title: 'Product Offering',
    icon: 'i-lucide-tag',
    overview: 'Product Offering explains how the portal packages case inventory into pricing tiers. It helps firms choose a lead quality profile that fits budget, litigation appetite, and documentation expectations.',
    highlights: ['Tiered pricing', 'Transparent criteria', 'Direct order handoff'],
    subsections: [
      {
        id: 'product-offering-tiers',
        title: 'Pricing Tiers',
        summary: 'The tier cards translate case quality into a simple pricing model that can be scanned and compared quickly.',
        bullets: [
          'Tier 1 Transfer focuses on older matters with lighter documentation requirements and lower pricing.',
          'Tier 2 Bronze covers mid-range recency with stronger documentation and moderate injury expectations.',
          'Tier 3 Silver emphasizes higher-intent matters with stronger liability signals.',
          'Tier 4 Gold represents the premium tier for the freshest and strongest consumer cases.',
          'Commercial offerings follow their own availability and pricing rules when enabled.'
        ]
      },
      {
        id: 'product-offering-criteria',
        title: 'Evaluation Criteria',
        summary: 'Each pricing card explains what drives case value so firms can understand why one tier costs more than another.',
        bullets: [
          'Accident Recency indicates how fresh the matter is.',
          'Liability shows how strong or accepted the claim appears.',
          'Type of Injury reflects medical severity and likely case value.',
          'Documentation captures how complete the supporting case file is.'
        ]
      },
      {
        id: 'product-offering-ordering',
        title: 'Place Order Workflow',
        summary: 'Product Offering is not just reference material. Each tier is also a launch point into the order workflow.',
        bullets: [
          'Every card includes a Place Order action.',
          'Clicking that button routes the user into the Order Map create-order flow.',
          'This handoff keeps pricing review and campaign creation closely connected for the buyer.'
        ]
      }
    ]
  }
]
