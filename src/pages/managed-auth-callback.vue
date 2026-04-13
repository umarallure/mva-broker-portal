<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { useManagedLaunch } from '../composables/useManagedLaunch'

type LaunchConsumeResponse = {
  launch?: {
    id: string
    requestedPath: string
    expiresAt: string | null
    consumedAt: string | null
  }
  actor?: {
    user_id?: string
    email?: string | null
    display_name?: string | null
  } | null
  lawyer?: {
    userId: string
    email: string | null
  }
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuth()
const managedLaunch = useManagedLaunch()

const errorMessage = ref<string | null>(null)
const statusLabel = ref('Preparing lawyer portal access...')

const launchId = computed(() => {
  const raw = route.query.launch
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : ''
})

const authRedirectError = computed(() => {
  const description = route.query.error_description
  if (typeof description === 'string' && description.trim()) return description.trim()

  const message = route.query.error
  if (typeof message === 'string' && message.trim()) return message.trim()

  return ''
})

const waitForSession = async (timeoutMs = 12000) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (auth.state.value.session && auth.state.value.user) {
      return auth.state.value.session
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }

  return null
}

const normalizeDestination = (value: string | null | undefined) => {
  if (!value) return '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

const retryCurrentPage = () => {
  window.location.reload()
}

const handleManagedLaunch = async () => {
  if (authRedirectError.value) {
    throw new Error(authRedirectError.value)
  }

  if (!launchId.value) {
    throw new Error('Launch identifier is missing from the callback URL.')
  }

  statusLabel.value = 'Validating the launched lawyer session...'
  await auth.init()

  const session = await waitForSession()
  if (!session) {
    throw new Error('The lawyer session could not be established. Please launch the portal again from Lawyer Management.')
  }

  await auth.refreshProfile()

  statusLabel.value = 'Finishing managed session bootstrap...'
  const { data, error } = await supabase.functions.invoke('consume-lawyer-portal-launch', {
    method: 'POST',
    body: {
      launch_id: launchId.value,
    },
  })

  if (error) {
    throw new Error(error.message || 'Unable to validate the launch record.')
  }

  const payload = (data ?? {}) as LaunchConsumeResponse
  if (!payload.launch || !payload.lawyer?.userId) {
    throw new Error('Launch validation did not return enough session context.')
  }

  managedLaunch.setContext({
    launchId: payload.launch.id,
    actorUserId: payload.actor?.user_id ?? null,
    actorEmail: payload.actor?.email ?? null,
    actorDisplayName: payload.actor?.display_name ?? null,
    lawyerUserId: payload.lawyer.userId,
    lawyerEmail: payload.lawyer.email,
    requestedPath: payload.launch.requestedPath,
    consumedAt: payload.launch.consumedAt,
    expiresAt: payload.launch.expiresAt,
  })

  toast.add({
    title: 'Managed session started',
    description: payload.actor?.email
      ? `Opened from Lawyer Management by ${payload.actor.email}.`
      : 'Lawyer portal opened in a managed session window.',
    color: 'success',
  })

  await router.replace(normalizeDestination(payload.launch.requestedPath))
}

onMounted(async () => {
  try {
    await handleManagedLaunch()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete the managed login.'
    errorMessage.value = message
    managedLaunch.clearContext()

    try {
      await auth.signOut()
    } catch {
      // Local cleanup is enough here.
    }

    toast.add({
      title: 'Managed login failed',
      description: message,
      color: 'error',
    })
  }
})
</script>

<template>
  <div class="min-h-screen bg-(--ap-bg) text-white">
    <div class="relative isolate min-h-screen overflow-hidden bg-linear-to-b from-(--ap-surface) via-(--ap-surface-soft) to-(--ap-bg)">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-(--ap-accent)/40 blur-[120px]" />
        <div class="absolute top-20 right-8 h-56 w-56 rounded-full bg-(--ap-amber-soft) blur-[110px]" />
      </div>

      <main class="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-10 lg:px-10">
        <section class="w-full rounded-4xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div class="space-y-6 text-center">
            <div class="space-y-3">
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Managed Lawyer Session</p>
              <h1 class="text-3xl font-semibold text-white">Opening the attorney portal</h1>
              <p class="text-sm leading-6 text-white/70">
                We are completing the managed launch and preparing the lawyer workspace in this dedicated window.
              </p>
            </div>

            <div
              v-if="!errorMessage"
              class="rounded-3xl border border-white/10 bg-white/5 px-6 py-10"
            >
              <div class="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 border-t-white animate-spin" />
              <p class="text-sm font-medium text-white">{{ statusLabel }}</p>
              <p class="mt-2 text-xs text-white/50">Please keep this window open while we finish the sign-in handoff.</p>
            </div>

            <div
              v-else
              class="rounded-3xl border border-red-400/25 bg-red-500/10 px-6 py-8 text-left"
            >
              <p class="text-sm font-semibold text-red-100">Managed login could not be completed</p>
              <p class="mt-3 text-sm leading-6 text-red-100/80">{{ errorMessage }}</p>

              <div class="mt-6 flex flex-wrap gap-3">
                <UButton color="neutral" variant="solid" to="/login">
                  Return to login
                </UButton>
                <UButton color="neutral" variant="ghost" @click="retryCurrentPage">
                  Try again
                </UButton>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
