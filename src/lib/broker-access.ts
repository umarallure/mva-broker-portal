export const BROKER_SECTION_VALUES = [
  'dashboard',
  'order_map',
  'cases',
  'invoicing',
  'attorneys',
  'task_assignment',
  'settings'
] as const

export type BrokerSection = (typeof BROKER_SECTION_VALUES)[number]

export type BrokerWorkspaceContext = {
  broker_id: string
  allowed_sections: BrokerSection[]
  is_owner: boolean
}

export const BROKER_SECTION_OPTIONS = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Order Map', value: 'order_map' },
  { label: 'My Cases', value: 'cases' },
  { label: 'Invoicing', value: 'invoicing' },
  { label: 'My Attorneys', value: 'attorneys' },
  { label: 'Task Assignment', value: 'task_assignment' },
  { label: 'Settings', value: 'settings' }
] satisfies Array<{ label: string; value: BrokerSection }>

export const BROKER_SECTION_PATHS: Record<BrokerSection, string> = {
  dashboard: '/dashboard',
  order_map: '/intake-map',
  cases: '/retainers',
  invoicing: '/invoicing/lawyer',
  attorneys: '/attorneys',
  task_assignment: '/task-management',
  settings: '/settings/broker-profile'
}

export const getFirstBrokerSectionPath = (sections: ReadonlyArray<BrokerSection>) => {
  const firstAllowed = BROKER_SECTION_VALUES.find(section => sections.includes(section))
  return firstAllowed ? BROKER_SECTION_PATHS[firstAllowed] : '/login'
}
