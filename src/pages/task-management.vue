<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed'
type TaskPriority = 'low' | 'medium' | 'high'
type TaskViewMode = 'list' | 'kanban'

type CloserTaskRow = {
  id: string
  title: string
  description: string | null
  lead_id: string | null
  lead_reference: string | null
  assignee_user_id: string
  assignee_name: string
  created_by: string
  created_by_name: string
  created_by_role: string | null
  status: TaskStatus
  priority: TaskPriority
  tags: string[] | null
  assigned_date: string
  deadline_date: string
  completed_at: string | null
  created_at: string
  updated_at: string
  broker_task_group_id: string | null
  assignment_scope: string | null
  lead_name?: string | null
  lead_phone_number?: string | null
}

type CloserTaskNote = {
  id: string
  task_id: string
  author_user_id: string | null
  author_name: string
  content: string
  created_at: string
}

type LeadOption = {
  id: string
  reference: string
  customerName: string
  phoneNumber: string | null
}

type TaskGroup = {
  key: string
  taskIds: string[]
  title: string
  description: string | null
  leadId: string | null
  leadReference: string | null
  leadName: string | null
  leadPhoneNumber: string | null
  priority: TaskPriority
  tags: string[]
  assignedDate: string
  deadlineDate: string
  createdAt: string
  updatedAt: string
  createdByName: string
  assigneeNames: string[]
  assignmentCount: number
  statusCounts: Record<TaskStatus, number>
  stage: TaskStatus
}

const TASK_STATUS_META: Record<TaskStatus, { label: string; icon: string; badgeClass: string; columnClass: string }> = {
  waiting: {
    label: 'Pending',
    icon: 'i-lucide-clock-3',
    badgeClass: 'border-amber-300/70 bg-amber-100/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200',
    columnClass: 'from-amber-500/[0.12] via-amber-500/[0.04]'
  },
  todo: {
    label: 'To Do',
    icon: 'i-lucide-circle',
    badgeClass: 'border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-200',
    columnClass: 'from-slate-500/[0.12] via-slate-500/[0.04]'
  },
  in_progress: {
    label: 'In Progress',
    icon: 'i-lucide-loader-circle',
    badgeClass: 'border-sky-300/70 bg-sky-100/80 text-sky-700 dark:border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-200',
    columnClass: 'from-sky-500/[0.12] via-sky-500/[0.04]'
  },
  completed: {
    label: 'Completed',
    icon: 'i-lucide-check-circle-2',
    badgeClass: 'border-emerald-300/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    columnClass: 'from-emerald-500/[0.12] via-emerald-500/[0.04]'
  }
}

const TASK_PRIORITY_META: Record<TaskPriority, { label: string; railClass: string; badgeClass: string; cardAccent: string }> = {
  high: {
    label: 'High Priority',
    railClass: 'bg-rose-500/80',
    badgeClass: 'border-rose-300/70 bg-rose-100/80 text-rose-700 dark:border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-200',
    cardAccent: 'border-rose-500/25 hover:border-rose-400/55'
  },
  medium: {
    label: 'Medium Priority',
    railClass: 'bg-amber-500/80',
    badgeClass: 'border-amber-300/70 bg-amber-100/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200',
    cardAccent: 'border-amber-500/25 hover:border-amber-400/55'
  },
  low: {
    label: 'Low Priority',
    railClass: 'bg-emerald-500/75',
    badgeClass: 'border-emerald-300/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    cardAccent: 'border-emerald-500/20 hover:border-emerald-400/45'
  }
}

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'waiting', label: 'Pending' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }
]

const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority | 'all'; label: string }> = [
  { value: 'all', label: 'All Priorities' },
  { value: 'high', label: 'High Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'low', label: 'Low Priority' }
]

const TASK_TAG_OPTIONS = [
  { value: 'callback', label: 'Callback' },
  { value: 'resend', label: 'Resend' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'documents', label: 'Documents' },
  { value: 'quote', label: 'Quote' },
  { value: 'other', label: 'Other' }
]

const KANBAN_COLUMNS: TaskStatus[] = ['waiting', 'todo', 'in_progress', 'completed']
const NO_LEAD = '__none__'

const auth = useAuth()
const toast = useToast()

const loading = ref(true)
const refreshing = ref(false)
const saving = ref(false)
const tasks = ref<CloserTaskRow[]>([])
const leadOptions = ref<LeadOption[]>([])

const searchTerm = ref('')
const statusFilter = ref<TaskStatus | 'all'>('all')
const priorityFilter = ref<TaskPriority | 'all'>('all')
const taskViewMode = ref<TaskViewMode>('list')
const leadSearch = ref('')

const createOpen = ref(false)
const detailOpen = ref(false)
const selectedGroupKey = ref<string | null>(null)
const notes = ref<CloserTaskNote[]>([])
const notesLoading = ref(false)
const noteDraft = ref('')
const noteSaving = ref(false)
const showLeadResults = ref(false)
const deadlineInputRef = ref<HTMLInputElement | null>(null)

const tomorrowKey = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return toDateKey(date)
}

const form = reactive({
  title: '',
  description: '',
  leadId: NO_LEAD,
  priority: 'medium' as TaskPriority,
  deadlineDate: tomorrowKey(),
  tags: [] as string[],
  note: ''
})

const todayKey = computed(() => toDateKey(new Date()))

function toDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string | null | undefined) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T00:00:00`)
}

function formatDate(value: string | null | undefined, output: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const parsed = parseDateKey(value)
  if (!parsed || Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('en-US', output)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatPhone(phone: string | null | undefined) {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return phone
}

function normalizeTags(value: string[] | null) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function formatTaskTag(value: string) {
  return TASK_TAG_OPTIONS.find(tag => tag.value === value)?.label
    ?? value.split('_').map(segment => segment.charAt(0).toUpperCase() + segment.slice(1)).join(' ')
}

function deriveStage(counts: Record<TaskStatus, number>, total: number): TaskStatus {
  if (total > 0 && counts.completed === total) return 'completed'
  if (counts.in_progress > 0) return 'in_progress'
  if (counts.waiting > 0) return 'waiting'
  return 'todo'
}

function isOpenTask(group: TaskGroup) {
  return group.stage !== 'completed'
}

function isOverdue(group: TaskGroup) {
  const deadline = parseDateKey(group.deadlineDate)
  const today = parseDateKey(todayKey.value)
  if (!deadline || !today || !isOpenTask(group)) return false
  return deadline.getTime() < today.getTime()
}

function deadlineSignal(group: TaskGroup) {
  const deadline = parseDateKey(group.deadlineDate)
  const today = parseDateKey(todayKey.value)
  if (!deadline || !today) return 'No deadline'

  if (group.stage === 'completed') return 'Completed'

  const msPerDay = 24 * 60 * 60 * 1000
  const diff = Math.round((deadline.getTime() - today.getTime()) / msPerDay)

  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  if (diff === -1) return '1 day overdue'
  if (diff < 0) return `${Math.abs(diff)} days overdue`
  return `Due in ${diff} days`
}

function statusSummary(group: TaskGroup) {
  if (group.assignmentCount <= 1) return TASK_STATUS_META[group.stage].label
  if (group.statusCounts.completed === group.assignmentCount) return 'All completed'
  if (group.statusCounts.completed > 0) return `${group.statusCounts.completed}/${group.assignmentCount} completed`
  return TASK_STATUS_META[group.stage].label
}

function assigneePreview(group: TaskGroup) {
  const visible = group.assigneeNames.slice(0, 3)
  const remaining = group.assignmentCount - visible.length
  return remaining > 0 ? `${visible.join(', ')} +${remaining}` : visible.join(', ')
}

function resetForm() {
  form.title = ''
  form.description = ''
  form.leadId = NO_LEAD
  form.priority = 'medium'
  form.deadlineDate = tomorrowKey()
  form.tags = []
  form.note = ''
  leadSearch.value = ''
  showLeadResults.value = false
}

function selectedLead() {
  if (form.leadId === NO_LEAD) return null
  return leadOptions.value.find(lead => lead.id === form.leadId) ?? null
}

const currentUserLabel = computed(() =>
  auth.state.value.profile?.display_name
  || auth.state.value.profile?.email
  || auth.state.value.user?.email
  || 'Broker'
)

const groupedTasks = computed<TaskGroup[]>(() => {
  const map = new Map<string, TaskGroup>()

  for (const task of tasks.value) {
    const key = task.broker_task_group_id ?? task.id
    const tags = normalizeTags(task.tags)
    const existing = map.get(key)

    if (!existing) {
      map.set(key, {
        key,
        taskIds: [task.id],
        title: task.title,
        description: task.description,
        leadId: task.lead_id,
        leadReference: task.lead_reference,
        leadName: task.lead_name ?? null,
        leadPhoneNumber: task.lead_phone_number ?? null,
        priority: task.priority,
        tags,
        assignedDate: task.assigned_date,
        deadlineDate: task.deadline_date,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        createdByName: task.created_by_name,
        assigneeNames: [task.assignee_name],
        assignmentCount: 1,
        statusCounts: {
          todo: task.status === 'todo' ? 1 : 0,
          in_progress: task.status === 'in_progress' ? 1 : 0,
          waiting: task.status === 'waiting' ? 1 : 0,
          completed: task.status === 'completed' ? 1 : 0
        },
        stage: task.status
      })
      continue
    }

    existing.taskIds.push(task.id)
    existing.assignmentCount += 1
    existing.statusCounts[task.status] += 1
    if (!existing.assigneeNames.includes(task.assignee_name)) {
      existing.assigneeNames.push(task.assignee_name)
    }
    if (new Date(task.updated_at).getTime() > new Date(existing.updatedAt).getTime()) {
      existing.updatedAt = task.updated_at
    }
  }

  return Array.from(map.values()).map(group => ({
    ...group,
    stage: deriveStage(group.statusCounts, group.assignmentCount),
    assigneeNames: [...group.assigneeNames].sort((left, right) => left.localeCompare(right))
  }))
})

const filteredGroups = computed(() => {
  const q = searchTerm.value.trim().toLowerCase()

  return groupedTasks.value
    .filter((group) => {
      if (statusFilter.value !== 'all' && group.statusCounts[statusFilter.value] === 0) return false
      if (priorityFilter.value !== 'all' && group.priority !== priorityFilter.value) return false

      if (!q) return true
      return [
        group.title,
        group.description,
        group.leadReference,
        group.leadName,
        group.leadPhoneNumber,
        group.createdByName,
        ...group.tags,
        ...group.assigneeNames
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    .sort((left, right) => {
      const statusOrder: Record<TaskStatus, number> = { in_progress: 0, waiting: 1, todo: 2, completed: 3 }
      const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

      if (statusOrder[left.stage] !== statusOrder[right.stage]) return statusOrder[left.stage] - statusOrder[right.stage]
      if (left.deadlineDate !== right.deadlineDate) return left.deadlineDate.localeCompare(right.deadlineDate)
      if (priorityOrder[left.priority] !== priorityOrder[right.priority]) return priorityOrder[left.priority] - priorityOrder[right.priority]
      return right.createdAt.localeCompare(left.createdAt)
    })
})

const groupsByStatus = computed(() => {
  const map = new Map<TaskStatus, TaskGroup[]>()
  KANBAN_COLUMNS.forEach(status => map.set(status, []))
  filteredGroups.value.forEach(group => {
    const column = map.get(group.stage) ?? []
    column.push(group)
    map.set(group.stage, column)
  })
  return map
})

const openCount = computed(() => groupedTasks.value.filter(isOpenTask).length)
const pendingCount = computed(() => groupedTasks.value.filter(group => group.statusCounts.waiting > 0).length)
const overdueCount = computed(() => groupedTasks.value.filter(isOverdue).length)
const completedCount = computed(() => groupedTasks.value.filter(group => group.stage === 'completed').length)
const totalAssignmentCount = computed(() =>
  groupedTasks.value.reduce((total, group) => total + group.assignmentCount, 0)
)
const activeAgentCount = computed(() => {
  const names = new Set<string>()
  groupedTasks.value.forEach(group => {
    group.assigneeNames.forEach(name => names.add(name))
  })
  return names.size
})
const completedAssignmentCount = computed(() =>
  groupedTasks.value.reduce((total, group) => total + group.statusCounts.completed, 0)
)
const completionRate = computed(() => {
  if (totalAssignmentCount.value === 0) return 0
  return Math.round((completedAssignmentCount.value / totalAssignmentCount.value) * 100)
})
const nextDeadline = computed(() => {
  const upcoming = groupedTasks.value
    .filter(isOpenTask)
    .map(group => group.deadlineDate)
    .sort()
  return upcoming[0] ?? null
})
const activeFilterCount = computed(() => {
  let count = 0
  if (statusFilter.value !== 'all') count++
  if (priorityFilter.value !== 'all') count++
  if (searchTerm.value.trim()) count++
  return count
})
const hasActiveFilters = computed(() => activeFilterCount.value > 0)

const assignmentSegments = computed(() => [
  { label: 'To Do', value: groupedTasks.value.reduce((total, group) => total + group.statusCounts.todo, 0), color: 'bg-slate-400' },
  { label: 'Pending', value: groupedTasks.value.reduce((total, group) => total + group.statusCounts.waiting, 0), color: 'bg-amber-400' },
  { label: 'Active', value: groupedTasks.value.reduce((total, group) => total + group.statusCounts.in_progress, 0), color: 'bg-sky-400' },
  { label: 'Done', value: completedAssignmentCount.value, color: 'bg-emerald-500' }
])

function segmentWidth(value: number, total: number) {
  if (total <= 0 || value <= 0) return '0%'
  return `${(value / total) * 100}%`
}

function resetFilters() {
  searchTerm.value = ''
  statusFilter.value = 'all'
  priorityFilter.value = 'all'
}

const leadSelectOptions = computed(() => {
  const q = leadSearch.value.trim().toLowerCase()
  const leads = leadOptions.value
    .filter((lead) => {
      if (!q) return true
      return [lead.reference, lead.customerName, lead.phoneNumber].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    .slice(0, 30)
    .map(lead => ({
      value: lead.id,
      label: `${lead.reference} - ${lead.customerName}`
    }))

  return [{ value: NO_LEAD, label: 'No related case' }, ...leads]
})

const leadSearchResults = computed(() => {
  const q = leadSearch.value.trim().toLowerCase()
  return leadOptions.value
    .filter((lead) => {
      if (!q) return true
      return [lead.reference, lead.customerName, lead.phoneNumber]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    .slice(0, 30)
})

const attachedLead = computed(() =>
  form.leadId === NO_LEAD ? null : leadOptions.value.find(l => l.id === form.leadId) ?? null
)

function formatLeadDisplay(lead: LeadOption | null) {
  if (!lead) return ''
  const ref = (lead.reference ?? '').trim()
  const name = (lead.customerName ?? '').trim()
  if (ref && name) return `${name} · ${ref}`
  return name || ref
}

function selectLeadOption(lead: LeadOption) {
  form.leadId = lead.id
  leadSearch.value = formatLeadDisplay(lead)
  showLeadResults.value = false
}

function clearAttachedLead() {
  form.leadId = NO_LEAD
  leadSearch.value = ''
  showLeadResults.value = false
}

function openDeadlinePicker() {
  const input = deadlineInputRef.value as (HTMLInputElement & { showPicker?: () => void }) | null
  if (!input) return
  input.focus()
  if (typeof input.showPicker === 'function') {
    try { input.showPicker() } catch { /* not all browsers allow programmatic open */ }
  }
}

const selectedGroup = computed(() =>
  selectedGroupKey.value
    ? groupedTasks.value.find(group => group.key === selectedGroupKey.value) ?? null
    : null
)

const dedupedNotes = computed(() => {
  const seen = new Set<string>()
  const unique: CloserTaskNote[] = []

  for (const note of notes.value) {
    const key = [
      note.author_user_id ?? '',
      note.author_name,
      note.content,
      note.created_at.slice(0, 19)
    ].join('|')

    if (seen.has(key)) continue
    seen.add(key)
    unique.push(note)
  }

  return unique
})

async function loadLeadOptions() {
  const { data, error } = await supabase
    .from('leads')
    .select('id,submission_id,customer_full_name,phone_number')
    .eq('is_active', true)
    .in('status', ['attorney_review', 'attorney_approved', 'attorney_rejected'])
    .order('submission_date', { ascending: false })
    .limit(200)

  if (error) throw error

  leadOptions.value = ((data ?? []) as Array<{
    id: string
    submission_id: string
    customer_full_name: string | null
    phone_number: string | null
  }>).map(row => ({
    id: row.id,
    reference: row.submission_id,
    customerName: row.customer_full_name ?? 'Unknown Client',
    phoneNumber: row.phone_number
  }))
}

async function loadTasks() {
  const { data, error } = await supabase
    .from('closer_tasks')
    .select('*')
    .or('created_by_role.eq.broker,assignment_scope.eq.all_agents')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) throw error

  const rows = ((data ?? []) as CloserTaskRow[]).map(row => ({
    ...row,
    tags: normalizeTags(row.tags)
  }))

  const leadIds = Array.from(new Set(rows.map(row => row.lead_id).filter(Boolean))) as string[]

  if (leadIds.length === 0) {
    tasks.value = rows
    return
  }

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id,submission_id,customer_full_name,phone_number')
    .in('id', leadIds)

  if (leadError) throw leadError

  const leadById = new Map<string, { submission_id: string; customer_full_name: string | null; phone_number: string | null }>()
  ;((leads ?? []) as Array<{
    id: string
    submission_id: string
    customer_full_name: string | null
    phone_number: string | null
  }>).forEach(lead => {
    leadById.set(lead.id, lead)
  })

  tasks.value = rows.map((task) => {
    const lead = task.lead_id ? leadById.get(task.lead_id) : undefined
    return {
      ...task,
      lead_reference: task.lead_reference || lead?.submission_id || null,
      lead_name: lead?.customer_full_name ?? null,
      lead_phone_number: lead?.phone_number ?? null
    }
  })
}

async function load(showRefreshToast = false) {
  loading.value = !refreshing.value
  refreshing.value = true

  try {
    await auth.init()
    const role = auth.state.value.profile?.role
    if (role !== 'broker' && role !== 'super_admin') {
      tasks.value = []
      leadOptions.value = []
      return
    }

    await Promise.all([loadTasks(), loadLeadOptions()])

    if (showRefreshToast) {
      toast.add({
        title: 'Tasks refreshed',
        color: 'success',
        icon: 'i-lucide-refresh-cw'
      })
    }
  } catch (err) {
    const description = err instanceof Error ? err.message : 'Unable to load tasks'
    toast.add({
      title: 'Error',
      description,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function submitTask() {
  const title = form.title.trim()

  if (!title) {
    toast.add({ title: 'Title is required', color: 'warning', icon: 'i-lucide-alert-circle' })
    return
  }

  if (!form.deadlineDate) {
    toast.add({ title: 'Deadline is required', color: 'warning', icon: 'i-lucide-alert-circle' })
    return
  }

  saving.value = true

  try {
    const lead = selectedLead()
    const { data, error } = await supabase.rpc('create_broker_closer_task_for_all_agents', {
      p_title: title,
      p_description: form.description.trim() || null,
      p_lead_id: lead?.id ?? null,
      p_lead_reference: lead?.reference ?? null,
      p_priority: form.priority,
      p_deadline_date: form.deadlineDate,
      p_tags: form.tags,
      p_note: form.note.trim() || null
    })

    if (error) throw error

    const assignmentCount = Array.isArray(data) ? data.length : 0
    toast.add({
      title: 'Task assigned',
      description: assignmentCount > 0 ? `Created for ${assignmentCount} agents.` : 'Created for all agents.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    createOpen.value = false
    resetForm()
    await loadTasks()
  } catch (err) {
    const description = err instanceof Error ? err.message : 'Unable to create task'
    toast.add({
      title: 'Error',
      description,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    saving.value = false
  }
}

async function loadNotesForGroup(group: TaskGroup) {
  notesLoading.value = true

  try {
    const { data, error } = await supabase
      .from('closer_task_notes')
      .select('*')
      .in('task_id', group.taskIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    notes.value = (data ?? []) as CloserTaskNote[]
  } catch (err) {
    const description = err instanceof Error ? err.message : 'Unable to load notes'
    toast.add({
      title: 'Error',
      description,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    notesLoading.value = false
  }
}

function openDetails(group: TaskGroup) {
  selectedGroupKey.value = group.key
  detailOpen.value = true
  noteDraft.value = ''
  loadNotesForGroup(group).catch(() => {})
}

async function addNote() {
  const group = selectedGroup.value
  const content = noteDraft.value.trim()
  if (!group || !content) return

  noteSaving.value = true

  try {
    const rows = group.taskIds.map(taskId => ({
      task_id: taskId,
      author_user_id: auth.state.value.user?.id ?? null,
      author_name: currentUserLabel.value,
      content
    }))

    const { error } = await supabase
      .from('closer_task_notes')
      .insert(rows)

    if (error) throw error

    noteDraft.value = ''
    await loadNotesForGroup(group)
    toast.add({
      title: 'Note added',
      color: 'success',
      icon: 'i-lucide-message-square-plus'
    })
  } catch (err) {
    const description = err instanceof Error ? err.message : 'Unable to add note'
    toast.add({
      title: 'Error',
      description,
      color: 'error',
      icon: 'i-lucide-x'
    })
  } finally {
    noteSaving.value = false
  }
}

function handleCreateOpenUpdate(value: boolean) {
  createOpen.value = value
  if (!value) resetForm()
}

function handleDetailOpenUpdate(value: boolean) {
  detailOpen.value = value
  if (!value) {
    selectedGroupKey.value = null
    notes.value = []
    noteDraft.value = ''
  }
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

onMounted(async () => {
  await load()

  realtimeChannel = supabase
    .channel('broker-task-assignment')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_tasks' }, () => {
      loadTasks().catch(() => {})
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_task_notes' }, () => {
      const group = selectedGroup.value
      if (group && detailOpen.value) {
        loadNotesForGroup(group).catch(() => {})
      }
    })
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
})

watch(
  () => selectedGroup.value?.key,
  () => {
    if (!selectedGroup.value && detailOpen.value) {
      handleDetailOpenUpdate(false)
    }
  }
)
</script>

<template>
  <UDashboardPanel id="task-assignment">
    <template #header>
      <UDashboardNavbar title="Task Assignment">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col gap-5 px-1 pb-2">
        <UModal
          :open="createOpen"
          :dismissible="!saving"
          :ui="{ content: 'max-w-4xl overflow-hidden border-0 bg-zinc-950 p-0 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10' }"
          @update:open="handleCreateOpenUpdate"
        >
          <template #content>
            <!-- Header with gradient accent -->
            <div class="relative overflow-hidden border-b border-primary/25 px-5 py-4">
              <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgb(var(--ap-accent-rgb,217_70_30)/0.32),transparent_34%),linear-gradient(135deg,rgb(var(--ap-accent-rgb,217_70_30)/0.12),transparent_42%)]" />
              <div class="relative space-y-1">
                <h3 class="text-lg font-semibold text-white">New Task</h3>
                <p class="text-sm text-zinc-500">
                  Broadcasts to every active sales rep with broker context, lead, deadline, and priority.
                </p>
              </div>
            </div>

            <!-- Body -->
            <div class="max-h-[min(60vh,560px)] overflow-y-auto task-modal-scroll">
              <div class="space-y-4 p-5">
                <!-- Recipients banner -->
                <div class="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                    <UIcon name="i-lucide-users-2" class="size-4 text-primary" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-white">Sent to all sales reps</p>
                    <p class="text-xs text-zinc-500">
                      {{ activeAgentCount > 0 ? `${activeAgentCount} agents currently in your sales team` : 'Every active agent receives a copy of this task' }}
                    </p>
                  </div>
                </div>

                <!-- Title (full width) -->
                <div class="space-y-2">
                  <label for="task-title" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Task title <span class="text-rose-400">*</span>
                  </label>
                  <UInput
                    id="task-title"
                    v-model="form.title"
                    placeholder="e.g. Reconnect with client after missed signature"
                    autocomplete="off"
                    size="md"
                    class="task-input w-full"
                  />
                </div>

                <!-- 4-up grid: Deadline, Priority, Tags, (filler/agents) -->
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div class="space-y-2">
                    <label for="task-deadline" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Deadline <span class="text-rose-400">*</span>
                    </label>
                    <div class="relative" @click="openDeadlinePicker">
                      <input
                        ref="deadlineInputRef"
                        id="task-deadline"
                        v-model="form.deadlineDate"
                        type="date"
                        :min="todayKey"
                        class="peer h-10 w-full cursor-pointer appearance-none rounded-md border border-primary/35 bg-zinc-900 px-3 pr-10 text-sm text-white outline-none transition-colors focus:border-primary [color-scheme:dark]"
                      >
                      <UIcon name="i-lucide-calendar-days" class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
                    </div>
                  </div>

                  <div class="space-y-2">
                    <label for="task-priority" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Priority
                    </label>
                    <USelect
                      id="task-priority"
                      v-model="form.priority"
                      :items="TASK_PRIORITY_OPTIONS.filter(option => option.value !== 'all')"
                      value-key="value"
                      label-key="label"
                      class="task-select w-full"
                    />
                  </div>

                  <div class="space-y-2 sm:col-span-2 lg:col-span-1">
                    <label for="task-tags" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Tags
                    </label>
                    <USelect
                      id="task-tags"
                      v-model="form.tags"
                      :items="TASK_TAG_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Select tags"
                      class="task-select w-full"
                    />
                  </div>
                </div>

                <!-- Description + Lead reference (2-col) -->
                <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                  <div class="space-y-2">
                    <label for="task-description" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Description
                    </label>
                    <UTextarea
                      id="task-description"
                      v-model="form.description"
                      :rows="4"
                      placeholder="Context, blockers, and next best action."
                      class="task-textarea w-full"
                      :ui="{ base: 'border-zinc-800 bg-zinc-900' }"
                    />
                  </div>

                  <div class="space-y-2">
                    <label for="task-lead-reference" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                      Lead Reference
                    </label>
                    <div class="relative">
                      <div class="relative">
                        <UIcon name="i-lucide-search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          id="task-lead-reference"
                          v-model="leadSearch"
                          type="text"
                          autocomplete="off"
                          placeholder="Search customer or phone"
                          class="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 pl-9 pr-10 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-primary"
                          @focus="showLeadResults = true"
                          @input="form.leadId = NO_LEAD"
                        >
                        <button
                          v-if="attachedLead"
                          type="button"
                          class="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                          @click="clearAttachedLead"
                        >
                          <UIcon name="i-lucide-x" class="size-4" />
                        </button>
                      </div>

                      <div v-if="attachedLead" class="mt-2 flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                          <UIcon name="i-lucide-link-2" class="size-3 text-primary" />
                          {{ formatLeadDisplay(attachedLead) }}
                        </span>
                      </div>

                      <div
                        v-if="showLeadResults && !attachedLead"
                        class="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/30"
                      >
                        <div class="max-h-52 overflow-y-auto task-modal-scroll p-2">
                          <div
                            v-if="leadSearchResults.length === 0"
                            class="rounded-xl px-3 py-3 text-sm text-zinc-500"
                          >
                            {{ leadSearch.trim() ? 'No active leads matched that search.' : 'No active leads are available right now.' }}
                          </div>
                          <button
                            v-for="lead in leadSearchResults"
                            :key="lead.id"
                            type="button"
                            class="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-800"
                            @click="selectLeadOption(lead)"
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <span class="text-sm font-semibold text-white truncate">
                                {{ lead.customerName || lead.reference }}
                              </span>
                              <span
                                v-if="lead.phoneNumber"
                                class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                              >
                                {{ formatPhone(lead.phoneNumber) }}
                              </span>
                            </div>
                            <span class="mt-0.5 text-[11px] text-zinc-500 truncate">
                              {{ lead.reference }}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Initial note -->
                <div class="space-y-2">
                  <label for="task-note" class="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Initial note
                    <span class="ml-1 text-[10px] font-normal normal-case tracking-normal text-zinc-500">(optional)</span>
                  </label>
                  <UTextarea
                    id="task-note"
                    v-model="form.note"
                    :rows="3"
                    placeholder="Anything else the sales rep should know? Sent as the first note on every broadcast copy."
                    class="task-textarea w-full"
                    :ui="{ base: 'border-zinc-800 bg-zinc-900' }"
                  />
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex flex-col-reverse gap-2 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:justify-end">
              <UButton
                color="neutral"
                variant="outline"
                class="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                :disabled="saving"
                @click="handleCreateOpenUpdate(false)"
              >
                Cancel
              </UButton>
              <UButton
                icon="i-lucide-send"
                :loading="saving"
                :disabled="saving || !form.title.trim() || !form.deadlineDate"
                @click="submitTask"
              >
                {{ saving ? 'Sending…' : 'Assign to all sales reps' }}
              </UButton>
            </div>
          </template>
        </UModal>

        <USlideover
          :open="detailOpen"
          side="right"
          :ui="{ content: 'w-full sm:max-w-2xl border-l-0 bg-zinc-950 px-0 py-0 text-white shadow-2xl shadow-black/30 ring-1 ring-white/10' }"
          @update:open="handleDetailOpenUpdate"
        >
          <template #content>
            <div v-if="selectedGroup" class="flex h-full flex-col">
              <!-- Header with gradient + badges -->
              <div class="relative overflow-hidden border-b border-zinc-800 px-6 py-6">
                <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgb(var(--ap-accent-rgb,217_70_30)/0.28),transparent_42%),linear-gradient(135deg,rgb(var(--ap-accent-rgb,217_70_30)/0.12),transparent_46%)]" />
                <div class="relative space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge
                      variant="outline"
                      :class="TASK_STATUS_META[selectedGroup.stage].badgeClass"
                      :label="TASK_STATUS_META[selectedGroup.stage].label"
                    />
                    <UBadge
                      variant="outline"
                      :class="TASK_PRIORITY_META[selectedGroup.priority].badgeClass"
                      :label="TASK_PRIORITY_META[selectedGroup.priority].label"
                    />
                    <span
                      v-for="tag in selectedGroup.tags"
                      :key="tag"
                      class="inline-flex items-center rounded-full border border-white/70 bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
                    >
                      {{ formatTaskTag(tag) }}
                    </span>
                  </div>
                  <h2 class="text-2xl font-semibold tracking-tight text-white">
                    {{ selectedGroup.title }}
                  </h2>
                  <p class="text-sm leading-6 text-zinc-400">
                    {{ selectedGroup.description || 'No description was provided for this task.' }}
                  </p>
                </div>
              </div>

              <!-- Body -->
              <div class="flex-1 overflow-y-auto task-modal-scroll px-6 py-5 space-y-5">
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                    <div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      <UIcon name="i-lucide-users-2" class="size-4 text-primary" />
                      Recipients
                    </div>
                    <p class="text-sm font-semibold text-white">
                      {{ selectedGroup.assignmentCount }} sales {{ selectedGroup.assignmentCount === 1 ? 'rep' : 'reps' }}
                    </p>
                    <p class="mt-1 text-sm text-zinc-500">
                      {{ statusSummary(selectedGroup) }}
                    </p>
                    <p class="mt-2 text-xs text-zinc-500 line-clamp-2">
                      {{ assigneePreview(selectedGroup) || '—' }}
                    </p>
                  </div>

                  <div class="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                    <div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      <UIcon name="i-lucide-calendar-clock" class="size-4 text-primary" />
                      Timeline
                    </div>
                    <p class="text-sm font-semibold text-white">
                      Due {{ formatDate(selectedGroup.deadlineDate) }}
                    </p>
                    <p class="mt-1 text-sm text-zinc-500">
                      Assigned {{ formatDate(selectedGroup.assignedDate) }}
                    </p>
                    <p class="mt-2 text-xs font-medium text-primary">
                      {{ deadlineSignal(selectedGroup) }}
                    </p>
                  </div>

                  <div
                    v-if="selectedGroup.leadReference || selectedGroup.leadName"
                    class="rounded-2xl border border-primary/30 bg-primary/5 p-4 md:col-span-2"
                  >
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div class="min-w-0">
                        <div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          <UIcon name="i-lucide-user-round" class="size-4 text-primary" />
                          Customer
                        </div>
                        <p class="truncate text-base font-semibold text-white">
                          {{ selectedGroup.leadName || 'Customer not attached' }}
                        </p>
                        <div class="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                          <UIcon name="i-lucide-phone" class="size-3.5 text-primary" />
                          <span>{{ selectedGroup.leadPhoneNumber ? formatPhone(selectedGroup.leadPhoneNumber) : 'Phone not attached' }}</span>
                        </div>
                        <p
                          v-if="selectedGroup.leadReference"
                          class="mt-1 text-xs text-zinc-500"
                        >
                          {{ selectedGroup.leadReference }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Notes -->
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-sticky-note" class="size-4 text-primary" />
                    <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Notes &amp; Activity
                    </h3>
                    <UBadge
                      variant="outline"
                      class="ml-auto border-zinc-800 bg-zinc-900 text-zinc-300"
                      :label="`${dedupedNotes.length} ${dedupedNotes.length === 1 ? 'note' : 'notes'}`"
                    />
                  </div>

                  <!-- Add note -->
                  <div class="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4">
                    <label for="task-note-draft" class="block text-xs font-medium text-zinc-400">
                      Add note
                    </label>
                    <UTextarea
                      id="task-note-draft"
                      v-model="noteDraft"
                      :rows="3"
                      placeholder="Write a concise update, blocker, or client detail. Sent to every sales rep on this task."
                      class="task-textarea mt-2 w-full"
                      :ui="{ base: 'border-zinc-800 bg-zinc-950' }"
                    />
                    <div class="mt-3 flex justify-end">
                      <UButton
                        icon="i-lucide-message-square-plus"
                        :loading="noteSaving"
                        :disabled="noteSaving || !noteDraft.trim()"
                        @click="addNote"
                      >
                        Post note
                      </UButton>
                    </div>
                  </div>

                  <!-- Notes list -->
                  <div class="space-y-2">
                    <div
                      v-if="notesLoading"
                      class="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500"
                    >
                      Loading notes…
                    </div>
                    <div
                      v-else-if="dedupedNotes.length === 0"
                      class="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500"
                    >
                      No notes yet. Add the first update to keep the task trail clear.
                    </div>
                    <div
                      v-for="note in dedupedNotes"
                      v-else
                      :key="note.id"
                      class="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-sm font-semibold text-white">{{ note.author_name }}</p>
                        <p class="text-xs text-zinc-500">{{ formatDateTime(note.created_at) }}</p>
                      </div>
                      <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                        {{ note.content }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div class="border-t border-zinc-800 px-6 py-3 flex justify-end">
                <UButton
                  color="neutral"
                  variant="outline"
                  class="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
                  @click="handleDetailOpenUpdate(false)"
                >
                  Close
                </UButton>
              </div>
            </div>
          </template>
        </USlideover>

        <section class="min-w-0 space-y-3">
          <UBadge
            variant="outline"
            class="w-fit rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary"
            label="Broker task workspace"
          />
          <div class="space-y-2">
            <h1 class="text-3xl font-semibold tracking-tight text-highlighted lg:text-4xl">
              Hello, {{ currentUserLabel }}
            </h1>
            <p class="max-w-2xl text-sm leading-6 text-muted">
              All-agent sales team queue with broker notes, case context, and deadline pressure in one place.
            </p>
          </div>
        </section>

        <section class="grid gap-4 rounded-xl border border-white/10 bg-zinc-950 p-4 text-white shadow-xl shadow-black/20 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div class="flex min-w-0 flex-col justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/55 p-4">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-users-2" class="size-4 text-primary" />
                <p class="text-sm font-semibold text-white">Sales Team Broadcast</p>
              </div>
              <p class="text-sm text-zinc-500">
                {{ activeAgentCount }} agents currently represented across {{ totalAssignmentCount }} task assignments.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                color="neutral"
                variant="outline"
                class="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                icon="i-lucide-refresh-cw"
                :loading="refreshing"
                @click="load(true)"
              >
                Refresh
              </UButton>
              <UButton
                icon="i-lucide-plus"
                @click="createOpen = true"
              >
                New Task
              </UButton>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-800 bg-zinc-900/55 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completion</p>
                <p class="mt-1 text-2xl font-semibold text-white tabular-nums">
                  {{ completionRate }}%
                </p>
              </div>
              <div class="text-right text-xs text-zinc-500">
                <p>{{ completedAssignmentCount }}/{{ totalAssignmentCount }} done</p>
                <p class="mt-1">
                  Next due {{ nextDeadline ? formatDate(nextDeadline, { month: 'short', day: 'numeric' }) : '-' }}
                </p>
              </div>
            </div>

            <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                v-for="segment in assignmentSegments"
                :key="segment.label"
                class="h-full"
                :class="segment.color"
                :style="{ width: segmentWidth(segment.value, Math.max(totalAssignmentCount, 1)) }"
              />
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2">
              <div
                v-for="segment in assignmentSegments"
                :key="segment.label"
                class="flex items-center justify-between gap-2 text-xs"
              >
                <span class="flex items-center gap-2 text-zinc-500">
                  <span class="h-2 w-2 rounded-full" :class="segment.color" />
                  {{ segment.label }}
                </span>
                <span class="font-semibold text-white tabular-nums">{{ segment.value }}</span>
              </div>
            </div>
          </div>
        </section>

        <div class="hidden grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="ap-fade-in rounded-xl border border-black/[0.06] bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-sky-500 dark:text-sky-400">Open Tasks</p>
                <p class="mt-1 text-2xl font-bold text-sky-500 dark:text-sky-400 tabular-nums">{{ openCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
                <UIcon name="i-lucide-list-checks" class="text-lg text-sky-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 rounded-xl border border-black/[0.06] bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">Pending</p>
                <p class="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">{{ pendingCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock-3" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 rounded-xl border border-black/[0.06] bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-rose-500 dark:text-rose-400">Overdue</p>
                <p class="mt-1 text-2xl font-bold text-rose-500 dark:text-rose-400 tabular-nums">{{ overdueCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
                <UIcon name="i-lucide-triangle-alert" class="text-lg text-rose-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-3 rounded-xl border border-black/[0.06] bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-medium uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Completed</p>
                <p class="mt-1 text-2xl font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">{{ completedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle-2" class="text-lg text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-white shadow-xl shadow-black/20">
          <div class="border-b border-zinc-800 px-4 py-4 lg:px-5">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-xl font-semibold text-white">All Agent Tasks</h2>
                  <UBadge
                    variant="subtle"
                    class="rounded-full"
                    :label="`${filteredGroups.length} tasks`"
                  />
                </div>
                <p class="mt-1 text-sm text-zinc-500">
                  Broker-originated work grouped by broadcast assignment.
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  class="border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                  icon="i-lucide-refresh-cw"
                  :loading="refreshing"
                  @click="load(true)"
                >
                  Refresh
                </UButton>
                <UButton
                  icon="i-lucide-plus"
                  @click="createOpen = true"
                >
                  New Task
                </UButton>
              </div>
            </div>

            <div class="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div class="flex flex-wrap items-center gap-2">
                <div class="grid h-11 w-full grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1 sm:w-[270px]">
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors"
                  :class="taskViewMode === 'list' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'"
                  @click="taskViewMode = 'list'"
                >
                  <UIcon name="i-lucide-layout-list" class="size-4" />
                  List
                </button>
                <button
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors"
                  :class="taskViewMode === 'kanban' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'"
                  @click="taskViewMode = 'kanban'"
                >
                  <UIcon name="i-lucide-columns-3" class="size-4" />
                  Kanban
                </button>
              </div>

                <UPopover :content="{ align: 'start' }">
                  <UButton
                    color="neutral"
                    variant="outline"
                    class="h-11 border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                    icon="i-lucide-filter"
                  >
                    Filters
                    <template v-if="activeFilterCount > 0" #trailing>
                      <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-zinc-950">
                        {{ activeFilterCount }}
                      </span>
                    </template>
                  </UButton>

                  <template #content>
                    <div class="w-[min(92vw,760px)] space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-white shadow-2xl">
                      <div class="grid gap-3 md:grid-cols-3">
                        <UFormField label="Search" class="md:col-span-3">
                          <UInput
                            v-model="searchTerm"
                            icon="i-lucide-search"
                            placeholder="Title, case, agent, tag..."
                          />
                        </UFormField>

                        <UFormField label="Status">
                          <USelect
                            v-model="statusFilter"
                            :items="TASK_STATUS_OPTIONS"
                            value-key="value"
                            label-key="label"
                          />
                        </UFormField>

                        <UFormField label="Priority">
                          <USelect
                            v-model="priorityFilter"
                            :items="TASK_PRIORITY_OPTIONS"
                            value-key="value"
                            label-key="label"
                          />
                        </UFormField>

                        <div class="flex items-end">
                          <UButton
                            v-if="hasActiveFilters"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-x"
                            @click="resetFilters"
                          >
                            Clear filters
                          </UButton>
                        </div>
                      </div>
                    </div>
                  </template>
                </UPopover>
              </div>

              <p class="text-sm font-medium text-zinc-500 tabular-nums">
                {{ filteredGroups.length }} visible tasks
              </p>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-hidden p-4 lg:p-5">
          <div
            v-if="loading"
            class="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-500"
          >
            Loading tasks...
          </div>

          <div
            v-else-if="filteredGroups.length === 0"
            class="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-800 px-4 text-center text-sm text-zinc-500"
          >
            No tasks found.
          </div>

          <div v-else-if="taskViewMode === 'list'" class="task-scroll h-full overflow-y-auto pr-1">
            <div class="space-y-3">
              <button
                v-for="group in filteredGroups"
                :key="group.key"
                type="button"
                class="group relative w-full overflow-hidden rounded-xl border bg-zinc-900/55 px-4 py-3 text-left transition hover:bg-zinc-900 hover:shadow-md"
                :class="TASK_PRIORITY_META[group.priority].cardAccent"
                @click="openDetails(group)"
              >
                <div class="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(170px,0.7fr)_minmax(150px,0.6fr)_minmax(130px,0.55fr)]">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="mt-1 h-10 w-1.5 shrink-0 rounded-full" :class="TASK_PRIORITY_META[group.priority].railClass" />
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                          <p class="min-w-0 max-w-full truncate text-base font-semibold text-white">
                          {{ group.title }}
                        </p>
                        <UBadge
                          variant="outline"
                          :class="TASK_STATUS_META[group.stage].badgeClass"
                          :label="statusSummary(group)"
                        />
                      </div>
                      <p v-if="group.description" class="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">
                        {{ group.description }}
                      </p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        <UBadge
                          v-for="tag in group.tags.slice(0, 3)"
                          :key="tag"
                          variant="subtle"
                          :label="formatTaskTag(tag)"
                        />
                        <UBadge
                          v-if="group.tags.length > 3"
                          variant="subtle"
                          :label="`+${group.tags.length - 3}`"
                        />
                        <UBadge
                          v-if="group.leadName || group.leadReference"
                          variant="outline"
                          :label="group.leadName || group.leadReference || ''"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="min-w-0 space-y-1">
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Agents</p>
                    <p class="text-sm font-semibold text-white">{{ group.assignmentCount }} assigned</p>
                    <p class="truncate text-sm text-zinc-500">{{ assigneePreview(group) || '-' }}</p>
                  </div>

                  <div class="space-y-1">
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Dates</p>
                    <p class="text-sm font-medium text-white">Due {{ formatDate(group.deadlineDate, { month: 'short', day: 'numeric' }) }}</p>
                    <p class="text-sm text-zinc-500">Assigned {{ formatDate(group.assignedDate, { month: 'short', day: 'numeric' }) }}</p>
                  </div>

                  <div class="space-y-2">
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Signal</p>
                    <p class="text-sm font-semibold" :class="isOverdue(group) ? 'text-rose-400' : 'text-primary'">
                      {{ deadlineSignal(group) }}
                    </p>
                    <UBadge
                      variant="outline"
                      :class="TASK_PRIORITY_META[group.priority].badgeClass"
                      :label="TASK_PRIORITY_META[group.priority].label"
                    />
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div v-else class="task-scroll h-full overflow-auto pr-1">
            <div class="grid min-w-[980px] gap-3 lg:grid-cols-4">
              <div
                v-for="status in KANBAN_COLUMNS"
                :key="status"
                class="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/45"
              >
                <div
                  class="flex items-center justify-between border-b border-zinc-800 bg-gradient-to-r to-transparent px-4 py-3"
                  :class="TASK_STATUS_META[status].columnClass"
                >
                  <div class="flex items-center gap-2">
                    <UIcon :name="TASK_STATUS_META[status].icon" class="size-4 text-primary" />
                    <span class="text-sm font-semibold text-white">{{ TASK_STATUS_META[status].label }}</span>
                  </div>
                  <UBadge variant="subtle" :label="`${groupsByStatus.get(status)?.length ?? 0}`" />
                </div>

                <div class="task-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  <button
                    v-for="group in groupsByStatus.get(status) ?? []"
                    :key="group.key"
                    type="button"
                    class="group w-full rounded-lg border bg-zinc-950/45 p-3 text-left transition hover:bg-zinc-950/75 hover:shadow-md"
                    :class="TASK_PRIORITY_META[group.priority].cardAccent"
                    @click="openDetails(group)"
                  >
                    <div class="flex items-start gap-2.5">
                      <span class="mt-1 h-9 w-1.5 shrink-0 rounded-full" :class="TASK_PRIORITY_META[group.priority].railClass" />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-semibold text-white">{{ group.title }}</p>
                        <p class="mt-1 text-xs font-medium" :class="isOverdue(group) ? 'text-rose-400' : 'text-primary'">
                          {{ deadlineSignal(group) }}
                        </p>
                      </div>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-1.5">
                      <UBadge
                        variant="outline"
                        :class="TASK_STATUS_META[group.stage].badgeClass"
                        :label="statusSummary(group)"
                      />
                      <UBadge
                        variant="outline"
                        :class="TASK_PRIORITY_META[group.priority].badgeClass"
                        :label="TASK_PRIORITY_META[group.priority].label.replace(' Priority', '')"
                      />
                    </div>

                    <div class="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span class="truncate">{{ group.leadName || group.leadReference || 'No case' }}</span>
                      <span class="shrink-0">{{ group.assignmentCount }} agents</span>
                    </div>
                  </button>

                  <div
                    v-if="(groupsByStatus.get(status)?.length ?? 0) === 0"
                    class="rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center text-sm text-zinc-500"
                  >
                    No tasks.
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.task-scroll::-webkit-scrollbar,
.task-modal-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.task-scroll::-webkit-scrollbar-track,
.task-modal-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.task-scroll::-webkit-scrollbar-thumb,
.task-modal-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}

.task-scroll::-webkit-scrollbar-thumb:hover,
.task-modal-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.18);
}

.task-input :deep(input),
.task-select :deep(button),
.task-select :deep([role="combobox"]),
.task-textarea :deep(textarea) {
  background-color: rgb(24 24 27) !important;
  border-color: rgb(63 63 70) !important;
  color: rgb(244 244 245) !important;
}

.task-input :deep(input)::placeholder,
.task-textarea :deep(textarea)::placeholder {
  color: rgb(113 113 122);
}

.task-input :deep(input):focus,
.task-select :deep(button):focus,
.task-select :deep([role="combobox"]):focus,
.task-textarea :deep(textarea):focus {
  border-color: var(--ap-accent) !important;
  outline: none;
}
</style>
