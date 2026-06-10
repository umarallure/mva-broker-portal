<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  title: string
  lastUpdated: string
}>()
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <header class="border-b border-white/10">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <RouterLink to="/login" class="inline-flex items-center" aria-label="Accident Payments">
          <img src="/assets/logo.svg" alt="Accident Payments" class="h-7 w-auto">
        </RouterLink>
        <RouterLink to="/login" class="text-xs font-medium text-white/55 transition-colors hover:text-white">
          ← Back to sign in
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <p class="text-xs font-medium uppercase tracking-[0.3em] text-white/40">Broker Portal</p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{{ title }}</h1>
      <p class="mt-3 text-sm text-white/45">Last updated: {{ lastUpdated }}</p>

      <div class="ap-legal mt-10">
        <slot />
      </div>

      <footer class="mt-16 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
        <span>© {{ new Date().getFullYear() }} Accident Payments. All rights reserved.</span>
        <span class="flex items-center gap-4">
          <RouterLink to="/privacy-policy" class="transition-colors hover:text-white/70">Privacy Policy</RouterLink>
          <RouterLink to="/terms" class="transition-colors hover:text-white/70">Terms & Conditions</RouterLink>
          <RouterLink to="/login" class="transition-colors hover:text-white/70">Sign in</RouterLink>
        </span>
      </footer>
    </main>
  </div>
</template>
