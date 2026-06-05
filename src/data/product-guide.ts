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
    id: 'broker-dashboard',
    number: '01',
    title: 'Dashboard',
    icon: 'i-lucide-layout-dashboard',
    overview: 'The Dashboard is the broker workspace command center. It rolls up retainers, order activity, and invoice momentum so brokers can read overall performance before opening the deeper workflow pages.',
    highlights: ['Top-line KPI cards', 'Invoice trend chart', 'Recent activity workbench'],
    subsections: [
      {
        id: 'broker-dashboard-kpi-header',
        title: 'Summary KPI Header',
        summary: 'The KPI cards surface the broker book\'s most important operating numbers as soon as the page loads.',
        bullets: [
          'Retainers links into My Cases for the current book of business.',
          'Active Orders shows open campaigns and overall order progress.',
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
            description: 'Summarizes open campaigns and displays quota progress.'
          },
          {
            label: 'Total Invoiced card',
            icon: 'i-lucide-circle-dollar-sign',
            description: 'Rolls up billed revenue with paid and pending amounts.'
          },
          {
            label: 'Pending Invoices card',
            icon: 'i-lucide-clock',
            description: 'Highlights invoices awaiting follow-up and links into Invoicing.'
          }
        ]
      },
      {
        id: 'broker-dashboard-invoice-trend',
        title: 'Invoice Trend',
        summary: 'The main chart gives brokers a rolling multi-month view of billing performance.',
        bullets: [
          'The line and area chart plots total invoiced amount by month.',
          'A month-over-month badge compares the latest month against the prior month.',
          'Hover states expose a tooltip with both dollars and invoice count.',
          'The strip below the chart repeats each month\'s total and invoice volume.'
        ],
        components: [
          {
            label: 'Trend chart',
            icon: 'i-lucide-chart-spline',
            description: 'Plots recent months of invoice totals.'
          },
          {
            label: 'Growth badge',
            icon: 'i-lucide-trending-up',
            description: 'Shows percentage movement versus the previous month.'
          },
          {
            label: 'Monthly strip',
            icon: 'i-lucide-calendar-range',
            description: 'Pins each month\'s amount and invoice count beneath the chart.'
          }
        ]
      },
      {
        id: 'broker-dashboard-workbench',
        title: 'Recent Activity Workbench',
        summary: 'The lower workbench rotates between recent retainers, orders, and invoices so brokers can jump from summary to records quickly.',
        bullets: [
          'Each tab shows the most recent rows for that data set.',
          'Retainers displays recent clients, status, and linked invoice access when available.',
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
          }
        ]
      }
    ]
  },
  {
    id: 'broker-order-map',
    number: '02',
    title: 'Order Map',
    icon: 'i-lucide-map',
    overview: 'The Order Map is the geographic control center for launching campaigns. Brokers use it to open orders by state, inspect territory availability, and manage quota-based orders already in motion.',
    highlights: ['State-based territory map', 'Guided order creation', 'Filterable My Orders table'],
    subsections: [
      {
        id: 'broker-order-map-geography',
        title: 'Geographic Interface and Statistics',
        summary: 'The map card pairs order totals with color-coded territory feedback so brokers can judge coverage at a glance.',
        bullets: [
          'The stats overlay reports Total, Open, Pending, and Completed orders.',
          'States are color-coded by live order availability and fill progress.',
          'The legend covers open, in-progress, completed, unavailable, and blocked states.',
          'Hover tooltips show open-order counts, quota, expiry, and capacity warnings.'
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
            label: 'State tooltip',
            icon: 'i-lucide-mouse-pointer-click',
            description: 'Shows state-level order counts, quota details, and ordering warnings.'
          }
        ]
      },
      {
        id: 'broker-order-map-create',
        title: 'Creating a New Order',
        summary: 'New campaigns launch through a guided modal that confirms intent before collecting targeting details.',
        bullets: [
          'A verification step guards order creation before the form opens.',
          'The form captures state, case category, qualification criteria, exclusivity, quota, and expiration.',
          'Blocked or limited states cannot be selected, and quota limits adjust by category.',
          'The order cannot be submitted while restrictions are active.'
        ],
        note: 'This workflow is the safest place to match campaign quality, geography, and quota before a financial commitment is made.',
        components: [
          {
            label: 'Create Order trigger',
            icon: 'i-lucide-plus',
            description: 'Opens the order modal from the page header.'
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
          }
        ]
      },
      {
        id: 'broker-order-map-manage-orders',
        title: 'Managing Orders',
        summary: 'The orders table turns every campaign into a comparable operational row beneath the map.',
        bullets: [
          'Rows show order name, status, quota, progress, and expiry at the same time.',
          'Filters cover state, case category, qualification criteria, and expiration.',
          'Each row opens the order detail page for deeper review.',
          'The footer reports how many filtered rows are currently in view.'
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
            label: 'Progress bar',
            icon: 'i-lucide-gauge',
            description: 'Translates quota completion into an easy-to-scan percentage.'
          }
        ]
      }
    ]
  },
  {
    id: 'broker-my-cases',
    number: '03',
    title: 'My Cases',
    icon: 'i-lucide-briefcase',
    overview: 'My Cases is the daily review board for submitted retainers. It emphasizes stage movement, searchable customer records, and a fast way to open the underlying case details.',
    highlights: ['Kanban case pipeline', 'Search and date filters', 'Confirmation-based stage moves'],
    subsections: [
      {
        id: 'broker-my-cases-status-cards',
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
            label: 'Approved',
            icon: 'i-lucide-check-circle',
            description: 'Shows the total number of reviewed and accepted retainers.'
          },
          {
            label: 'Rejected',
            icon: 'i-lucide-x-circle',
            description: 'Counts retainers that did not meet the review criteria.'
          }
        ]
      },
      {
        id: 'broker-my-cases-pipeline',
        title: 'Pipeline Columns',
        summary: 'Each retained case appears as a card inside a review flow that can be updated from the board.',
        bullets: [
          'Columns separate new cases, the approval window, approved, and rejected work.',
          'Cards show initials, client name, phone number, sign date, and state code.',
          'Dragging a card opens a confirmation step before the status is written back.',
          'Clicking any card opens the retainer detail record for deeper case review.'
        ],
        components: [
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
        id: 'broker-my-cases-filtering',
        title: 'Search and Filtering',
        summary: 'The toolbar keeps the board usable by combining search, date controls, and a filter drawer.',
        bullets: [
          'Search matches customer names, phone numbers, submission IDs, and state codes.',
          'The date selector supports presets plus a custom calendar range.',
          'State and case filters narrow the board to a focused subset.',
          'Reset all clears search, date, and active filter values in one step.'
        ],
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
            label: 'Reset all',
            icon: 'i-lucide-rotate-ccw',
            description: 'Returns the board to its broadest view with one click.'
          }
        ]
      }
    ]
  },
  {
    id: 'broker-attorneys',
    number: '04',
    title: 'My Attorneys',
    icon: 'i-lucide-scale',
    overview: 'My Attorneys is where brokers manage the law firms they place cases with. It keeps attorney records, contact details, and engagement information in one organized directory.',
    highlights: ['Attorney directory', 'Detail profiles', 'Searchable records'],
    subsections: [
      {
        id: 'broker-attorneys-directory',
        title: 'Attorney Directory',
        summary: 'The directory lists every attorney relationship the broker manages with the key details visible at a glance.',
        bullets: [
          'Each row summarizes the attorney or firm and its current engagement status.',
          'Search helps locate a specific firm without scrolling the full list.',
          'Selecting a record opens the full attorney detail page.',
          'The directory is the starting point for reviewing and updating attorney relationships.'
        ],
        components: [
          {
            label: 'Attorney list',
            icon: 'i-lucide-list',
            description: 'Shows all managed attorney relationships in one place.'
          },
          {
            label: 'Search bar',
            icon: 'i-lucide-search',
            description: 'Finds a specific attorney or firm quickly.'
          }
        ]
      },
      {
        id: 'broker-attorneys-details',
        title: 'Attorney Details',
        summary: 'The detail page holds the full profile and contact information for a single attorney relationship.',
        bullets: [
          'Profile fields capture firm identity and contact details.',
          'Details can be reviewed and kept current as the relationship evolves.',
          'The page links the attorney back to the cases and invoicing they relate to.'
        ],
        components: [
          {
            label: 'Profile fields',
            icon: 'i-lucide-id-card',
            description: 'Stores the attorney or firm identity and contact details.'
          }
        ]
      }
    ]
  },
  {
    id: 'broker-invoicing',
    number: '05',
    title: 'Invoicing',
    icon: 'i-lucide-receipt',
    overview: 'Invoicing is the financial ledger. It tracks what is ready to bill, what is pending payment, what has been paid, and what has moved into chargeback handling.',
    highlights: ['Financial summary cards', 'Board or list view', 'Filterable invoice records'],
    subsections: [
      {
        id: 'broker-invoicing-summary',
        title: 'Financial Summary Header',
        summary: 'The first row condenses the visible invoice portfolio into top-line financial totals.',
        bullets: [
          'Total Invoiced rolls up every invoice amount in the current portfolio.',
          'Billable represents invoice-ready value in the main flow.',
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
        id: 'broker-invoicing-tools',
        title: 'Tools and Display Controls',
        summary: 'The toolbar gives brokers search, date, filter, and layout controls without leaving the ledger.',
        bullets: [
          'Search scans invoice number, party names, line-item descriptions, and notes.',
          'Date presets and a custom calendar range narrow the billing period under review.',
          'The filter drawer supports statuses, due dates, and attorney selection.',
          'Board and List toggles switch the presentation while keeping the same result set.'
        ],
        components: [
          {
            label: 'Search invoices',
            icon: 'i-lucide-search',
            description: 'Finds invoices by ID, names, descriptions, and notes.'
          },
          {
            label: 'Filters drawer',
            icon: 'i-lucide-filter',
            description: 'Surfaces status, due-date, and party filters.'
          },
          {
            label: 'Board/List toggle',
            icon: 'i-lucide-panel-top',
            description: 'Lets the user swap between kanban and tabular invoice views.'
          }
        ]
      },
      {
        id: 'broker-invoicing-board',
        title: 'Invoicing Pipeline',
        summary: 'Board view groups invoice work into status columns so money movement is visible without reading a flat ledger.',
        bullets: [
          'Columns are Billable, Pending, Paid, and Chargeback.',
          'Invoice cards show the invoice number, amount, due date, billing period, and party context.',
          'Pending cards expose mark-paid actions, while paid cards can move into chargeback handling.',
          'Create Invoice is available to admin and super-admin roles.'
        ],
        components: [
          {
            label: 'Pipeline columns',
            icon: 'i-lucide-columns-3',
            description: 'Separates billable, pending, paid, and chargeback invoices.'
          },
          {
            label: 'Invoice card actions',
            icon: 'i-lucide-hand-coins',
            description: 'Provides quick actions like Mark as Paid, Chargeback, Edit, and PDF.'
          }
        ]
      }
    ]
  },
  {
    id: 'broker-task-assignment',
    number: '06',
    title: 'Task Assignment',
    icon: 'i-lucide-list-checks',
    overview: 'Task Assignment is where broker teams coordinate work. It turns follow-ups into assignable tasks with owners and deadlines so nothing slips between intake, cases, and invoicing.',
    highlights: ['Assignable tasks', 'Owners and deadlines', 'Status tracking'],
    subsections: [
      {
        id: 'broker-task-assignment-board',
        title: 'Task Board',
        summary: 'The board collects the team\'s open work and shows who owns each task and when it is due.',
        bullets: [
          'Tasks carry an owner, a deadline, and a current status.',
          'Work can be reviewed by assignee so each team member sees their own queue.',
          'Updating a task keeps the rest of the team aligned on progress.'
        ],
        components: [
          {
            label: 'Task list',
            icon: 'i-lucide-list-checks',
            description: 'Shows open tasks with owners and deadlines.'
          },
          {
            label: 'Status labels',
            icon: 'i-lucide-badge-check',
            description: 'Mark where each task sits in its lifecycle.'
          }
        ]
      },
      {
        id: 'broker-task-assignment-create',
        title: 'Creating and Assigning Tasks',
        summary: 'New tasks capture what needs to happen, who owns it, and when it is due.',
        bullets: [
          'Create a task and assign it to a team member.',
          'Set a deadline so the work stays visible until it is complete.',
          'Reassign or update tasks as priorities shift.'
        ],
        components: [
          {
            label: 'Create task',
            icon: 'i-lucide-plus',
            description: 'Adds a new task to the team queue.'
          },
          {
            label: 'Assignee selector',
            icon: 'i-lucide-user-check',
            description: 'Routes a task to the responsible team member.'
          }
        ]
      }
    ]
  },
  {
    id: 'broker-settings',
    number: '07',
    title: 'Settings',
    icon: 'i-lucide-settings',
    overview: 'Settings is where brokers manage their own profile and their team. It controls the broker\'s identity in the portal and the access granted to team members.',
    highlights: ['Broker profile', 'Team management', 'Section access control'],
    subsections: [
      {
        id: 'broker-settings-broker-profile',
        title: 'Broker Profile',
        summary: 'The broker profile holds the firm\'s identity and core account details used across the portal.',
        bullets: [
          'Update the broker\'s display name and contact details.',
          'These details represent the broker throughout the workspace.',
          'Keeping the profile current ensures records and invoices show the right information.'
        ],
        components: [
          {
            label: 'Profile fields',
            icon: 'i-lucide-briefcase',
            description: 'Stores the broker\'s identity and account details.'
          }
        ]
      },
      {
        id: 'broker-settings-team-profile',
        title: 'Team Profile',
        summary: 'Team Profile is where the broker owner manages team members and the sections each can access.',
        bullets: [
          'Invite or manage broker team members from one place.',
          'Grant each member access to specific sections of the portal.',
          'Access control keeps members focused on the areas relevant to their role.'
        ],
        note: 'Section access is granted per team member, so members only see the parts of the portal they are assigned.',
        components: [
          {
            label: 'Team member list',
            icon: 'i-lucide-users-round',
            description: 'Shows the broker\'s team members and their access.'
          },
          {
            label: 'Section access',
            icon: 'i-lucide-shield-check',
            description: 'Controls which sections each team member can open.'
          }
        ]
      }
    ]
  }
]
