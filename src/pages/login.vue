<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import LayeredText from '../components/ui/LayeredText.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null)
const toast = useToast()
const showPassword = ref(false)

const heroLines = [
  { top: ' ', bottom: 'INTAKE' },
  { top: 'INTAKE', bottom: 'RETAINERS' },
  { top: 'RETAINERS', bottom: 'CASES' },
  { top: 'CASES', bottom: 'ATTORNEYS' },
  { top: 'ATTORNEYS', bottom: 'INVOICING' },
  { top: 'INVOICING', bottom: 'PAYMENTS' },
  { top: 'PAYMENTS', bottom: ' ' },
]

const redirectTo = computed(() => {
  const fromQuery = route.query.redirect
  return typeof fromQuery === 'string' && fromQuery.length ? fromQuery : auth.getDefaultPath()
})


const isSubmitting = ref(false)
const showedRoleBlockMessage = ref(false)

const allowedRoles = new Set(['super_admin', 'admin', 'broker', 'broker_member'])

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
    const missingBrokerContext = (role === 'broker' || role === 'broker_member') && !auth.state.value.brokerContext
    if (!role || !allowedRoles.has(role) || missingBrokerContext) {
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
  <div class="flex min-h-screen w-full bg-black text-white">
    <!-- ── Left: sign-in form ─────────────────────────────────────────── -->
    <section class="flex w-full flex-col px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
      <header>
        <img src="/assets/logo.svg" alt="Accident Payments" class="h-8 w-auto">
      </header>

      <div class="flex flex-1 items-center justify-center">
        <div class="ap-fade-in w-full max-w-md">
          <div class="space-y-2">
            <h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Welcome back</h1>
            <p class="text-sm leading-relaxed text-white/55">
              Sign in with your email to access your workspace.
            </p>
          </div>

          <form class="mt-8 space-y-5" @submit.prevent="handleSubmit">
            <div class="space-y-2">
              <label for="login-email" class="text-sm font-medium text-white/70">Email address</label>
              <input
                id="login-email"
                v-model="email"
                type="email"
                placeholder="you@firm.com"
                autocomplete="email"
                class="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[var(--ap-accent-border)] focus:bg-white/[0.06] focus:outline-none"
              >
            </div>

            <div class="space-y-2">
              <label for="login-password" class="text-sm font-medium text-white/70">Password</label>
              <div class="relative">
                <input
                  id="login-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Enter your password"
                  autocomplete="current-password"
                  class="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 pr-12 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[var(--ap-accent-border)] focus:bg-white/[0.06] focus:outline-none"
                >
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 transition-colors hover:text-white/80"
                  @click="showPassword = !showPassword"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                >
                  <svg v-if="showPassword"
class="h-5 w-5"
xmlns="http://www.w3.org/2000/svg"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg v-else
class="h-5 w-5"
xmlns="http://www.w3.org/2000/svg"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1"
y1="1"
x2="23"
y2="23"></line>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Error toast handled via toast.add, no inline error message here -->

            <button
              type="submit"
              class="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ap-accent)] px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--ap-accent-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              style="box-shadow: 0 12px 28px var(--ap-accent-shadow);"
              :disabled="isSubmitting"
            >
              <svg v-if="isSubmitting"
class="h-5 w-5 animate-spin text-white"
xmlns="http://www.w3.org/2000/svg"
fill="none"
viewBox="0 0 24 24">
                <circle class="opacity-25"
cx="12"
cy="12"
r="10"
stroke="currentColor"
stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              <span>{{ isSubmitting ? 'Signing in…' : 'Sign in' }}</span>
            </button>
          </form>

          <div class="mt-6 h-px w-full bg-white/10" />
          <p class="mt-4 text-center text-xs leading-relaxed text-white/45">
            By signing in, you agree to our
            <RouterLink to="/terms" class="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline">
              Terms & Conditions
            </RouterLink>
            and our
            <RouterLink to="/privacy-policy" class="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline">
              Privacy Policy
            </RouterLink>.
          </p>

          <div class="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <p class="text-sm leading-relaxed text-white/55">
              <span class="font-medium text-white/80">Need access?</span>
              Contact your administrator to have your workspace provisioned.
            </p>
          </div>
        </div>
      </div>

      <footer class="flex flex-col gap-3 pt-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <span>© {{ new Date().getFullYear() }} Accident Payments. All rights reserved.</span>
        <span class="flex items-center gap-4">
          <RouterLink to="/privacy-policy" class="transition-colors hover:text-white/70">
            Privacy Policy
          </RouterLink>
          <RouterLink to="/terms" class="transition-colors hover:text-white/70">
            Terms & Conditions
          </RouterLink>
        </span>
      </footer>
    </section>

    <!-- ── Right: branded hero (bg.jpg) with tilted portal preview ────── -->
    <section class="relative hidden p-3 lg:block lg:w-1/2">
      <div class="relative h-full w-full overflow-hidden rounded-[28px] ring-1 ring-white/10">
        <!-- background image -->
        <img src="/assets/bg.jpg" alt="" class="absolute inset-0 h-full w-full object-cover">
        <!-- darkening gradient for depth + legibility -->
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/30" />

        <!-- pulsating "Broker Portal" tag (top-left) -->
        <div class="absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
          <span class="relative flex size-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ap-amber)] opacity-75" />
            <span class="relative inline-flex size-2 rounded-full bg-[var(--ap-amber)]" />
          </span>
          Broker Portal
        </div>

        <!-- "All Systems Operational" tag (bottom-right) -->
        <div class="absolute bottom-5 right-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
          <span class="relative flex size-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span class="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          All Systems Operational
        </div>

        <!-- centered layered-text hero -->
        <div class="absolute inset-0 flex items-center justify-center px-8 xl:px-12">
          <LayeredText
            :lines="heroLines"
            class="ap-fade-in text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]"
            font-size="58px"
            font-size-md="36px"
            :line-height="50"
            :line-height-md="32"
            :base-offset="32"
            :base-offset-md="20"
          />
        </div>
      </div>
    </section>
  </div>
</template>
