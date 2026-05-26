<script setup lang="ts">
import { RouterLink } from 'vue-router'

const modules = [{
  title: 'Intake & screening',
  description: 'Capture retainer details, conflicts, injuries, and treatment info in a consistent flow your staff can follow.',
  icon: 'i-lucide-briefcase'
}, {
  title: 'Retainers & e-sign',
  description: 'Send engagement letters, track signature status, and keep signed PDFs attached to the matter record.',
  icon: 'i-lucide-id-card'
}, {
  title: 'Case ops',
  description: 'Standardize tasks, deadlines, and document requests so nothing falls through between staff and counsel.',
  icon: 'i-lucide-clipboard-list'
}]

const highlights = [{
  title: 'Built for personal injury firms',
  body: 'Matter-centric views for clients, treatment, providers, and documents. No more wrestling with spreadsheets.'
}, {
  title: 'Team visibility',
  body: 'See what’s assigned, what’s overdue, and what’s ready for review across cases and staff.'
}, {
  title: 'Role-based access',
  body: 'Give attorneys, paralegals, and admins the right access without exposing sensitive matter data.'
}]

const stats = [{
  value: 'Pipeline view',
  label: 'See new, pending, signed, and dropped retainers in one place'
}, {
  value: 'Coverage map',
  label: 'Understand where your cases are coming from and where you have coverage'
}, {
  value: 'Finance ready',
  label: 'Stay on top of invoices, payments, and chargebacks without chasing updates'
}]

const steps = [{
  title: 'Review new retainers',
  copy: 'Review new retainer requests, key facts, and contact details. Move fast without digging through messages.'
}, {
  title: 'Track case outcomes',
  copy: 'See what’s signed, dropped, or returned for follow-up. Keep context for every decision.'
}, {
  title: 'Stay on top of billing',
  copy: 'Track invoices and payment status in one view so you know what’s outstanding.'
}]
</script>

<template>
  <div class="min-h-screen bg-[var(--ap-bg)] text-white">
    <div class="relative isolate overflow-hidden bg-gradient-to-b from-[var(--ap-surface)] via-[var(--ap-surface-soft)] to-[var(--ap-bg)]">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--ap-accent)]/40 blur-[120px]" />
        <div class="absolute top-20 right-12 h-48 w-48 rounded-full bg-[var(--ap-amber)]/30 blur-[90px]" />
      </div>

      <header class="flex w-full items-center justify-between px-6 py-6 lg:px-10">
        <RouterLink to="/" class="flex items-center">
          <img
            src="/assets/logo-white.png"
            alt="Accident Payments"
            class="h-8 w-auto sm:h-9"
          >
        </RouterLink>

        <RouterLink to="/login" class="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/40 hover:text-white">
          Log in
        </RouterLink>
      </header>

      <main class="flex w-full flex-col gap-14 px-6 pb-20 pt-10 lg:px-10 lg:pb-32 lg:pt-16">
        <section class="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div class="space-y-6">
            <h1 class="text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              A modern intake and retainer workspace for personal injury firms.
            </h1>
            <p class="text-base leading-relaxed text-white/70 md:text-lg">
              Keep intake, engagement letters, tasks, and case documents in one place. Reduce handoff mistakes,
              speed up retainer collection, and give your team a reliable view of what’s happening on every matter.
            </p>
            <div class="flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:gap-6">
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">250+</span>
                matters managed across participating firms.
              </div>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">12</span>
                firms using structured PI workflows.
              </div>
            </div>
            <div class="flex flex-col gap-3 sm:flex-row">
              <RouterLink
                to="/get-started"
                class="inline-flex items-center justify-center rounded-xl bg-[var(--ap-accent)] px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:translate-y-0.5 sm:w-auto"
                style="box-shadow: 0 15px 30px var(--ap-accent-shadow);"
              >
                Get started
              </RouterLink>
            </div>
          </div>

          <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <div class="rounded-3xl border border-white/10 bg-black/30 p-6">
              <div class="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
                <span>Workflow snapshot</span>
                <span>This month</span>
              </div>
              <div class="mt-6 space-y-4">
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Retainers</p>
                  <p class="mt-2 text-3xl font-semibold text-white">42 matters</p>
                  <p class="text-sm text-white/60">New retainers ready for review and signature follow-up.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Case Outcomes</p>
                  <p class="mt-2 text-3xl font-semibold text-white">17 pending</p>
                  <p class="text-sm text-white/60">Cases pending outcome updates or additional information.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Invoicing</p>
                  <p class="mt-2 text-3xl font-semibold text-white">8 welcomes</p>
                  <p class="text-sm text-white/60">Invoices to review and payment status to confirm.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 lg:grid-cols-3">
          <div v-for="highlight in highlights" :key="highlight.title" class="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
            <h3 class="text-lg font-semibold text-white">{{ highlight.title }}</h3>
            <p class="text-sm leading-relaxed text-white/70">
              {{ highlight.body }}
            </p>
          </div>
        </section>

        <section class="space-y-8">
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/50">Modules</p>
              <h2 class="mt-1 text-3xl font-semibold text-white">Everything your team needs to move a retainer to signature.</h2>
            </div>
            <RouterLink to="/dashboard" class="text-sm font-semibold text-[var(--ap-highlight)] hover:text-white">
              See dashboard view →
            </RouterLink>
          </div>
          <div class="grid gap-5 lg:grid-cols-3">
            <article
              v-for="module in modules"
              :key="module.title"
              class="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 p-6 transition hover:border-white/25"
            >
              <div class="flex items-center gap-3">
                <div class="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                  <UIcon :name="module.icon" class="size-6 text-white" />
                </div>
                <h3 class="text-xl font-semibold text-white">{{ module.title }}</h3>
              </div>
              <p class="mt-4 text-sm text-white/70">
                {{ module.description }}
              </p>
            </article>
          </div>
        </section>

        <section class="grid gap-6 rounded-3xl border border-white/10 bg-black/20 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-6">
            <p class="text-xs uppercase tracking-[0.4em] text-white/50">How teams use it</p>
            <h2 class="text-3xl font-semibold text-white">Built around your retainer workflow.</h2>
            <div class="space-y-4">
              <div
                v-for="(step, index) in steps"
                :key="step.title"
                class="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div class="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#f9d7b1]">
                  <span class="text-white/40">{{ `0${index + 1}` }}</span>
                  {{ step.title }}
                </div>
                <p class="mt-2 text-sm leading-relaxed text-white/70">
                  {{ step.copy }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex flex-col justify-between rounded-3xl border border-white/10 bg-gradient-to-b from-[var(--ap-accent)] to-[var(--ap-accent-dark)] p-6">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Impact</p>
              <h3 class="mt-2 text-3xl font-semibold text-white">A clearer pipeline for attorneys and staff.</h3>
            </div>
            <div class="mt-6 grid gap-4">
              <div v-for="stat in stats" :key="stat.label" class="rounded-2xl bg-black/30 p-4">
                <p class="text-4xl font-semibold text-white">{{ stat.value }}</p>
                <p class="text-sm text-white/70">{{ stat.label }}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
