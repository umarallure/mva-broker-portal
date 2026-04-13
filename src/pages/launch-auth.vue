<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { clearLaunchedPortalWindow, markLaunchedPortalWindow } from '../lib/launchedSession'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuth()

const errorMessage = ref<string | null>(null)
const statusLabel = ref('Preparing secure lawyer access...')

const nextPath = computed(() => {
  const raw = route.query.next
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return '/dashboard'
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  if (value === '/launch-auth' || value.startsWith('/launch-auth?') || value === '/managed-auth/callback' || value.startsWith('/managed-auth/')) {
    return '/dashboard'
  }
  return value
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

const retryCurrentPage = () => {
  window.location.reload()
}

const handleLaunchBootstrap = async () => {
  if (authRedirectError.value) {
    throw new Error(authRedirectError.value)
  }

  markLaunchedPortalWindow()

  statusLabel.value = 'Establishing lawyer session...'
  await auth.init()

  const session = await waitForSession()
  if (!session) {
    throw new Error('The lawyer session could not be established. Please launch the portal again from Lawyer Management.')
  }

  await auth.refreshProfile()

  statusLabel.value = 'Opening lawyer dashboard...'
  await router.replace(nextPath.value)
}

onMounted(async () => {
  try {
    await handleLaunchBootstrap()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete the lawyer launch.'
    errorMessage.value = message
    clearLaunchedPortalWindow()

    try {
      await auth.signOut()
    } catch {
      // Local cleanup is enough here.
    }

    toast.add({
      title: 'Lawyer launch failed',
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
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Lawyer Portal Launch</p>
              <h1 class="text-3xl font-semibold text-white">Opening the attorney portal</h1>
              <p class="text-sm leading-6 text-white/70">
                We are securely starting this lawyer session in a dedicated browser window.
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
              <p class="text-sm font-semibold text-red-100">Lawyer launch could not be completed</p>
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
