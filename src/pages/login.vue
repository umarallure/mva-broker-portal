<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null)
const toast = useToast()
const showPassword = ref(false)

const redirectTo = computed(() => {
  const fromQuery = route.query.redirect
  return typeof fromQuery === 'string' && fromQuery.length ? fromQuery : '/retainers'
})


const isSubmitting = ref(false)
const showedRoleBlockMessage = ref(false)

const allowedRoles = new Set(['super_admin', 'broker'])

const showRoleBlockedMessage = () => {
  const description = 'Your account does not have access to this portal. Please contact an administrator if you believe this is a mistake.'
  toast.add({
    title: 'Access restricted',
    description,
    color: 'error'
  })
}

onMounted(() => {
  const reason = route.query.reason
  if (!showedRoleBlockMessage.value && reason === 'role_blocked') {
    showedRoleBlockMessage.value = true
    showRoleBlockedMessage()
  }
})

const handleSubmit = async () => {
  errorMessage.value = null
  isSubmitting.value = true

  try {
    await auth.signInWithPassword(email.value.trim(), password.value)

    const role = auth.state.value.profile?.role
    if (!role || !allowedRoles.has(role)) {
      await auth.signOut()
      showRoleBlockedMessage()
      isSubmitting.value = false
      return
    }

    const isSuperAdmin = auth.state.value.profile?.role === 'super_admin'

    if (!isSuperAdmin && auth.state.value.profile === null) {
      await auth.signOut()
      errorMessage.value = 'Your account is not provisioned yet. Please contact an administrator.'
      toast.add({
        title: 'Login failed',
        description: errorMessage.value,
        color: 'error',
      })
      isSubmitting.value = false
      return
    }

    // Wait for route change before stopping loader
    const unwatch = router.afterEach(() => {
      isSubmitting.value = false
      setTimeout(() => unwatch(), 0)
    })
    await router.replace(redirectTo.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to sign in'
    errorMessage.value = msg
    toast.add({
      title: 'Login failed',
      description: msg,
      color: 'error',
    })
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-(--ap-bg) text-white">
    <div class="relative isolate min-h-screen overflow-hidden bg-linear-to-b from-(--ap-surface) via-(--ap-surface-soft) to-(--ap-bg)">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-(--ap-accent)/40 blur-[120px]" />
        <div class="absolute top-16 right-8 h-56 w-56 rounded-full bg-(--ap-amber-soft) blur-[110px]" />
      </div>

      <main class="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 lg:px-10">
        <section class="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div class="space-y-8">
            <div class="space-y-4">
              <img src="/assets/logo-white.png" alt="Accident Payments" class="h-15 w-auto mb-8" />
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Broker Portal</p>
              <h1 class="text-4xl font-semibold leading-tight text-white md:text-5xl">Secure entry for your MVA broker workspace.</h1>
              <p class="text-base leading-relaxed text-white/70">
                Sign in with your work email to access your broker workspace, manage intake workflows, and keep handoffs moving.
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p class="text-xs uppercase tracking-[0.4em] text-white/50">Need an invite?</p>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  Contact us and we will provision your workspace.
                </p>
              </div>
              <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p class="text-xs uppercase tracking-[0.4em] text-white/50">Security</p>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  We enforce device-based MFA and session timeouts across all orgs.
                </p>
              </div>
            </div>
          </div>

          <div class="rounded-4xl border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div class="space-y-6">
              <div>
                <p class="text-xs uppercase tracking-[0.4em] text-white/60">Sign in</p>
                <h2 class="mt-2 text-3xl font-semibold text-white">Access your workspace</h2>
              </div>

              <form class="space-y-4" @submit.prevent="handleSubmit">
                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">Work email</span>
                  <input
                    v-model="email"
                    type="email"
                    placeholder="you@firm.com"
                    autocomplete="email"
                    class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  >
                </label>

                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">Password</span>
                  <div class="relative">
                    <input
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      placeholder="Enter password"
                      autocomplete="current-password"
                      class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 pr-11 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    >
                    <button
                      type="button"
                      class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-800 hover:text-gray-600"
                      @click="showPassword = !showPassword"
                      :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    >
                      <svg v-if="showPassword" class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                      <svg v-else class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    </button>
                  </div>
                </label>

                <!-- Error toast handled via toast.add, no inline error message here -->

                <button
                  type="submit"
                  class="w-full rounded-2xl bg-(--ap-accent) px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg flex items-center justify-center transition-opacity duration-200"
                  style="box-shadow: 0 12px 24px var(--ap-accent-shadow);"
                  :disabled="isSubmitting"
                  :style="isSubmitting ? 'opacity:0.6; cursor:not-allowed;' : ''"
                >
                  <svg v-if="isSubmitting" class="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  <span>{{ isSubmitting ? '' : 'Continue' }}</span>
                </button>
              </form>

              <p class="text-xs text-white/50">
                This login currently uses Supabase email/password. You can swap in magic links or SSO later.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
