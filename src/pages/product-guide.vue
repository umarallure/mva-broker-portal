<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRoute } from 'vue-router'

import { productGuideSections } from '../data/product-guide'

type GuideAnchor = {
  id: string
  label: string
  sectionId: string
  type: 'section' | 'subsection'
}

const route = useRoute()
const toast = useToast()

const articleRef = ref<HTMLElement | null>(null)
const navListRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const activeAnchorId = ref(productGuideSections[0]?.id ?? '')
const anchorElements = new Map<string, HTMLElement>()
const navElements = new Map<string, HTMLElement>()
let removeScrollListener: (() => void) | null = null

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())

const totalTopics = computed(() =>
  productGuideSections.flatMap(section =>
    section.subsections.map(subsection => ({
      id: subsection.id,
      title: subsection.title,
      sectionId: section.id
    }))
  )
)

const includesQuery = (values: Array<string | undefined>, query: string) =>
  values.some(value => String(value ?? '').toLowerCase().includes(query))

const displayedSections = computed(() => {
  const query = normalizedSearchQuery.value
  if (!query) return productGuideSections

  return productGuideSections
    .map((section) => {
      const sectionHit = includesQuery([
        section.title,
        section.overview,
        ...section.highlights
      ], query)

      const matchedSubsections = section.subsections.filter(subsection =>
        sectionHit || includesQuery([
          subsection.title,
          subsection.summary,
          subsection.note,
          ...subsection.bullets
        ], query)
      )

      if (!sectionHit && !matchedSubsections.length) return null

      return {
        ...section,
        subsections: sectionHit ? section.subsections : matchedSubsections
      }
    })
    .filter((section): section is typeof productGuideSections[number] => Boolean(section))
})

const flatTopics = computed(() =>
  displayedSections.value.flatMap(section =>
    section.subsections.map(subsection => ({
      id: subsection.id,
      title: subsection.title,
      sectionId: section.id
    }))
  )
)

const visibleSectionCount = computed(() => displayedSections.value.length)
const visibleTopicCount = computed(() => flatTopics.value.length)

const anchors = computed<GuideAnchor[]>(() =>
  displayedSections.value.flatMap(section => [
    { id: section.id, label: section.title, sectionId: section.id, type: 'section' as const },
    ...section.subsections.map(subsection => ({
      id: subsection.id,
      label: subsection.title,
      sectionId: section.id,
      type: 'subsection' as const
    }))
  ])
)

const anchorLookup = computed(() => {
  const map = new Map<string, GuideAnchor>()
  anchors.value.forEach(anchor => map.set(anchor.id, anchor))
  return map
})

const activeSection = computed(() => {
  const sectionId = anchorLookup.value.get(activeAnchorId.value)?.sectionId ?? displayedSections.value[0]?.id
  return displayedSections.value.find(section => section.id === sectionId) ?? displayedSections.value[0] ?? null
})

const activeSubsection = computed(() =>
  displayedSections.value.flatMap(section => section.subsections).find(subsection => subsection.id === activeAnchorId.value) ?? null
)

const currentTrailLabel = computed(() =>
  activeSubsection.value?.title ?? activeSection.value?.title ?? (normalizedSearchQuery.value ? 'Search Results' : 'Overview')
)

const registerAnchor = (id: string, el: Element | ComponentPublicInstance | null) => {
  const target = el instanceof HTMLElement
    ? el
    : el && '$el' in el && el.$el instanceof HTMLElement
      ? el.$el
      : null

  if (target) {
    anchorElements.set(id, target)
    return
  }

  anchorElements.delete(id)
}

const registerNavItem = (id: string, el: Element | ComponentPublicInstance | null) => {
  const target = el instanceof HTMLElement
    ? el
    : el && '$el' in el && el.$el instanceof HTMLElement
      ? el.$el
      : null

  if (target) {
    navElements.set(id, target)
    return
  }

  navElements.delete(id)
}

const updateHash = (id: string) => {
  if (typeof window === 'undefined') return

  const nextUrl = `${route.path}#${id}`
  const currentUrl = `${window.location.pathname}${window.location.hash}`
  if (currentUrl !== nextUrl) {
    window.history.replaceState(null, '', nextUrl)
  }
}

const syncActiveAnchor = () => {
  const container = articleRef.value
  if (!container || !anchors.value.length) return

  const threshold = container.scrollTop + 140
  let nextId = anchors.value[0].id

  for (const anchor of anchors.value) {
    const el = anchorElements.get(anchor.id)
    if (!el) continue

    if (el.offsetTop <= threshold) {
      nextId = anchor.id
      continue
    }

    break
  }

  if (activeAnchorId.value !== nextId) {
    activeAnchorId.value = nextId
    updateHash(nextId)
  }
}

