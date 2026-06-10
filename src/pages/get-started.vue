<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { z } from 'zod'

import { supabase } from '../lib/supabase'

const LOGO_SRC = '/logo.svg'

const injuryOptions = [
  { value: 'motor_vehicle_accident', label: 'Motor Vehicle Accident (MVA)' },
  { value: 'slip_and_fall', label: 'Slip & Fall' },
  { value: 'workplace_injury', label: 'Workplace Injury' },
  { value: 'premises_liability', label: 'Premises Liability' },
  { value: 'wrongful_death', label: 'Wrongful Death' },
  { value: 'medical_malpractice', label: 'Medical Malpractice' },
  { value: 'product_liability', label: 'Product Liability' },
  { value: 'other', label: 'Other injury matters' }
] as const

const states = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
] as const

type InjuryValue = typeof injuryOptions[number]['value']

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  fullName: z.string().trim().min(2, 'Enter your full name'),
  phone: z.string().trim().min(7, 'Enter a valid phone number'),
  state: z.enum(states, { message: 'Select your state' }),
  injuryCaseTypes: z.array(z.string()).min(1, 'Select at least one case type')
})

type FormState = z.infer<typeof schema>

const form = ref<FormState>({
  email: '',
  fullName: '',
  phone: '',
  state: 'CA',
  injuryCaseTypes: []
})

const fieldErrors = ref<Partial<Record<keyof FormState, string>>>({})
const formError = ref<string | null>(null)
const isSubmitting = ref(false)
const isSuccess = ref(false)

const selectedLabelSummary = computed(() => {
  if (!form.value.injuryCaseTypes.length) return 'None selected'
  const labels = injuryOptions
    .filter((opt) => form.value.injuryCaseTypes.includes(opt.value))
    .map((opt) => opt.label)
  return labels.join(', ')
})

const toggleInjuryType = (value: InjuryValue) => {
  const current = new Set(form.value.injuryCaseTypes)
  if (current.has(value)) current.delete(value)
  else current.add(value)
  form.value.injuryCaseTypes = Array.from(current)
}

const validate = () => {
  fieldErrors.value = {}
  formError.value = null

  const result = schema.safeParse(form.value)
  if (result.success) return true

  const issues = result.error.issues
  for (const issue of issues) {
    const key = issue.path[0] as keyof FormState | undefined
    if (!key) continue
    if (!fieldErrors.value[key]) fieldErrors.value[key] = issue.message
  }

  return false
}

const handleSubmit = async () => {
  if (isSubmitting.value) return

  const ok = validate()
  if (!ok) return

  isSubmitting.value = true
  formError.value = null

  try {
    const { error } = await supabase
      .from('lawyer_onboarding')
      .insert({
        email: form.value.email.trim().toLowerCase(),
        full_name: form.value.fullName.trim(),
        phone: form.value.phone.trim(),
        state: form.value.state,
        injury_case_types: form.value.injuryCaseTypes
      })

    if (error) throw error

    isSuccess.value = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to submit your details'
    formError.value = msg
  } finally {
    isSubmitting.value = false
  }
}

const reset = () => {
  isSuccess.value = false
  formError.value = null
  fieldErrors.value = {}
  form.value = {
    email: '',
    fullName: '',
    phone: '',
    state: 'CA',
    injuryCaseTypes: []
  }
}
</script>

