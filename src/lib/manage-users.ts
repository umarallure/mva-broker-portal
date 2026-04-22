export type ManageUserRole = 'admin' | 'lawyer' | 'agent' | 'accounts'

export type ManageUserRow = {
  user_id: string
  email: string
  display_name: string | null
  role: ManageUserRole | null
  center_id: string | null
  urgency_orders_enabled: boolean | null
  created_at: string
  updated_at: string
}

const EDGE_FUNCTION_PATH = '/functions/v1/manage-users'
const EDGE_FUNCTION_BASE = (import.meta as any).env?.VITE_SUPABASE_FUNCTIONS_BASE

const edgeFunctionUrl = EDGE_FUNCTION_BASE
  ? `${String(EDGE_FUNCTION_BASE).replace(/\/$/, '')}${EDGE_FUNCTION_PATH}`
  : EDGE_FUNCTION_PATH

const buildHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
})

const callEdge = async <T>(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  token: string
  body?: Record<string, unknown>
}) => {
  if (!options.token) {
    throw new Error('Missing auth token. Please sign in again.')
  }

  const response = await fetch(edgeFunctionUrl, {
    method: options.method,
    headers: buildHeaders(options.token),
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json().catch(() => ({})) : await response.text().catch(() => '')

  if (!response.ok) {
    const errMsg = isJson && typeof (payload as any)?.error === 'string'
      ? (payload as any).error
      : `Request failed (${response.status})`
    throw new Error(errMsg)
  }

  if (!isJson) {
    throw new Error('Unexpected response from edge function (expected JSON).')
  }

  return payload as T
}

export const listUsers = (token: string) =>
  callEdge<{ users: ManageUserRow[] }>({ method: 'GET', token })

export const createUser = (token: string, body: {
  email: string
  role: ManageUserRole | null
  password: string
  center_id?: string | null
}) =>
  callEdge<{ user: ManageUserRow }>({ method: 'POST', token, body })

export const updateUser = (token: string, body: {
  user_id: string
  role: ManageUserRole | null
  center_id?: string | null
  urgency_orders_enabled?: boolean | null
}) =>
  callEdge<{ user: ManageUserRow }>({ method: 'PATCH', token, body })

export const deleteUser = (token: string, user_id: string) =>
  callEdge<{ ok: boolean }>({ method: 'DELETE', token, body: { user_id } })
