export type GuideComponent = {
  label: string
  icon: string
  description: string
}

export type GuideSubsection = {
  id: string
  title: string
  summary: string
  bullets: string[]
  note?: string
  components?: GuideComponent[]
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
    overview: 'The Dashboard is the portal\'s command center. It combines top-line retainers, order activity, invoice momentum, and recent work so firms can understand performance before opening deeper workflow pages.',
    highlights: ['4 KPI cards', '6-month invoice trend', 'Quick actions & workbench'],
    subsections: [
      {
        id: 'dashboard-kpi-header',
        title: 'Summary KPI Header',
        summary: 'Four KPI cards surface the most important operating numbers as soon as the page loads.',
        bullets: [
          'Retainers routes into My Cases from the dashboard.',
          'Active Orders shows the current campaign count plus overall fulfillment progress.',
          'Total Invoiced splits paid dollars from pending dollars inside the card.',
          'Pending Invoices gives a fast count of invoice work that still needs review.'
        ],
        components: [
          {
            label: 'Retainers card',
            icon: 'i-lucide-briefcase',
            description: 'Shows the current retainer count and opens My Cases.'
          },
          {
            label: 'Active Orders card',
            icon: 'i-lucide-shopping-cart',
            description: 'Summarizes open campaigns and displays fulfillment progress.'
          },
          {
            label: 'Total Invoiced card',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Rolls up billed revenue with paid and pending amounts.'
          },
          {
            label: 'Pending Invoices card',
            icon: 'i-lucide-clock',
            description: 'Highlights invoices awaiting follow-up and links into invoicing.'
          }
        ]
      },
      {
        id: 'dashboard-invoice-trend',
        title: 'Invoice Trend',
        summary: 'The main chart gives lawyers a rolling six-month view of billing performance.',
        bullets: [
          'The line and area chart plots total amount by month.',
          'A month-over-month badge compares the latest month against the prior month.',
          'Hover states expose a crosshair tooltip with both dollars and invoice count.',
          'The strip below the chart repeats each month\'s total and invoice volume.'
        ],
        components: [
          {
            label: 'Trend chart',
            icon: 'i-lucide-chart-spline',
            description: 'Plots the last six months of invoice totals.'
          },
          {
            label: 'Growth badge',
            icon: 'i-lucide-trending-up',
            description: 'Shows percentage movement versus the previous month.'
          },
          {
            label: 'Crosshair tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Reveals amount and invoice count for the hovered month.'
          },
          {
            label: 'Monthly strip',
            icon: 'i-lucide-calendar-range',
            description: 'Pins each month\'s amount and invoice count beneath the chart.'
          }
        ]
      },
      {
        id: 'dashboard-actions-breakdown',
        title: 'Quick Actions and Breakdown',
        summary: 'The right rail mixes fast shortcuts with a compact invoice-status snapshot.',
        bullets: [
          'Place New Order is always available and opens the Order Map create-order flow.',
          'Create Invoice appears only for admin and super-admin roles.',
          'Invoice Breakdown shows billable, pending, paid, and chargeback status totals.',
          'Order Fulfillment summarizes filled quota across the current order set.'
        ],
        components: [
          {
            label: 'Place New Order',
            icon: 'i-lucide-plus',
            description: 'Jumps straight to the order-creation flow from the dashboard.'
          },
          {
            label: 'Create Invoice',
            icon: 'i-lucide-receipt',
            description: 'Admin-only shortcut for creating a new invoice.'
          },
          {
            label: 'View Retainers',
            icon: 'i-lucide-briefcase',
            description: 'Shortcut that opens the My Cases page.'
          },
          {
            label: 'Invoice Breakdown',
            icon: 'i-lucide-chart-no-axes-column',
            description: 'Visualizes invoice volume across billable, pending, paid, and chargeback states.'
          },
          {
            label: 'Order Fulfillment bar',
            icon: 'i-lucide-chart-bar',
            description: 'Shows filled quota against total quota for active orders.'
          }
        ]
      },
      {
        id: 'dashboard-workbench',
        title: 'Tabbed Data Management',
        summary: 'The lower workbench rotates between recent retainers, orders, and invoices so teams can jump from summary to records quickly.',
        bullets: [
          'Each tab shows the five most recent rows or cards for that data set.',
          'Retainers displays recent clients, phone numbers, status, and linked invoice access when available.',
          'Orders shows case type, target state, quota progress, and expiry.',
          'Invoices shows invoice number, amount, date context, and status badges.'
        ],
        components: [
          {
            label: 'Retainers tab',
            icon: 'i-lucide-briefcase',
            description: 'Lists the newest retainer records from My Cases.'
          },
          {
            label: 'Orders tab',
            icon: 'i-lucide-shopping-cart',
            description: 'Highlights recent orders with quota and expiry progress.'
          },
          {
            label: 'Invoices tab',
            icon: 'i-lucide-receipt',
            description: 'Surfaces the latest invoice records and status labels.'
          },
          {
            label: 'See All action',
            icon: 'i-lucide-arrow-right',
            description: 'Routes to My Cases, Fulfillment, or Invoicing based on the active tab.'
          }
        ]
      }
    ]
  },
  {
    id: 'order-map',
    number: '02',
    title: 'Order Map',
    icon: 'i-lucide-map',
    overview: 'The Order Map is the portal\'s geographic control center. Lawyers use it to launch campaigns by state, inspect territory availability, and manage quota-based orders already in motion.',
    highlights: ['State-based territory map', '2-step order modal', 'Filterable My Orders table'],
    subsections: [
      {
        id: 'order-map-geography',
        title: 'Geographic Interface and Statistics',
        summary: 'The map card pairs order totals with color-coded territory feedback so lawyers can judge coverage at a glance.',
        bullets: [
          'The stats overlay reports Total, Open, Pending, and Completed orders.',
          'States turn green for open orders with no fills yet, yellow once fills begin, and red after fulfillment or expiry.',
          'Legend states also cover unavailable territories and manually blocked states.',
          'Hover tooltips show open-order counts, your quota, expiry, and warnings about capacity or state limits.'
        ],
        components: [
          {
            label: 'Stats overlay',
            icon: 'i-lucide-panels-top-left',
            description: 'Shows total, open, pending, and completed order counts.'
          },
          {
            label: 'Interactive map',
            icon: 'i-lucide-map',
            description: 'Color-codes states based on live order availability and progress.'
          },
          {
            label: 'Legend and map filter',
            icon: 'i-lucide-list-filter',
            description: 'Explains map colors and lets the user focus the territory view.'
          },
          {
            label: 'State tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Shows state-level order counts, quota details, and ordering warnings.'
          }
        ]
      },
      {
        id: 'order-map-create',
        title: 'Creating a New Order',
        summary: 'New campaigns launch through a guarded two-step modal that checks intent before collecting targeting details.',
        bullets: [
          'Step 1 requires the lawyer to type CONFIRM before the form opens.',
          'Step 2 captures state, case category, injury severity, liability, insurance, medical treatment, languages, exclusivity, quota, and expiration.',
          'Commercial ordering stays disabled while that category is paused, and blocked or limited states cannot be selected.',
          'Quota limits adjust by category and the order cannot be submitted while restrictions are active.'
        ],
        note: 'This workflow is the safest place to match campaign quality, geography, and quota before a financial commitment is made.',
        components: [
          {
            label: 'Create Order trigger',
            icon: 'i-lucide-plus',
            description: 'Opens the two-step order modal from the page header.'
          },
          {
            label: 'Verification gate',
            icon: 'i-lucide-shield-check',
            description: 'Requires CONFIRM before the order form can be used.'
          },
          {
            label: 'Criteria form',
            icon: 'i-lucide-sliders-horizontal',
            description: 'Captures case targeting, qualification, and exclusivity settings.'
          },
          {
            label: 'Quota and expiration',
            icon: 'i-lucide-hourglass',
            description: 'Defines order volume and how long the campaign can accept retainers.'
          },
          {
            label: 'Restriction alerts',
            icon: 'i-lucide-alert-triangle',
            description: 'Explains state limits, blocked states, and paused commercial ordering.'
          }
        ]
      },
      {
        id: 'order-map-manage-orders',
        title: 'Managing My Orders',
        summary: 'The My Orders table turns every campaign into a comparable operational row beneath the map.',
        bullets: [
          'Rows show order name, status, quota, progress, and expiry at the same time.',
          'Filters cover state, case category, injury severity, insurance, liability, medical treatment, expiration, and language.',
          'Each row opens the order detail page for deeper review.',
          'The footer keeps users oriented by reporting how many filtered rows are in view.'
        ],
        components: [
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Expands advanced order criteria without leaving the page.'
          },
          {
            label: 'Status column',
            icon: 'i-lucide-badge-check',
            description: 'Labels each order as Pending, In Progress, Completed, or Expired.'
          },
          {
            label: 'Quota chip',
            icon: 'i-lucide-hash',
            description: 'Shows filled cases against requested cases for each order.'
          },
          {
            label: 'Progress bar',
            icon: 'i-lucide-gauge',
            description: 'Translates quota completion into an easy-to-scan percentage.'
          },
          {
            label: 'Expiry column',
            icon: 'i-lucide-calendar-clock',
            description: 'Displays the cutoff date or no-expiry state for the order.'
          }
        ]
      }
    ]
  },
  {
    id: 'my-cases',
    number: '03',
    title: 'My Cases',
    icon: 'i-lucide-briefcase',
    overview: 'My Cases acts as the firm\'s daily review board for submitted retainers. It emphasizes stage movement, searchable customer records, and a fast way to open the underlying case details.',
    highlights: ['Kanban case pipeline', 'Search, date, and state filters', 'Confirmation-based stage moves'],
    subsections: [
      {
        id: 'my-cases-status-cards',
        title: 'Status Counter Cards',
        summary: 'The header cards show where the current book of retained cases is sitting in the review lifecycle.',
        bullets: [
          'New for Review counts cases that still need the first intake pass.',
          '24 Hour Approval surfaces the intermediate approval window.',
          'Approved shows retainers that cleared review and are ready for the next action.',
          'Rejected keeps a visible count of cases that were declined or disqualified.'
        ],
        components: [
          {
            label: 'New for Review',
            icon: 'i-lucide-user-plus',
            description: 'Counts retainers waiting for initial review.'
          },
          {
            label: '24 Hour Approval',
            icon: 'i-lucide-clock',
            description: 'Tracks cases currently in the approval window.'
          },
          {
            label: 'Approved',
            icon: 'i-lucide-check-circle',
            description: 'Shows the total number of reviewed and accepted retainers.'
          },
          {
            label: 'Rejected',
            icon: 'i-lucide-x-circle',
            description: 'Counts retainers that did not meet the firm\'s criteria.'
          }
        ]
      },
      {
        id: 'my-cases-filtering',
        title: 'Search and Filtering',
        summary: 'The toolbar keeps the board usable by combining search, date controls, and a shared filter drawer layout.',
        bullets: [
          'Search matches customer names, phone numbers, submission IDs, vendor names, attorney names, and state codes.',
          'The date selector supports presets plus a custom calendar range.',
          'State filtering is active inside the drawer, while the remaining criteria preserve the shared order-taxonomy layout.',
          'Reset all clears the search query, date selection, and active filter values in one step.'
        ],
        note: 'Today, the live narrowing is driven by search, date range, and state selections while the rest of the shared criteria layout is staged into the page.',
        components: [
          {
            label: 'Search bar',
            icon: 'i-lucide-search',
            description: 'Finds customers and related metadata without leaving the board.'
          },
          {
            label: 'Date range picker',
            icon: 'i-lucide-calendar-range',
            description: 'Filters cards by preset windows or a custom date span.'
          },
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Keeps advanced criteria available without crowding the default workspace.'
          },
          {
            label: 'Reset all',
            icon: 'i-lucide-rotate-ccw',
            description: 'Returns the board to its broadest view with one click.'
          }
        ]
      },
      {
        id: 'my-cases-pipeline',
        title: 'Pipeline Columns',
        summary: 'Each retained case appears as a card inside a four-column review flow that can be updated from the board.',
        bullets: [
          'Columns are organized as My Cases, 24 Hour Approval, Customer Approved, and Customer Rejected.',
          'Cards show initials, client name, phone number, sign date, and state code.',
          'Dragging a card opens a confirmation step before the status is written back.',
          'Clicking any card opens the retainer detail record for deeper case review.'
        ],
        components: [
          {
            label: 'My Cases column',
            icon: 'i-lucide-columns-2',
            description: 'The starting lane for newly submitted retainers.'
          },
          {
            label: '24 Hour Approval column',
            icon: 'i-lucide-hourglass',
            description: 'Holds cases being checked during the approval window.'
          },
          {
            label: 'Approved and Rejected columns',
            icon: 'i-lucide-arrow-right-left',
            description: 'Separate successful retainers from declined ones for cleaner follow-up.'
          },
          {
            label: 'Retainer card',
            icon: 'i-lucide-id-card',
            description: 'Packages the customer identity, date, and state into one draggable card.'
          },
          {
            label: 'Move confirmation',
            icon: 'i-lucide-message-square-warning',
            description: 'Confirms the stage change before the database status is updated.'
          }
        ]
      },
      {
        id: 'my-cases-refresh',
        title: 'Live Data Refresh',
        summary: 'Refresh reloads the board from the latest retainer sources without requiring a full browser refresh.',
        bullets: [
          'Use Refresh after intake has pushed new signings or review statuses have changed.',
          'The control preserves the board layout while reloading the underlying data.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Re-syncs the My Cases board with the latest retainer records.'
          }
        ]
      }
    ]
  },
  {
    id: 'fulfillment',
    number: '04',
    title: 'Fulfillment',
    icon: 'i-lucide-package',
    overview: 'Fulfillment tracks what happens after a retainer is signed. It helps firms watch return exposure, dropped matters, and successful outcomes across the orders they bought.',
    highlights: ['Performance header', 'State/order/stage filters', 'Drag-and-drop outcome board'],
    subsections: [
      {
        id: 'fulfillment-performance',
        title: 'Fulfillment Performance Header',
        summary: 'Five top cards summarize outcome quality across the order portfolio before the board is opened.',
        bullets: [
          'Total Orders counts the active campaigns currently feeding fulfillment.',
          'Signed Retainers shows how many retained leads are in scope.',
          'Returned Back highlights cases moved back during the 14-day window.',
          'Dropped and Successful keep unsuccessful and durable outcomes visible side by side.'
        ],
        components: [
          {
            label: 'Total Orders',
            icon: 'i-lucide-package',
            description: 'Counts the campaigns represented in the fulfillment board.'
          },
          {
            label: 'Signed Retainers',
            icon: 'i-lucide-check-circle',
            description: 'Shows how many retained leads are currently in scope.'
          },
          {
            label: 'Returned Back',
            icon: 'i-lucide-arrow-left-circle',
            description: 'Tracks cases sent back during the 14-day return period.'
          },
          {
            label: 'Dropped Retainers',
            icon: 'i-lucide-x-circle',
            description: 'Counts matters that did not progress successfully.'
          },
          {
            label: 'Successful Cases',
            icon: 'i-lucide-trophy',
            description: 'Shows cases that cleared the return window and stayed valid.'
          }
        ]
      },
      {
        id: 'fulfillment-filters',
        title: 'Fulfillment Filters',
        summary: 'The toolbar narrows the board by person, geography, order type, and outcome stage.',
        bullets: [
          'Search matches client name, phone number, ID, status, state, and case type.',
          'State filtering supports a multi-select All States pattern.',
          'Orders currently switches between All Orders, Consumer Cases, and Commercial Cases.',
          'Stages filters the board to a specific fulfillment outcome when needed.'
        ],
        components: [
          {
            label: 'Search Leads',
            icon: 'i-lucide-search',
            description: 'Finds a lead quickly by name, phone, or related metadata.'
          },
          {
            label: 'State filter',
            icon: 'i-lucide-map-pinned',
            description: 'Narrows the board to one or more geographies.'
          },
          {
            label: 'Orders filter',
            icon: 'i-lucide-clipboard-list',
            description: 'Switches the board between all, consumer, and commercial order groups.'
          },
          {
            label: 'Stages filter',
            icon: 'i-lucide-columns-4',
            description: 'Limits the visible cards to one fulfillment stage at a time.'
          },
          {
            label: 'Reset all',
            icon: 'i-lucide-rotate-ccw',
            description: 'Clears every active fulfillment filter in one click.'
          }
        ]
      },
      {
        id: 'fulfillment-pipeline',
        title: 'Fulfillment Pipeline',
        summary: 'The board shows how durable signed cases are by moving them through four fulfillment outcomes.',
        bullets: [
          'Columns are Signed Retainers, Returned Back, Dropped Retainers, and Successful Cases.',
          'Cards show client name, phone, state, date, optional reason text, and signed date when present.',
          'Drag and drop updates the case outcome directly from the board.',
          'Empty columns show a No Retainers state so gaps are obvious immediately.'
        ],
        components: [
          {
            label: 'Signed Retainers lane',
            icon: 'i-lucide-check-check',
            description: 'The entry lane for retained leads still being monitored.'
          },
          {
            label: 'Returned Back lane',
            icon: 'i-lucide-undo-2',
            description: 'Captures cases sent back during the refund or replacement window.'
          },
          {
            label: 'Dropped Retainers lane',
            icon: 'i-lucide-circle-off',
            description: 'Separates signed but unsuccessful matters from successful ones.'
          },
          {
            label: 'Successful Cases lane',
            icon: 'i-lucide-award',
            description: 'Highlights cases that held quality after review.'
          },
          {
            label: 'Fulfillment card',
            icon: 'i-lucide-contact',
            description: 'Packages the client, state, date, and outcome context into one draggable record.'
          }
        ]
      },
      {
        id: 'fulfillment-refresh',
        title: 'Global Navigation and Refresh',
        summary: 'Because fulfillment statuses can move quickly, refresh is the fastest way to trust the board again after new processing.',
        bullets: [
          'Refresh reloads counts and cards without leaving the page.',
          'The header keeps the action available even while the rest of the board is in view.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Reloads the fulfillment metrics and board in place.'
          }
        ]
      }
    ]
  },
  {
    id: 'invoicing',
    number: '05',
    title: 'Invoicing',
    icon: 'i-lucide-receipt',
    overview: 'Invoicing is the portal\'s financial ledger. It tracks what is ready to bill, what is pending payment, what has been paid, and what has moved into chargeback handling.',
    highlights: ['Financial summary cards', 'Board or list view', 'Role-aware filters'],
    subsections: [
      {
        id: 'invoicing-summary',
        title: 'Financial Summary Header',
        summary: 'The first row condenses the visible invoice portfolio into five financial totals.',
        bullets: [
          'Total Invoiced rolls up every invoice amount in the current portfolio.',
          'Billable represents invoice-ready value in the main lawyer flow.',
          'Pending, Paid, and Chargeback show the money currently in those buckets.',
          'These cards refresh with the page data and stay aligned to the visible mode.'
        ],
        components: [
          {
            label: 'Total Invoiced',
            icon: 'i-lucide-receipt',
            description: 'Shows the gross invoiced amount across the loaded records.'
          },
          {
            label: 'Billable',
            icon: 'i-lucide-file-check',
            description: 'Tracks revenue that is ready for billing work.'
          },
          {
            label: 'Pending',
            icon: 'i-lucide-clock',
            description: 'Shows invoice value that is still waiting on payment or review.'
          },
          {
            label: 'Paid',
            icon: 'i-lucide-check-circle',
            description: 'Totals funds that have already been collected.'
          },
          {
            label: 'Chargeback',
            icon: 'i-lucide-alert-circle',
            description: 'Highlights disputed or reversed invoice value.'
          }
        ]
      },
      {
        id: 'invoicing-tools',
        title: 'Invoicing Tools and Display Controls',
        summary: 'The toolbar gives teams search, date, filter, and layout controls without leaving the ledger.',
        bullets: [
          'Search scans invoice number, party names, lead names, line-item descriptions, and notes.',
          'Date presets and a custom calendar range help narrow the billing period under review.',
          'The filter drawer supports statuses, due dates, states in lawyer mode, and attorney or vendor selection for broader roles.',
          'Board and List toggles switch the presentation while keeping the same underlying result set.'
        ],
        components: [
          {
            label: 'Search invoices',
            icon: 'i-lucide-search',
            description: 'Finds invoices by ID, names, descriptions, and notes.'
          },
          {
            label: 'Date range picker',
            icon: 'i-lucide-calendar-range',
            description: 'Filters invoice history by preset or custom windows.'
          },
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Surfaces status, due-date, geography, and party filters.'
          },
          {
            label: 'Board/List toggle',
            icon: 'i-lucide-panel-top',
            description: 'Lets the user swap between kanban and tabular invoice views.'
          },
          {
            label: 'Create Invoice',
            icon: 'i-lucide-plus',
            description: 'Admin-enabled action for starting a new invoice record.'
          }
        ]
      },
      {
        id: 'invoicing-board',
        title: 'Invoicing Pipeline',
        summary: 'Board view groups invoice work into status columns so money movement is visible without reading a flat ledger.',
        bullets: [
          'Columns are Billable, Pending, Paid, and Chargeback in the lawyer flow.',
          'The billable side can also surface ready-to-invoice deal cards before a formal invoice is created.',
          'Invoice cards show the invoice number, amount, due date, billing period, item count, and party context.',
          'Pending cards expose mark-paid actions, while paid cards can move into chargeback handling.'
        ],
        components: [
          {
            label: 'Billable column',
            icon: 'i-lucide-file-plus',
            description: 'Holds invoice-ready work before it is fully collected.'
          },
          {
            label: 'Pending column',
            icon: 'i-lucide-hourglass',
            description: 'Shows invoices that have been issued and still need payment progress.'
          },
          {
            label: 'Paid column',
            icon: 'i-lucide-badge-dollar-sign',
            description: 'Keeps completed invoice collections visible in one place.'
          },
          {
            label: 'Chargeback column',
            icon: 'i-lucide-badge-alert',
            description: 'Tracks invoices that have entered dispute or reversal handling.'
          },
          {
            label: 'Ready deal card',
            icon: 'i-lucide-file-check-2',
            description: 'Shows qualified billing candidates that can be converted into invoices.'
          },
          {
            label: 'Invoice card actions',
            icon: 'i-lucide-hand-coins',
            description: 'Provides quick actions like Mark as Paid, Chargeback, Edit, and PDF.'
          }
        ]
      },
      {
        id: 'invoicing-refresh',
        title: 'Global Controls',
        summary: 'Refresh and list mode keep the invoice ledger trustworthy even when statuses are changing quickly.',
        bullets: [
          'Refresh reloads invoice data without a full page reload.',
          'List view adds sticky table headers and pagination for denser financial review.',
          'Pagination helps teams scan large invoice sets without losing the current filters.'
        ],
        components: [
          {
            label: 'Refresh button',
            icon: 'i-lucide-refresh-cw',
            description: 'Re-syncs the ledger with the latest invoice state.'
          },
          {
            label: 'List view table',
            icon: 'i-lucide-table-properties',
            description: 'Presents invoices in a denser spreadsheet-style layout.'
          },
          {
            label: 'Pagination',
            icon: 'i-lucide-chevrons-left-right',
            description: 'Moves through long invoice result sets without losing context.'
          }
        ]
      }
    ]
  },
  {
    id: 'product-offering',
    number: '06',
    title: 'Product Offering',
    icon: 'i-lucide-tag',
    overview: 'Product Offering explains how the portal packages case inventory into pricing tiers. It helps firms compare lead quality signals before handing off into the ordering workflow.',
    highlights: ['Consumer/commercial toggle', 'Tier comparison cards', 'Direct order handoff'],
    subsections: [
      {
        id: 'product-offering-tiers',
        title: 'Pricing Tiers',
        summary: 'The page compares consumer and commercial offerings through pricing cards that translate case quality into buying options.',
        bullets: [
          'Consumer mode shows Tier 1 Transfer, Tier 2 Bronze, Tier 3 Silver, and Tier 4 Gold.',
          'Each card combines a price-per-case headline with four comparison rows.',
          'Commercial mode collapses to a single commercial card.',
          'A paused-order notice appears whenever the commercial category is selected.'
        ],
        components: [
          {
            label: 'Category toggle',
            icon: 'i-lucide-arrow-left-right',
            description: 'Switches the page between consumer and commercial offerings.'
          },
          {
            label: 'Tier 1 Transfer',
            icon: 'i-lucide-circle',
            description: 'The entry-level consumer tier with the lowest case price.'
          },
          {
            label: 'Tier 2 Bronze',
            icon: 'i-lucide-medal',
            description: 'Mid-range consumer pricing with stronger quality criteria.'
          },
          {
            label: 'Tier 3 Silver',
            icon: 'i-lucide-badge',
            description: 'Higher-intent consumer tier with stronger documentation expectations.'
          },
          {
            label: 'Tier 4 Gold',
            icon: 'i-lucide-award',
            description: 'The premium consumer tier for the freshest and strongest cases.'
          },
          {
            label: 'Commercial card',
            icon: 'i-lucide-truck',
            description: 'The commercial offering card shown when the category is switched.'
          }
        ]
      },
      {
        id: 'product-offering-criteria',
        title: 'Evaluation Criteria',
        summary: 'Every tier card uses the same four criteria so firms can compare value consistently across the catalog.',
        bullets: [
          'Accident Occurred sets the recency expectation for that tier.',
          'Type of Injury frames the expected severity range.',
          'Documentation explains how complete the supporting file should be.',
          'Liability captures how strong the claim should be before purchase.'
        ],
        components: [
          {
            label: 'Accident Occurred',
            icon: 'i-lucide-calendar-clock',
            description: 'Shows how recent the qualifying incident should be.'
          },
          {
            label: 'Type of Injury',
            icon: 'i-lucide-heart-pulse',
            description: 'Describes the medical severity expected for the tier.'
          },
          {
            label: 'Documentation',
            icon: 'i-lucide-file-check',
            description: 'Lists the level of proof or paperwork expected with the case.'
          },
          {
            label: 'Liability',
            icon: 'i-lucide-scale',
            description: 'Signals how strong or accepted the claim should be.'
          }
        ]
      },
      {
        id: 'product-offering-ordering',
        title: 'Place Order Workflow',
        summary: 'Product Offering is not just pricing reference material. Each active card can hand the buyer into the ordering flow.',
        bullets: [
          'Every active card includes a Place Order button.',
          'That action routes into the Order Map create-order flow.',
          'Commercial ordering is currently disabled while the paused notice is active.',
          'The current handoff opens order creation but does not yet auto-fill tier-specific criteria.'
        ],
        note: 'The live product currently opens the create-order flow from Product Offering without preloading the tier\'s filters into the form.',
        components: [
          {
            label: 'Place Order button',
            icon: 'i-lucide-arrow-right',
            description: 'Hands the user into the order-creation workflow from a pricing card.'
          },
          {
            label: 'Commercial paused notice',
            icon: 'i-lucide-info',
            description: 'Explains why the commercial action is disabled right now.'
          },
          {
            label: 'Order Map handoff',
            icon: 'i-lucide-map-pinned',
            description: 'Routes the user to Order Map with the create-order action open.'
          }
        ]
      }
    ]
  }
]
