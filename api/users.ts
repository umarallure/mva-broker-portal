import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type Role = 'super_admin' | 'admin' | 'lawyer' | 'agent'

type AppUserRow = {
  user_id: string
  email: string
  display_name: string | null
  role: Role | null
  created_at: string
  updated_at: string
}

const ensureAttorneyProfileExists = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  options: {
    userId: string
    email?: string | null
    displayName?: string | null
  }
) => {
  const payload: {
    user_id: string
    primary_email?: string
    full_name?: string
  } = {
    user_id: options.userId
  }

  const email = String(options.email ?? '').trim().toLowerCase()
  if (email) payload.primary_email = email

  const displayName = String(options.displayName ?? '').trim()
  if (displayName) payload.full_name = displayName

  const { error } = await supabaseAdmin
    .from('attorney_profiles')
    .upsert(payload, {
      onConflict: 'user_id',
      ignoreDuplicates: true
    })

  if (error) {
    throw new Error(error.message || 'Failed to create attorney profile')
  }
}

const getEnv = (key: string) => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing ${key}`)
  return val
}

const json = (res: VercelResponse, status: number, body: unknown) => {
  res.status(status).setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

const getBearerToken = (req: VercelRequest) => {
  const raw = req.headers.authorization
  if (!raw) return null
  const parts = raw.split(' ')
  if (parts.length !== 2) return null
  if (parts[0].toLowerCase() !== 'bearer') return null
  return parts[1]
}

const requireSuperAdmin = async (req: VercelRequest) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const token = getBearerToken(req)
  if (!token) return { ok: false as const, status: 401, error: 'Missing Authorization header' }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token)
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: 'Invalid session' }
  }

  const requesterId = userData.user.id

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from('app_users')
    .select('role')
    .eq('user_id', requesterId)
    .maybeSingle()

  if (roleErr) {
    return { ok: false as const, status: 500, error: roleErr.message }
  }

  if (!roleRow || roleRow.role !== 'super_admin') {
    return { ok: false as const, status: 403, error: 'Super admin access required' }
  }

  return { ok: true as const, requesterId, supabaseAdmin }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireSuperAdmin(req)
    if (!admin.ok) return json(res, admin.status, { error: admin.error })

    const supabaseUrl = getEnv('SUPABASE_URL')
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAdmin = admin.supabaseAdmin

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) return json(res, 500, { error: error.message })
      return json(res, 200, { users: data as AppUserRow[] })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const email = String(body?.email ?? '').trim().toLowerCase()
      const displayName = body?.display_name === null || body?.display_name === undefined
        ? null
        : String(body.display_name).trim()
      const role = body?.role === null || body?.role === undefined ? null : String(body.role) as Role

      if (!email.length) return json(res, 400, { error: 'email is required' })
      if (role && !['super_admin', 'admin', 'lawyer', 'agent'].includes(role)) return json(res, 400, { error: 'invalid role' })

      const { data: inviteData, error: inviteErr } = await createClient(supabaseUrl, serviceRoleKey)
        .auth.admin.inviteUserByEmail(email, {
          data: displayName ? { display_name: displayName } : undefined
        })

      if (inviteErr || !inviteData.user) {
        return json(res, 500, { error: inviteErr?.message ?? 'Unable to create user' })
      }

      const userId = inviteData.user.id

      const { error: upsertErr } = await supabaseAdmin
        .from('app_users')
        .upsert({
          user_id: userId,
          email,
          display_name: displayName,
          role
        })

      if (upsertErr) return json(res, 500, { error: upsertErr.message })

      const { data: row, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(res, 500, { error: rowErr.message })

      if (row.role === 'lawyer') {
        await ensureAttorneyProfileExists(supabaseAdmin, {
          userId,
          email: row.email,
          displayName: row.display_name
        })
      }

      return json(res, 201, { user: row as AppUserRow })
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const userId = String(body?.user_id ?? '').trim()
      const role = body?.role === undefined ? undefined : (body.role === null ? null : String(body.role) as Role)
      const displayName = body?.display_name === undefined
        ? undefined
        : (body.display_name === null ? null : String(body.display_name).trim())

      if (!userId.length) return json(res, 400, { error: 'user_id is required' })
      if (role !== undefined && role !== null && !['super_admin', 'admin', 'lawyer', 'agent'].includes(role)) {
        return json(res, 400, { error: 'invalid role' })
      }

      const patch: Partial<Pick<AppUserRow, 'role' | 'display_name'>> = {}
      if (role !== undefined) patch.role = role
      if (displayName !== undefined) patch.display_name = displayName

      const { error: updateErr } = await supabaseAdmin
        .from('app_users')
        .update(patch)
        .eq('user_id', userId)

      if (updateErr) return json(res, 500, { error: updateErr.message })

      const { data: row, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(res, 500, { error: rowErr.message })

      if (row.role === 'lawyer') {
        await ensureAttorneyProfileExists(supabaseAdmin, {
          userId,
          email: row.email,
          displayName: row.display_name
        })
      }

      return json(res, 200, { user: row as AppUserRow })
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const userId = String(body?.user_id ?? '').trim()
      if (!userId.length) return json(res, 400, { error: 'user_id is required' })

      const { error: delAuthErr } = await createClient(supabaseUrl, serviceRoleKey)
        .auth.admin.deleteUser(userId)

      if (delAuthErr) return json(res, 500, { error: delAuthErr.message })

      await supabaseAdmin.from('app_users').delete().eq('user_id', userId)

      return json(res, 200, { ok: true })
    }

    return json(res, 405, { error: 'Method not allowed' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error'
    return json(res, 500, { error: msg })
  }
}
