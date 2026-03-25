<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

type TierCard = {
  name: string
  price: string
  priceColor: string
  headerGradient: string
  stripClass: string
  hoverBorder: string
  rows: { label: string; value: string; sub?: string; icon: string }[]
}

const tierCards: TierCard[] = [
  {
    name: 'Tier 1',
    price: '$2,500',
    priceColor: 'text-zinc-500 dark:text-zinc-400',
    headerGradient: 'bg-gradient-to-r from-zinc-500/[0.10] via-zinc-500/[0.04] to-transparent dark:from-zinc-400/[0.14] dark:via-zinc-400/[0.06] dark:to-transparent',
    stripClass: 'bg-zinc-400 dark:bg-zinc-500',
    hoverBorder: 'hover:border-zinc-400/40',
    rows: [
      { label: 'Accident Occurred', value: '18–24 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Liability', value: 'Unclear / Contested', icon: 'i-lucide-scale' },
      { label: 'Type of Injury', value: 'Minor Injuries', sub: 'Limited Treatment', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'No Police Report', sub: 'Or Weak Documentation', icon: 'i-lucide-file-x' }
    ]
  },
  {
    name: 'Tier 2',
    price: '$3,500',
    priceColor: 'text-orange-400 dark:text-orange-300',
    headerGradient: 'bg-gradient-to-r from-orange-400/[0.10] via-orange-400/[0.04] to-transparent dark:from-orange-300/[0.14] dark:via-orange-300/[0.06] dark:to-transparent',
    stripClass: 'bg-orange-300 dark:bg-orange-400',
    hoverBorder: 'hover:border-orange-300/40',
    rows: [
      { label: 'Accident Occurred', value: '12–18 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Liability', value: 'Leaning In Client\'s Favor', icon: 'i-lucide-scale' },
      { label: 'Type of Injury', value: 'Moderate Injuries', sub: 'Chiro + Urgent Care', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'Some Supporting Documents', sub: 'Available', icon: 'i-lucide-file-check' }
    ]
  },
  {
    name: 'Tier 3',
    price: '$4,500',
    priceColor: 'text-orange-500 dark:text-orange-400',
    headerGradient: 'bg-gradient-to-r from-orange-500/[0.10] via-orange-500/[0.04] to-transparent dark:from-orange-400/[0.14] dark:via-orange-400/[0.06] dark:to-transparent',
    stripClass: 'bg-orange-400 dark:bg-orange-500',
    hoverBorder: 'hover:border-orange-400/40',
    rows: [
      { label: 'Accident Occurred', value: '6–12 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Liability', value: 'Strong', sub: 'Police Report, Witness', icon: 'i-lucide-scale' },
      { label: 'Type of Injury', value: 'Moderate To Significant', sub: 'Injuries', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'Better Chance of Settlement', sub: 'Due to treatment timeline', icon: 'i-lucide-file-check-2' }
    ]
  },
  {
    name: 'Tier 4',
    price: '$6,000',
    priceColor: '',
    headerGradient: '',
    stripClass: 'tier-4-strip',
    hoverBorder: 'hover:border-[var(--ap-accent-border)]',
    rows: [
      { label: 'Accident Occurred', value: '0–6 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' },
      { label: 'Type of Injury', value: 'Serious Injuries', sub: 'Fracture, Critical Surgery', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'High-Value Case', sub: 'Strong damages + documentation', icon: 'i-lucide-file-badge' }
    ]
  }
]

const placeOrder = () => {
  router.push({ path: '/intake-map', query: { action: 'create-order' } })
}
</script>

