<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ProductGuideHint from '../components/product-guide/ProductGuideHint.vue'
import { productGuideHints } from '../data/product-guide-hints'

const router = useRouter()
const productOfferingHints = productGuideHints.productOffering

// ── Case category toggle ──
const selectedCategory = ref<'consumer' | 'commercial'>('consumer')
const COMMERCIAL_ORDERS_PAUSED = true

// ── 3D tilt effect (mouse-tracking) ──
const TILT_MAX = 6
const tiltReady = ref(false)

// Wait for the entrance animation to finish, then unlock tilt
onMounted(() => {
  setTimeout(() => { tiltReady.value = true }, 900)
})

const onTiltMove = (e: MouseEvent) => {
  if (!tiltReady.value) return
  const el = e.currentTarget as HTMLElement
  // Strip ap-fade-in on first interaction so its fill-mode stops blocking transforms
  el.classList.remove('ap-fade-in')
  el.style.animation = 'none'

  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const ry = (x - 0.5) * TILT_MAX * 2
  const rx = (0.5 - y) * TILT_MAX * 2

  el.style.transition = 'transform 0.15s ease-out'
  el.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`
}

const onTiltLeave = (e: MouseEvent) => {
  if (!tiltReady.value) return
  const el = e.currentTarget as HTMLElement
  el.style.transition = 'transform 0.5s cubic-bezier(0.03, 0.98, 0.52, 0.99)'
  el.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
}

type TierCard = {
  name: string
  price: string
  priceColor: string
  headerGradient: string
  stripClass: string
  hoverBorder: string
  rows: { label: string; value: string; sub?: string; icon: string }[]
}

const consumerTierCards: TierCard[] = [
  {
    name: 'Tier 1 Transfer',
    price: '$2,500',
    priceColor: 'tier-transfer-price',
    headerGradient: 'tier-transfer-header',
    stripClass: 'tier-transfer-strip',
    hoverBorder: 'hover:border-white/20 dark:hover:border-white/25',
    rows: [
      { label: 'Accident Occurred', value: '12+ Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Type of Injury', value: 'Minor to Moderate', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'Minor Documentation Covered', sub: 'Signed Retainer', icon: 'i-lucide-file-x' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' }
    ]
  },
  {
    name: 'Tier 2 Bronze',
    price: '$3,500',
    priceColor: 'tier-bronze-price',
    headerGradient: 'tier-bronze-header',
    stripClass: 'tier-bronze-strip',
    hoverBorder: 'hover:border-[#CD7F32]/40',
    rows: [
      { label: 'Accident Occurred', value: '6–12 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Type of Injury', value: 'Moderate to Severe', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'Majority Documentation Covered', sub: 'Signed Retainer, Police Report', icon: 'i-lucide-file-check' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' }
    ]
  },
  {
    name: 'Tier 3 Silver',
    price: '$4,500',
    priceColor: 'tier-silver-price',
    headerGradient: 'tier-silver-header',
    stripClass: 'tier-silver-strip',
    hoverBorder: 'hover:border-[#94a3b8]/40',
    rows: [
      { label: 'Accident Occurred', value: '3–6 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Type of Injury', value: 'Moderate to Severe', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'All Documentation Covered', sub: 'Signed Retainer, Proof of Medical Treatment, Police Report', icon: 'i-lucide-file-check-2' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' }
    ]
  },
  {
    name: 'Tier 4 Gold',
    price: '$6,000',
    priceColor: 'tier-gold-price',
    headerGradient: 'tier-gold-header',
    stripClass: 'tier-gold-strip',
    hoverBorder: 'hover:border-[#D4AF37]/40',
    rows: [
      { label: 'Accident Occurred', value: '0–3 Months Ago', icon: 'i-lucide-calendar-clock' },
      { label: 'Type of Injury', value: 'Moderate to Catastrophic', icon: 'i-lucide-heart-pulse' },
      { label: 'Documentation', value: 'All Documentation Covered', sub: 'Insurance, Proof of Medical Treatment, Police Report', icon: 'i-lucide-file-badge' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' }
    ]
  }
]

const commercialTierCards: TierCard[] = [
  {
    name: 'Commercial',
    price: '$7,500',
    priceColor: '',
    headerGradient: '',
    stripClass: 'tier-4-strip',
    hoverBorder: 'hover:border-[var(--ap-accent-border)]',
    rows: [
      { label: 'Case Type', value: 'Commercial Vehicle Accident', icon: 'i-lucide-truck' },
      { label: 'Liability', value: '100% Accepted', sub: 'Or Very Strong Proof', icon: 'i-lucide-scale' },
      { label: 'Documentation', value: 'All Documentation Covered', sub: 'Insurance, Proof of Medical Treatment, Police Report', icon: 'i-lucide-file-badge' },
      { label: 'Type of Injury', value: 'Moderate to Catastrophic', icon: 'i-lucide-heart-pulse' }
    ]
  }
]

const activeTierCards = computed(() => {
  return selectedCategory.value === 'consumer' ? consumerTierCards : commercialTierCards
})

const getTierGuideHint = (tierName: string) => {
  if (tierName === 'Tier 1 Transfer') return productOfferingHints.transferTier
  if (tierName === 'Tier 2 Bronze') return productOfferingHints.bronzeTier
  if (tierName === 'Tier 3 Silver') return productOfferingHints.silverTier
  if (tierName === 'Tier 4 Gold') return productOfferingHints.goldTier
  return productOfferingHints.commercialTier
}

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
        <div class="ap-fade-in flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="text-lg font-semibold text-highlighted">
              {{ selectedCategory === 'consumer' ? 'Consumer Cases — Pricing Per Case' : 'Commercial Cases — Pricing Per Case' }}
              </h2>
              <ProductGuideHint
                :title="productOfferingHints.overview.title"
                :description="productOfferingHints.overview.description"
                :guide-target="productOfferingHints.overview.guideTarget"
              />
            </div>
            <p class="mt-1 text-sm text-muted">
              Each tier reflects the case value based on recency, liability strength, injury severity, and documentation quality.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <ProductGuideHint
              :title="productOfferingHints.categoryToggle.title"
              :description="productOfferingHints.categoryToggle.description"
              :guide-target="productOfferingHints.categoryToggle.guideTarget"
            />
            <USelect
            :model-value="selectedCategory"
            :items="[
              { label: 'Consumer Cases', value: 'consumer' },
              { label: 'Commercial Cases', value: 'commercial' }
            ]"
            value-key="value"
            label-key="label"
            class="w-48 shrink-0"
              @update:model-value="selectedCategory = $event as 'consumer' | 'commercial'"
            />
          </div>
        </div>

        <!-- ═══ Commercial paused notice ═══ -->
        <div
          v-if="selectedCategory === 'commercial' && COMMERCIAL_ORDERS_PAUSED"
          class="ap-fade-in flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/30"
        >
          <UIcon name="i-lucide-info" class="size-5 shrink-0 text-amber-500" />
          <p class="text-sm text-amber-700 dark:text-amber-400">
            Commercial case orders are temporarily closed. Order availability will open soon.
          </p>
        </div>

        <!-- ═══ Tier Cards Grid ═══ -->
        <div
          :class="[
            'grid gap-4',
            selectedCategory === 'consumer'
              ? 'sm:grid-cols-2 xl:grid-cols-4'
              : 'max-w-sm'
          ]"
        >
          <!-- Tilt wrapper — separate from the animated card so ap-fade-in doesn't block inline transforms -->
          <div
            v-for="(tier, idx) in activeTierCards"
            :key="tier.name"
            class="tier-tilt ap-fade-in"
            :style="{ animationDelay: `${200 + idx * 100}ms` }"
            @mousemove="onTiltMove"
            @mouseleave="onTiltLeave"
          >
            <div
              class="group/card flex h-full flex-col rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-[box-shadow,background-color] duration-300 hover:shadow-xl hover:bg-white dark:hover:bg-[#1f1f1f]"
              :class="tier.hoverBorder"
            >
              <!-- Card Header — centered text -->
              <div
                class="flex items-center justify-center overflow-hidden rounded-t-xl border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3"
                :class="tier.headerGradient || 'tier-4-header'"
              >
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-semibold text-highlighted">{{ tier.name }}</span>
                  <ProductGuideHint
                    :title="getTierGuideHint(tier.name).title"
                    :description="getTierGuideHint(tier.name).description"
                    :guide-target="getTierGuideHint(tier.name).guideTarget"
                  />
                </div>
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
              <div class="flex items-center gap-2 px-4 pb-4">
                <button
                  class="tier-btn group/btn flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200"
                  :class="[
                    selectedCategory === 'consumer' && idx === 0 ? 'tier-btn--transfer' : '',
                    selectedCategory === 'consumer' && idx === 1 ? 'tier-btn--bronze' : '',
                    selectedCategory === 'consumer' && idx === 2 ? 'tier-btn--silver' : '',
                    selectedCategory === 'consumer' && idx === 3 ? 'tier-btn--gold' : '',
                    selectedCategory === 'commercial' ? 'tier-btn--commercial' : '',
                    selectedCategory === 'commercial' && COMMERCIAL_ORDERS_PAUSED ? 'cursor-not-allowed' : ''
                  ]"
                  :disabled="selectedCategory === 'commercial' && COMMERCIAL_ORDERS_PAUSED"
                  @click="placeOrder"
                >
                  <span>{{ selectedCategory === 'commercial' && COMMERCIAL_ORDERS_PAUSED ? 'Coming Soon' : 'Place Order' }}</span>
                  <UIcon
                    v-if="!(selectedCategory === 'commercial' && COMMERCIAL_ORDERS_PAUSED)"
                    name="i-lucide-arrow-right"
                    class="text-sm transition-transform duration-200 ease-out group-hover/btn:translate-x-1"
                  />
                </button>
                <ProductGuideHint
                  :title="productOfferingHints.placeOrder.title"
                  :description="productOfferingHints.placeOrder.description"
                  :guide-target="productOfferingHints.placeOrder.guideTarget"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* ── 3D tilt wrapper (separate from ap-fade-in so inline transform works) ── */
.tier-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}

/* ── Tier 4 header / price / strip (CSS var colors) ── */
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

/* ── Tier card colors ── */

/* Bronze — #CD7F32 / rgb(205, 127, 50) */
.tier-bronze-price { color: #CD7F32; }
.dark .tier-bronze-price { color: #d99a5b; }
.tier-bronze-header {
  background: linear-gradient(to right, rgba(205, 127, 50, 0.12), rgba(205, 127, 50, 0.04), transparent);
}
.dark .tier-bronze-header {
  background: linear-gradient(to right, rgba(205, 127, 50, 0.18), rgba(205, 127, 50, 0.07), transparent);
}
.tier-bronze-strip { background-color: #CD7F32; }
.dark .tier-bronze-strip { background-color: #b56e2a; }

/* Silver — #94a3b8 / cool metallic gray */
.tier-silver-price { color: #7a8a9e; }
.dark .tier-silver-price { color: #a8b8cc; }
.tier-silver-header {
  background: linear-gradient(to right, rgba(148, 163, 184, 0.14), rgba(148, 163, 184, 0.05), transparent);
}
.dark .tier-silver-header {
  background: linear-gradient(to right, rgba(168, 184, 204, 0.18), rgba(168, 184, 204, 0.07), transparent);
}
.tier-silver-strip { background-color: #94a3b8; }
.dark .tier-silver-strip { background-color: #8899aa; }

/* Gold — #D4AF37 / rgb(212, 175, 55) */
.tier-gold-price { color: #B8960C; }
.dark .tier-gold-price { color: #D4AF37; }
.tier-gold-header {
  background: linear-gradient(to right, rgba(212, 175, 55, 0.12), rgba(212, 175, 55, 0.04), transparent);
}
.dark .tier-gold-header {
  background: linear-gradient(to right, rgba(212, 175, 55, 0.18), rgba(212, 175, 55, 0.07), transparent);
}
.tier-gold-strip { background-color: #D4AF37; }
.dark .tier-gold-strip { background-color: #b8960c; }

/* ── Tier card colors — Transfer (white accent) ── */
.tier-transfer-price { color: #6b7280; }
.dark .tier-transfer-price { color: #e5e7eb; }
.tier-transfer-header {
  background: linear-gradient(to right, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.12), transparent);
}
.dark .tier-transfer-header {
  background: linear-gradient(to right, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03), transparent);
}
.tier-transfer-strip { background-color: #d1d5db; }
.dark .tier-transfer-strip { background-color: rgba(255, 255, 255, 0.25); }

/* ── Tier CTA buttons ── */

/* Tier 1 — transfer (white accent) */
.tier-btn--transfer {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(0, 0, 0, 0.1);
  color: #6b7280;
}
.dark .tier-btn--transfer {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  color: #d1d5db;
}
.tier-btn--transfer:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.18);
  color: #374151;
}
.dark .tier-btn--transfer:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
  color: #f3f4f6;
}

/* Tier 2 — bronze */
.tier-btn--bronze {
  background: rgba(205, 127, 50, 0.08);
  border-color: rgba(205, 127, 50, 0.25);
  color: #CD7F32;
}
.dark .tier-btn--bronze {
  background: rgba(205, 127, 50, 0.08);
  border-color: rgba(205, 127, 50, 0.2);
  color: #d99a5b;
}
.tier-btn--bronze:hover {
  background: rgba(205, 127, 50, 0.18);
  border-color: rgba(205, 127, 50, 0.45);
  color: #a0612a;
}
.dark .tier-btn--bronze:hover {
  background: rgba(205, 127, 50, 0.16);
  border-color: rgba(205, 127, 50, 0.4);
  color: #e0a86a;
}

/* Tier 3 — silver */
.tier-btn--silver {
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.3);
  color: #7a8a9e;
}
.dark .tier-btn--silver {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.2);
  color: #a8b8cc;
}
.tier-btn--silver:hover {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(148, 163, 184, 0.5);
  color: #5c6b7e;
}
.dark .tier-btn--silver:hover {
  background: rgba(148, 163, 184, 0.16);
  border-color: rgba(148, 163, 184, 0.4);
  color: #c0cfe0;
}

/* Tier 4 — gold */
.tier-btn--gold {
  background: rgba(212, 175, 55, 0.08);
  border-color: rgba(212, 175, 55, 0.25);
  color: #B8960C;
}
.dark .tier-btn--gold {
  background: rgba(212, 175, 55, 0.08);
  border-color: rgba(212, 175, 55, 0.2);
  color: #D4AF37;
}
.tier-btn--gold:hover {
  background: rgba(212, 175, 55, 0.18);
  border-color: rgba(212, 175, 55, 0.45);
  color: #8a7400;
}
.dark .tier-btn--gold:hover {
  background: rgba(212, 175, 55, 0.16);
  border-color: rgba(212, 175, 55, 0.4);
  color: #e6c54a;
}

/* Commercial — matches card accent strip color */
.tier-btn--commercial {
  background: var(--ap-accent-soft);
  border-color: rgba(174, 64, 16, 0.2);
  color: var(--ap-accent);
}
.dark .tier-btn--commercial {
  background: rgba(174, 64, 16, 0.08);
  border-color: rgba(174, 64, 16, 0.18);
  color: var(--ap-accent);
}
</style>