const scrollToAnchor = (id: string, behavior: ScrollBehavior = 'smooth') => {
  const container = articleRef.value
  const target = anchorElements.get(id)
  if (!container || !target) return

  activeAnchorId.value = id
  container.scrollTo({ top: Math.max(target.offsetTop - 28, 0), behavior })
  updateHash(id)
}

const ensureActiveNavItemVisible = (behavior: ScrollBehavior = 'smooth') => {
  const container = navListRef.value
  const target = navElements.get(activeAnchorId.value)
  if (!container || !target) return

  const containerTop = container.scrollTop
  const containerBottom = containerTop + container.clientHeight
  const itemTop = target.offsetTop - 12
  const itemBottom = target.offsetTop + target.offsetHeight + 12

  if (itemTop < containerTop) {
    container.scrollTo({ top: Math.max(itemTop, 0), behavior })
    return
  }

  if (itemBottom > containerBottom) {
    container.scrollTo({ top: itemBottom - container.clientHeight, behavior })
  }
}

const copyLink = async (id = activeAnchorId.value) => {
  if (typeof window === 'undefined') return

  const target = anchorLookup.value.get(id)
  const url = new URL(window.location.href)
  url.hash = id

  try {
    await navigator.clipboard.writeText(url.toString())
    toast.add({ title: `${target?.label ?? 'Section'} link copied`, color: 'success' })
  } catch {
    toast.add({
      title: 'Unable to copy link',
      description: 'Copy the URL from the address bar instead.',
      color: 'error'
    })
  }
}

const openHashOnLoad = (hash: string | null, behavior: ScrollBehavior = 'auto') => {
  const targetId = hash?.replace('#', '').trim()
  if (!targetId || !anchorLookup.value.has(targetId)) {
    syncActiveAnchor()
    return
  }

  scrollToAnchor(targetId, behavior)
}

onMounted(() => {
  nextTick(() => {
    const container = articleRef.value
    if (!container) return

    const onScroll = () => syncActiveAnchor()
    container.addEventListener('scroll', onScroll, { passive: true })
    removeScrollListener = () => container.removeEventListener('scroll', onScroll)

    openHashOnLoad(route.hash || null, 'auto')
    ensureActiveNavItemVisible('auto')
  })
})

onBeforeUnmount(() => {
  removeScrollListener?.()
})

watch(() => route.hash, (hash) => {
  nextTick(() => openHashOnLoad(hash || null, 'auto'))
})

watch(activeAnchorId, () => {
  nextTick(() => ensureActiveNavItemVisible('smooth'))
})

watch(displayedSections, (sections) => {
  nextTick(() => {
    const container = articleRef.value

    if (!sections.length) {
      activeAnchorId.value = ''
      if (container) container.scrollTo({ top: 0, behavior: 'auto' })
      return
    }

    if (!anchorLookup.value.has(activeAnchorId.value)) {
      activeAnchorId.value = sections[0].subsections[0]?.id ?? sections[0].id
    }

    if (container) container.scrollTo({ top: 0, behavior: 'auto' })
    syncActiveAnchor()
    ensureActiveNavItemVisible('auto')
  })
})
</script>