<template>
  <UDashboardPanel id="product-portal">
    <template #header>
      <UDashboardNavbar title="Product Offering">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- Header -->
        <div class="ap-fade-in">
          <h2 class="text-lg font-semibold text-highlighted">Pricing Per Case</h2>
          <p class="mt-1 text-sm text-muted">
            Each tier reflects the case value based on recency, liability strength, injury severity, and documentation quality.
          </p>
        </div>

        <!-- ═══ Tier Cards Grid ═══ -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="(tier, idx) in tierCards"
            :key="tier.name"
            class="ap-fade-in group/card flex flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl"
            :class="tier.hoverBorder"
            :style="{ animationDelay: `${200 + idx * 100}ms` }"
          >
            <!-- Card Header — centered text -->
            <div
              class="flex items-center justify-center border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3"
              :class="tier.headerGradient || 'tier-4-header'"
            >
              <span class="text-sm font-semibold text-highlighted">{{ tier.name }}</span>
            </div>

            <!-- Accent Strip -->
            <div class="h-[2px]" :class="tier.stripClass" />

            <!-- Price -->
            <div class="flex items-baseline justify-center gap-1 px-4 pt-5 pb-1">
              <span
                class="text-3xl font-bold"
                :class="tier.priceColor || 'tier-4-price'"
              >
                {{ tier.price }}
              </span>
              <span class="text-xs text-muted">/ case</span>
            </div>

            <!-- Rows -->
            <div class="flex-1 space-y-1 px-4 py-4">
              <div
                v-for="row in tier.rows"
                :key="row.label"
                class="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <UIcon :name="row.icon" class="mt-0.5 size-4 shrink-0 text-muted" />
                <div class="min-w-0">
                  <div class="text-[10px] font-medium uppercase tracking-wider text-muted leading-tight">
                    {{ row.label }}
                  </div>
                  <div class="mt-0.5 text-[13px] font-medium text-highlighted leading-snug">
                    {{ row.value }}
                  </div>
                  <div v-if="row.sub" class="text-xs text-muted leading-snug">
                    {{ row.sub }}
                  </div>
                </div>
              </div>
            </div>

            <!-- CTA Button -->
            <div class="px-4 pb-4">
              <button
                class="tier-btn group/btn flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200"
                :class="[
                  idx === 0 ? 'tier-btn--zinc' : '',
                  idx === 1 ? 'tier-btn--orange-light' : '',
                  idx === 2 ? 'tier-btn--orange' : '',
                  idx === 3 ? 'tier-btn--primary' : ''
                ]"
                @click="placeOrder"
              >
                <span>Place Order</span>
                <UIcon
                  name="i-lucide-arrow-right"
                  class="text-sm transition-transform duration-200 ease-out group-hover/btn:translate-x-1"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* Tier 4 primary orange — uses CSS vars since Tailwind can't target them */
.tier-4-header {
  background: linear-gradient(to right, rgba(174, 64, 16, 0.12), rgba(174, 64, 16, 0.04), transparent);
}
.dark .tier-4-header {
  background: linear-gradient(to right, rgba(174, 64, 16, 0.18), rgba(174, 64, 16, 0.07), transparent);
}
.tier-4-price {
  color: var(--ap-accent);
}
.tier-4-strip {
  background-color: var(--ap-accent);
}

/* ── Tier CTA buttons ── */
.tier-btn {
  border-color: rgba(0, 0, 0, 0.1);
  color: inherit;
  background: transparent;
}
.dark .tier-btn {
  border-color: rgba(255, 255, 255, 0.1);
}

/* Tier 1 — zinc */
.tier-btn--zinc:hover {
  background: rgba(161, 161, 170, 0.1);
  border-color: rgba(161, 161, 170, 0.4);
  color: #71717a;
}
.dark .tier-btn--zinc:hover {
  background: rgba(161, 161, 170, 0.1);
  border-color: rgba(161, 161, 170, 0.35);
  color: #a1a1aa;
}

/* Tier 2 — light orange */
.tier-btn--orange-light:hover {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.4);
  color: #fb923c;
}
.dark .tier-btn--orange-light:hover {
  background: rgba(253, 186, 116, 0.1);
  border-color: rgba(253, 186, 116, 0.35);
  color: #fdba74;
}

/* Tier 3 — stronger orange */
.tier-btn--orange:hover {
  background: rgba(249, 115, 22, 0.1);
  border-color: rgba(249, 115, 22, 0.4);
  color: #f97316;
}
.dark .tier-btn--orange:hover {
  background: rgba(251, 146, 60, 0.1);
  border-color: rgba(251, 146, 60, 0.35);
  color: #fb923c;
}

/* Tier 4 — primary brand orange */
.tier-btn--primary:hover {
  background: var(--ap-accent-soft);
  border-color: var(--ap-accent-border);
  color: var(--ap-accent);
}
</style>
