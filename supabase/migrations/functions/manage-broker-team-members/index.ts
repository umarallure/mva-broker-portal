/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const ALLOWED_SECTIONS = [
  'dashboard',
  'order_map',
  'cases',
  'invoicing',
  'attorneys',
  'task_assignment',
  'settings'
] as const

const POSITIONS = ['accounting', 'marketing', 'invoicing', 'intake_team', 'other'] as const
const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
])

const PASSWORD_WORDS = [
  'anchor',
  'autumn',
  'beacon',
  'birch',
  'breeze',
  'brook',
  'cedar',
  'cobalt',
  'coral',
  'crystal',
  'dawn',
  'ember',
  'fern',
  'forest',
  'garden',
  'harbor',
  'hazel',
  'horizon',
  'ivy',
  'jade',
  'juniper',
  'lagoon',
  'lilac',
  'lotus',
  'maple',
  'meadow',
  'mist',
  'moonlight',
  'nova',
  'oasis',
  'olive',
  'orchid',
  'pearl',
  'pine',
  'river',
  'rose',
  'sage',
  'shore',
  'silver',
  'skyline',
  'spring',
  'stone',
  'summit',
  'sunrise',
  'timber',
  'valley',
  'violet',
  'willow'
] as const

type BrokerSection = typeof ALLOWED_SECTIONS[number]
type Position = typeof POSITIONS[number]
type SupabaseAdminClient = ReturnType<typeof createClient>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})

const getEnv = (key: string) => {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`Missing env var: ${key}`)
  return value
}

const getBearerToken = (req: Request) => {
  const [type, token] = (req.headers.get('authorization') ?? '').split(' ')
  return type?.toLowerCase() === 'bearer' && token ? token : null
}

const generatePassword = () => {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  const word = PASSWORD_WORDS[bytes[0] % PASSWORD_WORDS.length]
  return `${word}${new Date().getUTCFullYear()}!`
}

const normalizedString = (value: unknown) => String(value ?? '').trim()
const nullableString = (value: unknown) => normalizedString(value) || null
const normalizedEmail = (value: unknown) => normalizedString(value).toLowerCase()

const parseAllowedSections = (value: unknown): BrokerSection[] => {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(normalizedString)))
    .filter((section): section is BrokerSection => ALLOWED_SECTIONS.includes(section as BrokerSection))
}

const parseMemberFields = (body: Record<string, unknown>) => {
  const fullName = normalizedString(body.full_name)
  const email = normalizedEmail(body.email)
  const phone = nullableString(body.phone)
  const stateValue = normalizedString(body.state).toUpperCase()
  const state = stateValue && STATE_CODES.has(stateValue) ? stateValue : null
  const position = normalizedString(body.position) as Position
  const positionOther = position === 'other' ? nullableString(body.position_other) : null
  const allowedSections = parseAllowedSections(body.allowed_sections)

  if (fullName.length < 2) throw new Error('Full name is required')
  if (!email || !email.includes('@')) throw new Error('A valid email is required')
  if (!POSITIONS.includes(position)) throw new Error('A valid position is required')
  if (position === 'other' && !positionOther) throw new Error('Specify the team member position')
  if (allowedSections.length === 0) throw new Error('Select at least one accessible section')

  return {
    full_name: fullName,
    email,
    phone,
    state,
    position,
    position_other: positionOther,
    shift_availability: normalizedString(body.shift_availability) || 'full_day',
    weekly_availability: body.weekly_availability,
    holiday_hours: body.holiday_hours,
    allowed_sections: allowedSections
  }
}

const loadRequesterContext = async (req: Request) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, res: json(401, { error: 'Missing Authorization header' }) }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false as const, res: json(401, { error: 'Invalid session' }) }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const requesterId = authData.user.id
  const { data: appUser, error: appUserError } = await adminClient
    .from('app_users')
    .select('role')
    .eq('user_id', requesterId)
    .maybeSingle()

  if (appUserError) return { ok: false as const, res: json(500, { error: appUserError.message }) }

  if (appUser?.role === 'broker') {
    return { ok: true as const, adminClient, requesterId, brokerId: requesterId }
  }

  if (appUser?.role === 'broker_member') {
    const { data: member, error: memberError } = await adminClient
      .from('broker_team_members')
      .select('broker_id,allowed_sections')
      .eq('user_id', requesterId)
      .maybeSingle()

    if (memberError) return { ok: false as const, res: json(500, { error: memberError.message }) }
    if (member?.broker_id && member.allowed_sections?.includes('settings')) {
      return { ok: true as const, adminClient, requesterId, brokerId: String(member.broker_id) }
    }
  }

  return { ok: false as const, res: json(403, { error: 'Broker settings access is required' }) }
}

