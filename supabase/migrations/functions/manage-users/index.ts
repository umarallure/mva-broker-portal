/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

type Role = 'super_admin' | 'admin' | 'lawyer' | 'agent' | 'publisher_admin' | 'publisher_closer'

type AppUserRow = {
  user_id: string
  email: string
  display_name: string | null
  role: Role | null
  center_id: string | null
  urgency_orders_enabled: boolean | null
  created_at: string
  updated_at: string
}

type SupabaseAdminClient = ReturnType<typeof createClient>

const fetchUrgencyOrdersEnabledMap = async (
  client: SupabaseAdminClient,
  userIds: string[]
): Promise<Map<string, boolean>> => {
  const map = new Map<string, boolean>()
  if (userIds.length === 0) return map

  const { data, error } = await client
    .from('attorney_profiles')
    .select('user_id, urgency_orders_enabled')
    .in('user_id', userIds)

  if (error) {
    console.log('[manage-users] WARNING: failed to load urgency_orders_enabled', error.message)
    return map
  }

  for (const row of (data ?? []) as Array<{ user_id: string; urgency_orders_enabled: boolean | null }>) {
    if (row.urgency_orders_enabled !== null && row.urgency_orders_enabled !== undefined) {
      map.set(row.user_id, row.urgency_orders_enabled)
    }
  }

  return map
}