<template>
  <div class="min-h-screen bg-[var(--ap-bg)] text-white">
    <div class="relative isolate overflow-hidden bg-gradient-to-b from-[var(--ap-surface)] via-[var(--ap-surface-soft)] to-[var(--ap-bg)]">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--ap-accent)]/40 blur-[120px]" />
        <div class="absolute top-16 right-8 h-56 w-56 rounded-full bg-[var(--ap-amber-soft)] blur-[110px]" />
      </div>

      <header class="flex w-full items-center justify-between px-6 py-6 lg:px-10">
        <RouterLink to="/" class="flex items-center gap-3">
          <img :src="LOGO_SRC" alt="Accident Payments" class="h-10 w-auto" />
        </RouterLink>

        <div class="flex items-center gap-3 text-sm font-medium text-white/70">
          <RouterLink to="/login" class="rounded-full border border-white/15 px-4 py-2 transition hover:border-white/40 hover:text-white">
            Log in
          </RouterLink>
        </div>
      </header>

      <main class="w-full px-6 lg:px-10">
        <section class="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div class="space-y-8">
            <div class="space-y-4">
              <p class="text-xs uppercase tracking-[0.4em] text-white/50">Get started</p>
              <h1 class="text-4xl font-semibold leading-tight text-white md:text-5xl">
                Tell us about your practice. We’ll tailor your Accident Payments workspace.
              </h1>
              <p class="text-base leading-relaxed text-white/70">
                Accident Payments helps plaintiff-side firms move faster from intake to signed representation—without losing
                the details that win cases.
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p class="text-xs uppercase tracking-[0.4em] text-white/50">Why this form</p>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  We use these details to route you to the right onboarding flow and confirm coverage for your state.
                </p>
              </div>
              <div class="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p class="text-xs uppercase tracking-[0.4em] text-white/50">What happens next</p>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  You’ll get a short follow-up email with recommended templates, playbooks, and an invite to your workspace.
                </p>
              </div>
            </div>

            <div class="rounded-3xl border border-white/10 bg-black/20 p-6">
              <h2 class="text-lg font-semibold text-white">Accident Payments is built for injury law workflows</h2>
              <div class="mt-4 grid gap-3">
                <div class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div class="mt-1 size-2 rounded-full bg-[var(--ap-highlight)]" />
                  <div>
                    <p class="text-sm font-semibold text-white">Keep every matter audit-ready</p>
                    <p class="mt-1 text-sm text-white/70">Traceable intake, document trails, and structured client updates.</p>
                  </div>
                </div>
                <div class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div class="mt-1 size-2 rounded-full bg-[var(--ap-highlight)]" />
                  <div>
                    <p class="text-sm font-semibold text-white">Standardize your MVA playbook</p>
                    <p class="mt-1 text-sm text-white/70">Retainer, profiling, and onboarding checklists tuned to injury cases.</p>
                  </div>
                </div>
                <div class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div class="mt-1 size-2 rounded-full bg-[var(--ap-highlight)]" />
                  <div>
                    <p class="text-sm font-semibold text-white">Collaborate without email threads</p>
                    <p class="mt-1 text-sm text-white/70">Role-based access for counsel, staff, and external partners.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div v-if="isSuccess" class="space-y-6">
              <div>
                <p class="text-xs uppercase tracking-[0.4em] text-white/60">Submitted</p>
                <h2 class="mt-2 text-3xl font-semibold text-white">Thanks — we’ll reach out shortly.</h2>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  We’ve received your details. Keep an eye on your inbox for next steps.
                </p>
              </div>

              <div class="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p class="text-xs uppercase tracking-[0.4em] text-white/50">What you shared</p>
                <dl class="mt-3 space-y-2 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-white/60">Email</dt>
                    <dd class="text-right text-white">{{ form.email }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-white/60">Name</dt>
                    <dd class="text-right text-white">{{ form.fullName }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-white/60">Phone</dt>
                    <dd class="text-right text-white">{{ form.phone }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-white/60">State</dt>
                    <dd class="text-right text-white">{{ form.state }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-white/60">Case types</dt>
                    <dd class="text-right text-white/90">{{ selectedLabelSummary }}</dd>
                  </div>
                </dl>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row">
                <RouterLink
                  to="/"
                  class="flex-1 rounded-2xl border border-white/15 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/40 hover:text-white"
                >
                  Back to home
                </RouterLink>
                <button
                  type="button"
                  class="flex-1 rounded-2xl bg-[var(--ap-accent)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg"
                  style="box-shadow: 0 12px 24px var(--ap-accent-shadow);"
                  @click="reset"
                >
                  Submit another
                </button>
              </div>
            </div>

            <div v-else class="space-y-6">
              <div>
                <p class="text-xs uppercase tracking-[0.4em] text-white/60">Onboarding</p>
                <h2 class="mt-2 text-3xl font-semibold text-white">Request a workspace</h2>
                <p class="mt-3 text-sm leading-relaxed text-white/70">
                  Share a few details so we can set you up with the right templates and workflows.
                </p>
              </div>

              <form class="space-y-4" @submit.prevent="handleSubmit">
                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">Work email <span class="text-red-400">*</span></span>
                  <input
                    v-model="form.email"
                    type="email"
                    placeholder="you@firm.com"
                    autocomplete="email"
                    class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  >
                  <span v-if="fieldErrors.email" class="text-xs text-red-100">{{ fieldErrors.email }}</span>
                </label>

                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">Full name <span class="text-red-400">*</span></span>
                  <input
                    v-model="form.fullName"
                    type="text"
                    placeholder="Jane Doe"
                    autocomplete="name"
                    class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  >
                  <span v-if="fieldErrors.fullName" class="text-xs text-red-100">{{ fieldErrors.fullName }}</span>
                </label>

                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">Phone number <span class="text-red-400">*</span></span>
                  <input
                    v-model="form.phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    autocomplete="tel"
                    class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  >
                  <span v-if="fieldErrors.phone" class="text-xs text-red-100">{{ fieldErrors.phone }}</span>
                </label>

                <label class="block space-y-2 text-sm">
                  <span class="text-white/80">State <span class="text-red-400">*</span></span>
                  <select
                    v-model="form.state"
                    class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:border-white/40 focus:outline-none"
                  >
                    <option v-for="st in states"
:key="st"
:value="st"
class="bg-[var(--ap-bg)]">
                      {{ st }}
                    </option>
                  </select>
                  <span v-if="fieldErrors.state" class="text-xs text-red-100">{{ fieldErrors.state }}</span>
                </label>

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-sm text-white/80">Injury case types you handle <span class="text-red-400">*</span></span>
                    <span class="text-xs text-white/50">{{ form.injuryCaseTypes.length }} selected</span>
                  </div>

                  <div class="grid gap-2 sm:grid-cols-2">
                    <button
                      v-for="option in injuryOptions"
                      :key="option.value"
                      type="button"
                      class="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition"
                      :class="form.injuryCaseTypes.includes(option.value)
                        ? 'border-[color:var(--ap-accent-border)] bg-[color:var(--ap-accent-soft)] text-white'
                        : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25'"
                      @click="toggleInjuryType(option.value)"
                    >
                      <span class="font-medium">{{ option.label }}</span>
                      <span
                        class="size-2 rounded-full"
                        :class="form.injuryCaseTypes.includes(option.value) ? 'bg-[var(--ap-highlight)]' : 'bg-white/20'"
                      />
                    </button>
                  </div>

                  <span v-if="fieldErrors.injuryCaseTypes" class="text-xs text-red-100">{{ fieldErrors.injuryCaseTypes }}</span>
                </div>

                <p v-if="formError" class="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {{ formError }}
                </p>

                <button
                  type="submit"
                  class="w-full rounded-2xl bg-[var(--ap-accent)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
                  style="box-shadow: 0 12px 24px var(--ap-accent-shadow);"
                  :disabled="isSubmitting"
                >
                  {{ isSubmitting ? 'Submitting…' : 'Get started' }}
                </button>

                <p class="text-xs leading-relaxed text-white/50">
                  By submitting, you agree to receive onboarding messages from Accident Payments. We do not sell your data.
                </p>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