const loadScopedMember = async (client: SupabaseAdminClient, brokerId: string, id: string) => {
  const { data, error } = await client
    .from('broker_team_members')
    .select('*')
    .eq('id', id)
    .eq('broker_id', brokerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Team member not found')
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const ctx = await loadRequesterContext(req)
    if (!ctx.ok) return ctx.res

    const { adminClient, brokerId, requesterId } = ctx

    if (req.method === 'GET') {
      const { data, error } = await adminClient
        .from('broker_team_members')
        .select('*')
        .eq('broker_id', brokerId)
        .order('created_at', { ascending: true })

      if (error) return json(500, { error: error.message })
      return json(200, { members: data ?? [] })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    if (req.method === 'POST') {
      let fields
      try {
        fields = parseMemberFields(body)
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : 'Invalid member details' })
      }

      const temporaryPassword = generatePassword()
      const created = await adminClient.auth.admin.createUser({
        email: fields.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { display_name: fields.full_name }
      })

      if (created.error || !created.data.user) {
        return json(409, { error: created.error?.message ?? 'Unable to create login' })
      }

      const userId = created.data.user.id
      try {
        const { error: appUserError } = await adminClient.from('app_users').upsert({
          user_id: userId,
          email: fields.email,
          display_name: fields.full_name,
          role: 'broker_member',
          center_id: null
        })
        if (appUserError) throw new Error(appUserError.message)

        const { data: member, error: memberError } = await adminClient
          .from('broker_team_members')
          .insert({ ...fields, broker_id: brokerId, user_id: userId })
          .select('*')
          .single()
        if (memberError) throw new Error(memberError.message)

        return json(201, { member, temporary_password: temporaryPassword })
      } catch (error) {
        await adminClient.auth.admin.deleteUser(userId)
        await adminClient.from('app_users').delete().eq('user_id', userId)
        return json(500, { error: error instanceof Error ? error.message : 'Unable to create team member' })
      }
    }

    const id = normalizedString(body.id)
    if (!id) return json(400, { error: 'id is required' })
    const member = await loadScopedMember(adminClient, brokerId, id)

    if (req.method === 'PATCH' && body.action === 'regenerate_password') {
      const temporaryPassword = generatePassword()
      const { error } = await adminClient.auth.admin.updateUserById(member.user_id, {
        password: temporaryPassword
      })
      if (error) return json(500, { error: error.message })
      return json(200, { member, temporary_password: temporaryPassword })
    }

    if (req.method === 'PATCH') {
      let fields
      try {
        fields = parseMemberFields(body)
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : 'Invalid member details' })
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(member.user_id, {
        email: fields.email,
        user_metadata: { display_name: fields.full_name }
      })
      if (authUpdateError) return json(409, { error: authUpdateError.message })

      const { error: appUserError } = await adminClient
        .from('app_users')
        .update({ email: fields.email, display_name: fields.full_name })
        .eq('user_id', member.user_id)
      if (appUserError) return json(500, { error: appUserError.message })

      const { data: updated, error: memberError } = await adminClient
        .from('broker_team_members')
        .update(fields)
        .eq('id', id)
        .eq('broker_id', brokerId)
        .select('*')
        .single()
      if (memberError) return json(500, { error: memberError.message })

      return json(200, { member: updated })
    }

    if (req.method === 'DELETE') {
      if (member.user_id === requesterId) {
        return json(400, { error: 'You cannot delete your own account' })
      }

      const { error } = await adminClient.auth.admin.deleteUser(member.user_id)
      if (error) return json(500, { error: error.message })

      await adminClient.from('broker_team_members').delete().eq('id', id).eq('broker_id', brokerId)
      await adminClient.from('app_users').delete().eq('user_id', member.user_id)
      return json(200, { ok: true })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Unexpected error' })
  }
})