const withUrgencyFlag = (row: AppUserRow, map: Map<string, boolean>): AppUserRow => ({
  ...row,
  urgency_orders_enabled: row.role === 'lawyer' ? (map.get(row.user_id) ?? null) : null
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
}

const json = (status: number, body: unknown) => {
  console.log('[manage-users] response', status)
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const getEnv = (key: string) => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') ?? ''
  const [type, token] = auth.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const validateRole = (role: unknown): role is Role =>
  role === 'super_admin' || role === 'admin' || role === 'lawyer' || role === 'agent' || role === 'publisher_admin' || role === 'publisher_closer'

// CHANGED: allow both admin + super_admin
const requireAdminOrSuperAdmin = async (req: Request) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const token = getBearerToken(req)
  if (!token) return { ok: false as const, res: json(401, { error: 'Missing Authorization header' }) }

  console.log('[manage-users] checking auth user')
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData.user) {
    console.log('[manage-users] invalid session', userErr?.message)
    return { ok: false as const, res: json(401, { error: 'Invalid session' }) }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  console.log('[manage-users] checking admin/super_admin role for', userData.user.id)
  const { data: roleRow, error: roleErr } = await adminClient
    .from('app_users')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (roleErr) {
    console.log('[manage-users] role lookup failed', roleErr.message)
    return { ok: false as const, res: json(500, { error: roleErr.message }) }
  }

  if (!roleRow || (roleRow.role !== 'super_admin' && roleRow.role !== 'admin')) {
    console.log('[manage-users] forbidden for non-admin', userData.user.email)
    return { ok: false as const, res: json(403, { error: 'Admin access required' }) }
  }

  return { ok: true as const, adminClient }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    console.log('[manage-users] request', req.method, new URL(req.url).pathname)

    // CHANGED: was requireSuperAdmin(req)
    const ctx = await requireAdminOrSuperAdmin(req)
    if (!ctx.ok) return ctx.res
    const supabaseAdmin = ctx.adminClient

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) return json(500, { error: error.message })

      const rows = (data ?? []) as AppUserRow[]
      const lawyerIds = rows.filter(r => r.role === 'lawyer').map(r => r.user_id)
      const urgencyMap = await fetchUrgencyOrdersEnabledMap(supabaseAdmin, lawyerIds)
      const users = rows.map(row => withUrgencyFlag(row, urgencyMap))

      return json(200, { users })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))

      const email = String(body?.email ?? '').trim().toLowerCase()
      const password = String(body?.password ?? '')
      const roleRaw = body?.role === undefined || body?.role === null ? null : String(body.role)
      const centerId = body?.center_id === undefined || body?.center_id === null ? null : String(body.center_id)

      if (!email) return json(400, { error: 'email is required' })
      if (!password) return json(400, { error: 'password is required' })
      if (roleRaw !== null && !validateRole(roleRaw)) return json(400, { error: 'invalid role' })

      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

      if (created.error || !created.data.user) {
        return json(500, { error: created.error?.message ?? 'Unable to create user' })
      }

      const userId = created.data.user.id
      const role = roleRaw as Role | null

      // 1. Upsert into app_users
      const { error: upsertErr } = await supabaseAdmin
        .from('app_users')
        .upsert({
          user_id: userId,
          email,
          display_name: null,
          role,
          center_id: centerId
        })

      if (upsertErr) return json(500, { error: upsertErr.message })

      // 2. Upsert into profiles (Graceful Fallback)
      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            display_name: null
          },
          { onConflict: 'user_id' }
        )

      // If profile sync fails, log it but DO NOT return an error. Let the process continue.
      if (profileErr) {
        console.log('[manage-users] WARNING: failed to sync profile, but proceeding.', profileErr.message)
      }

      // 3. Upsert into attorney_profiles (Graceful Fallback)
      // Only create for lawyers (so we don't create attorney profiles for agents/admins)
      if (role === 'lawyer') {
        const { error: attorneyErr } = await supabaseAdmin
          .from('attorney_profiles')
          .upsert(
            {
              user_id: userId,
              primary_email: email,
              full_name: null
            },
            { onConflict: 'user_id' }
          )

        // If attorney profile sync fails, log it but DO NOT return an error. Let the process continue.
        if (attorneyErr) {
          console.log('[manage-users] WARNING: failed to sync attorney profile, but proceeding.', attorneyErr.message)
        }
      }

      // 4. Fetch final user row to return
      const { data: row, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(500, { error: rowErr.message })

      const urgencyMap = await fetchUrgencyOrdersEnabledMap(supabaseAdmin, [userId])
      return json(201, { user: withUrgencyFlag(row as AppUserRow, urgencyMap) })
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))

      const userId = String(body?.user_id ?? '').trim()
      const roleRaw = body?.role === undefined || body?.role === null ? null : String(body.role)
      const centerId =
        body?.center_id === undefined ? undefined : body?.center_id === null ? null : String(body.center_id)
      const rawUrgency = body?.urgency_orders_enabled
      const urgencyOrdersEnabled: boolean | undefined =
        rawUrgency === true ? true : rawUrgency === false ? false : undefined

      if (!userId) return json(400, { error: 'user_id is required' })
      if (roleRaw !== null && !validateRole(roleRaw)) return json(400, { error: 'invalid role' })

      const patch: Record<string, unknown> = {}
      patch.role = roleRaw as Role | null
      if (centerId !== undefined) patch.center_id = centerId

      const { error: updateErr } = await supabaseAdmin
        .from('app_users')
        .update(patch)
        .eq('user_id', userId)

      if (updateErr) return json(500, { error: updateErr.message })

      if (urgencyOrdersEnabled !== undefined && roleRaw === 'lawyer') {
        const { error: urgencyErr } = await supabaseAdmin
          .from('attorney_profiles')
          .update({ urgency_orders_enabled: urgencyOrdersEnabled })
          .eq('user_id', userId)

        if (urgencyErr) {
          console.log('[manage-users] WARNING: failed to update urgency_orders_enabled', urgencyErr.message)
        }
      }

      const { data, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(500, { error: rowErr.message })

      const urgencyMap = await fetchUrgencyOrdersEnabledMap(supabaseAdmin, [userId])
      return json(200, { user: withUrgencyFlag(data as AppUserRow, urgencyMap) })
    }

    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => ({}))
      const userId = String(body?.user_id ?? '').trim()
      if (!userId) return json(400, { error: 'user_id is required' })

      const del = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (del.error) return json(500, { error: del.error.message })

      // delete related rows (do not fail the whole request if one delete fails)
      const { error: attorneyDelErr } = await supabaseAdmin.from('attorney_profiles').delete().eq('user_id', userId)
      if (attorneyDelErr) {
        console.log('[manage-users] WARNING: failed to delete attorney_profiles row, but proceeding.', attorneyDelErr.message)
      }

      const { error: appUserDelErr } = await supabaseAdmin.from('app_users').delete().eq('user_id', userId)
      if (appUserDelErr) {
        console.log('[manage-users] WARNING: failed to delete app_users row, but proceeding.', appUserDelErr.message)
      }

      return json(200, { ok: true })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (e) {
    console.log('[manage-users] unhandled error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return json(500, { error: msg })
  }
})