<template>
  <UDashboardPanel id="product-guide" class="!overflow-hidden">
    <template #header>
      <UDashboardNavbar title="Product Guide">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-2.5 py-1 text-[11px] font-medium text-muted">
              {{ visibleSectionCount }}<span v-if="searchQuery">/{{ productGuideSections.length }}</span> sections
            </span>
            <span class="rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-2.5 py-1 text-[11px] font-medium text-muted">
              {{ visibleTopicCount }}<span v-if="searchQuery">/{{ totalTopics.length }}</span> topics
            </span>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full flex-col gap-5 overflow-hidden xl:flex-row">
        <aside class="w-full shrink-0 xl:w-[21rem] xl:min-w-[21rem]">
          <div class="ap-fade-in-left flex h-full flex-col gap-4">
            <div class="ap-fade-in ap-delay-1 overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 p-5 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
              <div class="flex items-center justify-between gap-3">
                <span class="inline-flex rounded-full border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ap-accent)]">Search Guide</span>
                <button
                  v-if="searchQuery"
                  type="button"
                  class="inline-flex h-8 items-center rounded-full border border-black/[0.06] bg-white/80 px-3 text-[11px] font-medium text-muted transition-all hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)] dark:border-white/[0.08] dark:bg-white/5"
                  @click="searchQuery = ''"
                >
                  Clear
                </button>
              </div>

              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                size="xl"
                class="mt-3"
                placeholder="Search workflows, sections, or controls..."
              />

              <div class="mt-3 flex items-center justify-between gap-3">
                <p class="text-[11px] leading-5 text-muted">
                  {{ searchQuery ? `Showing ${visibleTopicCount} matching topics across ${visibleSectionCount} sections.` : 'Search by page name, workflow, field label, or feature.' }}
                </p>
                <span class="rounded-full border border-black/[0.06] bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted dark:border-white/[0.08] dark:bg-white/5">
                  {{ searchQuery ? 'Filtered' : 'Live' }}
                </span>
              </div>
            </div>

            <div ref="navListRef" class="ap-fade-in ap-delay-2 relative overflow-y-auto rounded-xl border border-black/[0.06] bg-white/90 p-3 shadow-lg backdrop-blur-sm scrollbar-gutter-stable dark:border-white/[0.08] dark:bg-[#1a1a1a]/60 xl:flex-1">
              <div class="absolute inset-x-0 top-0 h-[2px] bg-[var(--ap-accent)]/85" />
              <template v-if="displayedSections.length">
              <div
                v-for="section in displayedSections"
                :key="section.id"
                class="mb-3 last:mb-0"
              >
                <button
                  type="button"
                  :ref="(el) => registerNavItem(section.id, el)"
                  class="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all"
                  :class="activeSection?.id === section.id ? 'border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10' : 'border-transparent hover:bg-[var(--ap-card-hover)]'"
                  @click="scrollToAnchor(section.id)"
                >
                  <div class="flex items-center gap-3">
                    <span class="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold" :class="activeSection?.id === section.id ? 'bg-[var(--ap-accent)] text-white' : 'bg-[var(--ap-card-border)] text-muted'">{{ section.number }}</span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-highlighted">{{ section.title }}</p>
                      <p class="truncate text-[11px] text-muted">{{ section.highlights[0] }}</p>
                    </div>
                  </div>
                  <UIcon :name="section.icon" class="text-base text-muted" />
                </button>

                <div class="mt-2 space-y-1">
                  <button
                    v-for="subsection in section.subsections"
                    :key="subsection.id"
                    type="button"
                    :ref="(el) => registerNavItem(subsection.id, el)"
                    class="block w-full rounded-xl border px-4 py-3 text-left text-[13px] leading-5 transition-all"
                    :class="activeAnchorId === subsection.id ? 'border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 text-highlighted' : 'border-transparent pl-11 text-muted hover:bg-[var(--ap-card-hover)] hover:text-highlighted'"
                    @click="scrollToAnchor(subsection.id)"
                  >
                    {{ subsection.title }}
                  </button>
                </div>
              </div>
              </template>

              <div
                v-else
                class="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-black/[0.06] bg-white/70 px-6 text-center dark:border-white/[0.08] dark:bg-white/5"
              >
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-search-x" class="text-lg text-[var(--ap-accent)]" />
                </div>
                <p class="mt-4 text-sm font-semibold text-highlighted">No matching guide topics</p>
                <p class="mt-2 text-[13px] leading-6 text-muted">Try broader keywords like "invoice", "order", "filters", or "dashboard".</p>
              </div>
            </div>
          </div>
        </aside>

        <div ref="articleRef" class="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          <article class="ap-fade-in ap-delay-2 mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-black/[0.06] bg-white/90 shadow-lg backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#1a1a1a]/60">
            <header class="border-b border-[var(--ap-card-border)] px-5 py-6 sm:px-7">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <span>Home</span>
                  <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
                  <span>Product Guide</span>
                  <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
                  <span>{{ activeSection?.title }}</span>
                  <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
                  <span class="text-highlighted">{{ currentTrailLabel }}</span>
                </div>

                <button
                  type="button"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] text-muted transition-all hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)]"
                  @click="copyLink()"
                >
                  <UIcon name="i-lucide-link" class="text-sm" />
                </button>
              </div>

              <div class="mt-6 max-w-3xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ap-accent)]">Lawyer Portal Reference</p>
                <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">Product Guide</h1>
                <p class="mt-4 text-[15px] leading-8 text-muted">A step-by-step walkthrough of the portal's core workflows, translated from the internal guide into a searchable article layout that matches the live product.</p>
              </div>

              <div class="mt-6 grid gap-3 md:grid-cols-3">
                <div class="rounded-xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/5">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Scope</span>
                  <p class="mt-2 text-base font-semibold text-highlighted">{{ productGuideSections.length }} portal sections</p>
                  <p class="mt-1 text-sm leading-6 text-muted">Dashboard, Order Map, My Cases, Fulfillment, Invoicing, and Product Offering.</p>
                </div>
                <div class="rounded-xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/5">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Depth</span>
                  <p class="mt-2 text-base font-semibold text-highlighted">{{ totalTopics.length }} anchored topics</p>
                  <p class="mt-1 text-sm leading-6 text-muted">Use the left rail to jump directly into the workflow you need to review.</p>
                </div>
                <div class="rounded-xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/5">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Source</span>
                  <p class="mt-2 text-base font-semibold text-highlighted">Aligned to the portal</p>
                  <p class="mt-1 text-sm leading-6 text-muted">The guide language mirrors the real page labels and controls inside the app.</p>
                </div>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <span
                  v-for="section in displayedSections.length ? displayedSections : productGuideSections"
                  :key="section.id"
                  class="rounded-full border border-[var(--ap-card-border)] bg-white/5 px-3 py-1.5 text-[12px] font-medium text-muted"
                >
                  {{ section.title }}
                </span>
              </div>
            </header>

            <div
              v-if="!displayedSections.length"
              class="px-5 py-16 text-center sm:px-7"
            >
              <div class="mx-auto flex max-w-md flex-col items-center rounded-[1.6rem] border border-dashed border-[var(--ap-card-border)] bg-white/5 px-8 py-10">
                <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-book-x" class="text-xl text-[var(--ap-accent)]" />
                </div>
                <h2 class="mt-5 text-xl font-semibold text-highlighted">No results for "{{ searchQuery }}"</h2>
                <p class="mt-3 text-sm leading-7 text-muted">Try a simpler term or browse the left rail to jump into Dashboard, Orders, Cases, Fulfillment, Invoicing, or Product Offering.</p>
              </div>
            </div>

            <section
              v-for="section in displayedSections"
              :id="section.id"
              :key="section.id"
              :ref="(el) => registerAnchor(section.id, el)"
              class="guide-scroll-target border-b border-[var(--ap-card-border)] px-5 py-6 last:border-b-0 sm:px-7"
            >
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/10 text-sm font-bold text-[var(--ap-accent)]">{{ section.number }}</div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-2xl font-bold text-highlighted">{{ section.title }}</h2>
                    <UIcon :name="section.icon" class="text-base text-[var(--ap-accent)]" />
                  </div>
                  <p class="mt-3 max-w-4xl text-[15px] leading-8 text-muted">{{ section.overview }}</p>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <span
                      v-for="highlight in section.highlights"
                      :key="highlight"
                      class="rounded-full border border-[var(--ap-card-border)] bg-white/5 px-3 py-1.5 text-[12px] font-medium text-muted"
                    >
                      {{ highlight }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="mt-6 space-y-6">
                <section
                  v-for="subsection in section.subsections"
                  :id="subsection.id"
                  :key="subsection.id"
                  :ref="(el) => registerAnchor(subsection.id, el)"
                  class="guide-scroll-target border-t border-dashed border-[var(--ap-card-border)] pt-5"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ap-accent)]">{{ section.number }} topic</p>
                      <h3 class="mt-2 text-xl font-semibold text-highlighted">{{ subsection.title }}</h3>
                    </div>

                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] text-muted transition-all hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)]"
                      @click="copyLink(subsection.id)"
                    >
                      <UIcon name="i-lucide-link-2" class="text-sm" />
                    </button>
                  </div>

                  <p class="mt-3 text-[15px] leading-8 text-muted">{{ subsection.summary }}</p>

                  <ul class="mt-4 list-disc space-y-3 pl-5 text-[15px] leading-7 text-muted">
                    <li
                      v-for="bullet in subsection.bullets"
                      :key="bullet"
                    >
                      {{ bullet }}
                    </li>
                  </ul>

                  <div
                    v-if="subsection.note"
                    class="mt-4 flex gap-3 rounded-2xl border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/8 px-4 py-3"
                  >
                    <UIcon name="i-lucide-lightbulb" class="mt-0.5 text-sm text-[var(--ap-accent)]" />
                    <p class="text-sm leading-6 text-muted">{{ subsection.note }}</p>
                  </div>
                </section>
              </div>
            </section>
          </article>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.guide-scroll-target {
  scroll-margin-top: 1.5rem;
}

.scrollbar-gutter-stable {
  scrollbar-gutter: stable;
}
</style>
