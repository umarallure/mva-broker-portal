<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { useProductGuide } from '../composables/useProductGuide'
import type { GuideSection, GuideTopic, GuideSectionWithTopics } from '../lib/product-guide'
import { getDefaultProductGuideSeed } from '../lib/product-guide-seed'
import {
  findProductGuideSelection,
  PRODUCT_GUIDE_SECTION_QUERY_KEY,
  PRODUCT_GUIDE_TOPIC_QUERY_KEY
} from '../lib/product-guide-navigation'

import SectionModal from '../components/product-guide/SectionModal.vue'
import TopicModal from '../components/product-guide/TopicModal.vue'
import DeleteConfirmModal from '../components/product-guide/DeleteConfirmModal.vue'

const toast = useToast()
const route = useRoute()
const { state: authState } = useAuth()
const guide = useProductGuide()

const isAdmin = computed(() => {
  const role = authState.value.profile?.role
  return role === 'admin' || role === 'super_admin'
})

// ── Navigation state ──
const activeSectionId = ref<string | null>(null)
const activeTopicId = ref<string | null>(null)
const searchQuery = ref('')

const filteredSections = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return guide.sections.value

  return guide.sections.value
    .map((section) => {
      const sectionHit = section.title.toLowerCase().includes(query)
      const matchedTopics = section.topics.filter(
        (topic) =>
          sectionHit ||
          topic.title.toLowerCase().includes(query) ||
          topic.overview.toLowerCase().includes(query) ||
          (topic.description && topic.description.toLowerCase().includes(query))
      )

      if (!sectionHit && !matchedTopics.length) return null

      return {
        ...section,
        topics: sectionHit ? section.topics : matchedTopics
      }
    })
    .filter((section): section is GuideSectionWithTopics => section !== null)
})

const activeSection = computed(() =>
  guide.sections.value.find((section) => section.id === activeSectionId.value) ?? guide.sections.value[0] ?? null
)

const activeTopic = computed(() => {
  if (!activeTopicId.value || !activeSection.value) return null
  return activeSection.value.topics.find((t) => t.id === activeTopicId.value) ?? null
})

const getQueryValue = (value: unknown) => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' ? value : null
}

const applyGuideRouteSelection = () => {
  const sectionRef = getQueryValue(route.query[PRODUCT_GUIDE_SECTION_QUERY_KEY])
  if (!sectionRef || !guide.sections.value.length) return

  if (searchQuery.value) {
    searchQuery.value = ''
  }

  const topicRef = getQueryValue(route.query[PRODUCT_GUIDE_TOPIC_QUERY_KEY])
  const selection = findProductGuideSelection(guide.sections.value, {
    sectionId: sectionRef,
    ...(topicRef ? { subsectionId: topicRef } : {})
  })

  if (!selection.sectionId) return

  activeSectionId.value = selection.sectionId
  activeTopicId.value = topicRef ? selection.topicId : null
}

// ── Numbering (derived from position, always up-to-date after reorder) ──
const sectionNumber = (sectionId: string) => {
  const idx = guide.sections.value.findIndex((s) => s.id === sectionId)
  return idx === -1 ? '' : String(idx + 1)
}

const topicNumber = (sectionId: string, topicId: string) => {
  const sIdx = guide.sections.value.findIndex((s) => s.id === sectionId)
  if (sIdx === -1) return ''
  const section = guide.sections.value[sIdx]
  const tIdx = section.topics.findIndex((t) => t.id === topicId)
  if (tIdx === -1) return ''
  return `${sIdx + 1}.${tIdx + 1}`
}

const selectSection = (id: string) => {
  activeSectionId.value = id
  activeTopicId.value = null
}

const selectTopic = (sectionId: string, topicId: string) => {
  activeSectionId.value = sectionId
  activeTopicId.value = topicId
}

// ── Modal state ──
const sectionModalOpen = ref(false)
const topicModalOpen = ref(false)
const deleteModalOpen = ref(false)
const modalLoading = ref(false)
const importLoading = ref(false)

const editingSection = ref<GuideSection | null>(null)
const editingTopic = ref<GuideTopic | null>(null)
const deleteTarget = ref<{ type: 'section' | 'topic'; id: string; title: string } | null>(null)

const openAddSection = () => {
  editingSection.value = null
  sectionModalOpen.value = true
}

const openEditSection = (section: GuideSection) => {
  editingSection.value = section
  sectionModalOpen.value = true
}

const openAddTopic = () => {
  editingTopic.value = null
  topicModalOpen.value = true
}

const openEditTopic = (topic: GuideTopic) => {
  editingTopic.value = topic
  topicModalOpen.value = true
}

const openDeleteConfirm = (type: 'section' | 'topic', id: string, title: string) => {
  deleteTarget.value = { type, id, title }
  deleteModalOpen.value = true
}

const getTopicById = (id: string) => {
  for (const section of guide.sections.value) {
    const topic = section.topics.find((entry) => entry.id === id)
    if (topic) return topic
  }
  return null
}

const cleanupMediaUrls = async (urls: string[], message: string) => {
  if (!urls.length) return
  const results = await Promise.allSettled(urls.map((url) => guide.deleteMedia(url)))
  const failedCount = results.filter((result) => result.status === 'rejected').length
  if (failedCount > 0) {
    toast.add({
      title: 'Media cleanup warning',
      description: `${message}. ${failedCount} file${failedCount === 1 ? '' : 's'} could not be removed from storage.`,
      color: 'warning'
    })
  }
}

const handlePopulateGuide = async () => {
  if (guide.sections.value.length) {
    toast.add({
      title: 'Guide already populated',
      description: 'The default guide import only runs on an empty Product Guide.',
      color: 'warning'
    })
    return
  }

  importLoading.value = true
  try {
    const createdSections = await guide.importTemplate(getDefaultProductGuideSeed())
    const firstSection = createdSections[0] ?? null
    const firstTopic = firstSection?.topics[0] ?? null

    activeSectionId.value = firstSection?.id ?? null
    activeTopicId.value = firstTopic?.id ?? null

    const topicCount = createdSections.reduce((count, section) => count + section.topics.length, 0)
    toast.add({
      title: 'Product Guide populated',
      description: `Imported ${createdSections.length} sections and ${topicCount} topics from the step-by-step guide template.`,
      color: 'success'
    })
  } catch (e: any) {
    toast.add({
      title: 'Import failed',
      description: e.message,
      color: 'error'
    })
  } finally {
    importLoading.value = false
  }
}

// ── Drag-and-drop reordering ──
const dragType = ref<'section' | 'topic' | null>(null)
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const dragSectionContext = ref<string | null>(null)

const onDragStartSection = (e: DragEvent, sectionId: string) => {
  if (!e.dataTransfer) return
  dragType.value = 'section'
  dragId.value = sectionId
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', sectionId)
}

const onDragStartTopic = (e: DragEvent, sectionId: string, topicId: string) => {
  if (!e.dataTransfer) return
  dragType.value = 'topic'
  dragId.value = topicId
  dragSectionContext.value = sectionId
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', topicId)
}

const onDragOver = (e: DragEvent, overId: string) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverId.value = overId
}

const onDragLeave = (id: string) => {
  if (dragOverId.value === id) dragOverId.value = null
}

const onDropSection = async (e: DragEvent, targetId: string) => {
  e.preventDefault()
  dragOverId.value = null

  if (dragType.value !== 'section' || !dragId.value || dragId.value === targetId) {
    resetDrag()
    return
  }

  const ids = guide.sections.value.map((s) => s.id)
  const fromIdx = ids.indexOf(dragId.value)
  const toIdx = ids.indexOf(targetId)
  if (fromIdx === -1 || toIdx === -1) { resetDrag(); return }

  ids.splice(fromIdx, 1)
  ids.splice(toIdx, 0, dragId.value)
  resetDrag()

  try {
    await guide.reorderSections(ids)
  } catch (err: any) {
    toast.add({ title: 'Reorder failed', description: err.message, color: 'error' })
    await guide.load()
  }
}

const onDropTopic = async (e: DragEvent, sectionId: string, targetId: string) => {
  e.preventDefault()
  dragOverId.value = null

  if (dragType.value !== 'topic' || !dragId.value || dragId.value === targetId || dragSectionContext.value !== sectionId) {
    resetDrag()
    return
  }

  const section = guide.sections.value.find((s) => s.id === sectionId)
  if (!section) { resetDrag(); return }

  const ids = section.topics.map((t) => t.id)
  const fromIdx = ids.indexOf(dragId.value)
  const toIdx = ids.indexOf(targetId)
  if (fromIdx === -1 || toIdx === -1) { resetDrag(); return }

  ids.splice(fromIdx, 1)
  ids.splice(toIdx, 0, dragId.value)
  resetDrag()

  try {
    await guide.reorderTopics(sectionId, ids)
  } catch (err: any) {
    toast.add({ title: 'Reorder failed', description: err.message, color: 'error' })
    await guide.load()
  }
}

const resetDrag = () => {
  dragType.value = null
  dragId.value = null
  dragOverId.value = null
  dragSectionContext.value = null
}

// ── Handlers ──
const handleSectionSubmit = async (payload: { title: string; icon: string; sort_order: number }) => {
  modalLoading.value = true
  try {
    if (editingSection.value) {
      await guide.editSection(editingSection.value.id, payload)
      toast.add({ title: 'Section updated', color: 'success' })
    } else {
      const created = await guide.addSection(payload)
      activeSectionId.value = created.id
      toast.add({ title: 'Section created', color: 'success' })
    }
    sectionModalOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    modalLoading.value = false
  }
}

const handleTopicSubmit = async (payload: {
  section_id: string
  title: string
  overview: string
  description: string
  media_file: File | null
  remove_media: boolean
  sort_order: number
}) => {
  modalLoading.value = true
  const previousMediaUrl = editingTopic.value?.media_url ?? null
  const previousMediaType = editingTopic.value?.media_type ?? null
  let nextMediaUrl: string | null = previousMediaUrl
  let nextMediaType: 'image' | 'video' | null = previousMediaType
  let uploadedMediaUrl: string | null = null

  try {
    if (payload.remove_media) {
      nextMediaUrl = null
      nextMediaType = null
    }

    if (payload.media_file) {
      uploadedMediaUrl = await guide.uploadMedia(payload.media_file)
      nextMediaUrl = uploadedMediaUrl
      nextMediaType = payload.media_file.type.startsWith('video/') ? 'video' : 'image'
    }

    if (editingTopic.value) {
      await guide.editTopic(editingTopic.value.id, {
        section_id: payload.section_id,
        title: payload.title,
        overview: payload.overview,
        description: payload.description,
        media_url: nextMediaUrl,
        media_type: nextMediaType,
        sort_order: payload.sort_order
      })

      activeSectionId.value = payload.section_id
      activeTopicId.value = editingTopic.value.id

      if (previousMediaUrl && previousMediaUrl !== nextMediaUrl) {
        await cleanupMediaUrls([previousMediaUrl], 'The topic was updated, but the previous media cleanup was only partially successful')
      }

      toast.add({ title: 'Topic updated', color: 'success' })
    } else {
      const created = await guide.addTopic({
        section_id: payload.section_id,
        title: payload.title,
        overview: payload.overview,
        description: payload.description,
        media_url: nextMediaUrl,
        media_type: nextMediaType,
        sort_order: payload.sort_order
      })
      activeSectionId.value = payload.section_id
      activeTopicId.value = created.id
      toast.add({ title: 'Topic created', color: 'success' })
    }
    topicModalOpen.value = false
  } catch (e: any) {
    if (uploadedMediaUrl) {
      await cleanupMediaUrls([uploadedMediaUrl], 'The topic could not be saved and the new upload cleanup was only partially successful')
    }
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    modalLoading.value = false
  }
}

const handleDelete = async () => {
  if (!deleteTarget.value) return
  modalLoading.value = true
  try {
    if (deleteTarget.value.type === 'section') {
      const section = guide.sections.value.find((entry) => entry.id === deleteTarget.value?.id)
      const mediaUrls = (section?.topics ?? [])
        .map((topic) => topic.media_url)
        .filter((url): url is string => Boolean(url))

      await guide.removeSection(deleteTarget.value.id)
      await cleanupMediaUrls(mediaUrls, 'The section was deleted, but some topic media could not be removed')

      if (activeSectionId.value === deleteTarget.value.id) {
        activeSectionId.value = null
        activeTopicId.value = null
      }
    } else {
      const topic = getTopicById(deleteTarget.value.id)
      await guide.removeTopic(deleteTarget.value.id)
      if (topic?.media_url) {
        await cleanupMediaUrls([topic.media_url], 'The topic was deleted, but its media could not be fully removed')
      }

      if (activeTopicId.value === deleteTarget.value.id) {
        activeTopicId.value = null
      }
    }
    toast.add({ title: `${deleteTarget.value.type === 'section' ? 'Section' : 'Topic'} deleted`, color: 'success' })
    deleteModalOpen.value = false
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    modalLoading.value = false
  }
}

watch(
  () => [
    route.query[PRODUCT_GUIDE_SECTION_QUERY_KEY],
    route.query[PRODUCT_GUIDE_TOPIC_QUERY_KEY],
    guide.sections.value.length
  ],
  applyGuideRouteSelection,
  { immediate: true }
)

onMounted(() => guide.load())
</script>

<template>
  <UDashboardPanel id="product-guide" class="!overflow-hidden">
    <template #header>
      <UDashboardNavbar title="Product Guide">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div v-if="isAdmin" class="flex items-center gap-2">
            <UButton
              v-if="!guide.sections.value.length"
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-file-plus"
              :loading="importLoading"
              :disabled="guide.loading.value || modalLoading"
              @click="handlePopulateGuide"
            >
              Populate Guide
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              color="neutral"
              icon="i-lucide-plus"
              :disabled="importLoading"
              @click="openAddSection"
            >
              Section
            </UButton>
            <UButton
              size="sm"
              icon="i-lucide-plus"
              :disabled="!guide.sections.value.length || importLoading"
              @click="openAddTopic"
            >
              Topic
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full gap-5 overflow-hidden lg:gap-4">
        <!-- ── Left sidebar: single card ── -->
        <aside class="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--ap-card-border)] bg-white/90 dark:bg-[#1a1a1a]/60">
          <!-- Search -->
          <div class="border-b border-[var(--ap-card-border)] p-3">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Search topics..."
              size="sm"
            />
          </div>

          <!-- Topics tree -->
          <nav class="flex-1 overflow-y-auto p-2">
            <template v-if="filteredSections.length">
              <div
                v-for="section in filteredSections"
                :key="section.id"
                class="mb-1"
              >
                <!-- Section item -->
                <div
                  class="group flex w-full items-center gap-1 rounded-lg transition-colors"
                  :class="[
                    activeSection?.id === section.id && !activeTopicId
                      ? 'bg-[var(--ap-accent)]/10'
                      : 'hover:bg-[var(--ap-card-hover)]',
                    dragOverId === section.id && dragType === 'section'
                      ? 'ring-2 ring-[var(--ap-accent)]/40 ring-inset'
                      : ''
                  ]"
                  :draggable="isAdmin && !searchQuery"
                  @dragstart="isAdmin ? onDragStartSection($event, section.id) : undefined"
                  @dragover="isAdmin ? onDragOver($event, section.id) : undefined"
                  @dragleave="onDragLeave(section.id)"
                  @drop="isAdmin ? onDropSection($event, section.id) : undefined"
                  @dragend="resetDrag"
                >
                  <!-- Drag handle -->
                  <div
                    v-if="isAdmin && !searchQuery"
                    class="flex shrink-0 cursor-grab items-center px-1 text-muted opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
                  >
                    <UIcon name="i-lucide-grip-vertical" class="text-xs" />
                  </div>

                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                    :class="activeSection?.id === section.id && !activeTopicId
                      ? 'text-[var(--ap-accent)]'
                      : 'text-highlighted'"
                    @click="selectSection(section.id)"
                  >
                    <UIcon :name="section.icon" class="shrink-0 text-sm" />
                    <span class="min-w-0 flex-1 truncate font-medium">{{ section.title }}</span>
                    <span class="shrink-0 text-[11px] tabular-nums text-muted">{{ sectionNumber(section.id) }}</span>
                  </button>
                </div>

                <!-- Subtopics -->
                <div
                  v-if="section.topics.length"
                  class="ml-4 border-l border-[var(--ap-card-border)] pl-1"
                >
                  <div
                    v-for="topic in section.topics"
                    :key="topic.id"
                    class="group/topic flex items-center rounded-md transition-colors"
                    :class="[
                      activeTopicId === topic.id
                        ? 'bg-[var(--ap-accent)]/10'
                        : 'hover:bg-[var(--ap-card-hover)]',
                      dragOverId === topic.id && dragType === 'topic'
                        ? 'ring-2 ring-[var(--ap-accent)]/40 ring-inset'
                        : ''
                    ]"
                    :draggable="isAdmin && !searchQuery"
                    @dragstart="isAdmin ? onDragStartTopic($event, section.id, topic.id) : undefined"
                    @dragover="isAdmin ? onDragOver($event, topic.id) : undefined"
                    @dragleave="onDragLeave(topic.id)"
                    @drop="isAdmin ? onDropTopic($event, section.id, topic.id) : undefined"
                    @dragend="resetDrag"
                  >
                    <!-- Drag handle -->
                    <div
                      v-if="isAdmin && !searchQuery"
                      class="flex shrink-0 cursor-grab items-center px-0.5 text-muted opacity-0 transition-opacity group-hover/topic:opacity-60 active:cursor-grabbing"
                    >
                      <UIcon name="i-lucide-grip-vertical" class="text-[10px]" />
                    </div>

                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]"
                      :class="activeTopicId === topic.id
                        ? 'font-medium text-[var(--ap-accent)]'
                        : 'text-muted hover:text-highlighted'"
                      @click="selectTopic(section.id, topic.id)"
                    >
                      <span class="min-w-0 flex-1 truncate">{{ topic.title }}</span>
                      <span
                        class="shrink-0 text-[11px] tabular-nums"
                        :class="activeTopicId === topic.id ? 'text-[var(--ap-accent)]' : 'text-muted/60'"
                      >
                        {{ topicNumber(section.id, topic.id) }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- Empty state: search -->
            <div
              v-else-if="searchQuery"
              class="flex flex-col items-center px-4 py-8 text-center"
            >
              <UIcon name="i-lucide-search-x" class="text-lg text-muted" />
              <p class="mt-2 text-sm text-muted">No results for "{{ searchQuery }}"</p>
            </div>

            <!-- Empty state: no data -->
            <div
              v-else-if="!guide.loading.value"
              class="flex flex-col items-center px-4 py-8 text-center"
            >
              <UIcon name="i-lucide-book-open" class="text-lg text-muted" />
              <p class="mt-2 text-sm text-muted">No sections yet</p>
              <UButton
                v-if="isAdmin"
                size="xs"
                variant="ghost"
                class="mt-2"
                :loading="importLoading"
                :disabled="importLoading"
                @click="handlePopulateGuide"
              >
                Populate default guide
              </UButton>
              <UButton
                v-if="isAdmin"
                size="xs"
                variant="ghost"
                class="mt-1"
                :disabled="importLoading"
                @click="openAddSection"
              >
                Add first section
              </UButton>
            </div>
          </nav>
        </aside>

        <!-- ── Right content area ── -->
        <div class="min-w-0 flex-1 overflow-y-auto pr-1">
          <!-- Loading -->
          <div v-if="guide.loading.value" class="flex h-full items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-muted" />
          </div>

          <div
            v-else-if="searchQuery && !filteredSections.length"
            class="flex h-full flex-col items-center justify-center text-center"
          >
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-search-x" class="text-xl text-[var(--ap-accent)]" />
            </div>
            <h2 class="mt-4 text-lg font-semibold text-highlighted">No matching topics</h2>
            <p class="mt-2 max-w-sm text-sm text-muted">
              No Product Guide content matches "{{ searchQuery }}". Clear the search to browse all sections again.
            </p>
          </div>

          <!-- No sections at all -->
          <div
            v-else-if="!guide.sections.value.length"
            class="flex h-full flex-col items-center justify-center text-center"
          >
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-book-open" class="text-xl text-[var(--ap-accent)]" />
            </div>
            <h2 class="mt-4 text-lg font-semibold text-highlighted">Product Guide</h2>
            <p class="mt-2 max-w-sm text-sm text-muted">
              No content has been added yet.
              <template v-if="isAdmin">Use the buttons above to create sections and topics.</template>
            </p>
            <UButton
              v-if="isAdmin"
              size="sm"
              variant="outline"
              color="neutral"
              class="mt-4"
              icon="i-lucide-file-plus"
              :loading="importLoading"
              :disabled="importLoading"
              @click="handlePopulateGuide"
            >
              Populate Guide
            </UButton>
          </div>

          <!-- Active topic view -->
          <article v-else-if="activeTopic" class="mx-auto max-w-4xl">
            <!-- Breadcrumbs -->
            <div class="flex items-center gap-1.5 text-[13px] text-muted">
              <span>Product Guide</span>
              <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
              <button
                type="button"
                class="transition-colors hover:text-highlighted"
                @click="activeTopicId = null"
              >
                {{ sectionNumber(activeSection!.id) }}. {{ activeSection?.title }}
              </button>
              <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
              <span class="text-highlighted">{{ topicNumber(activeSection!.id, activeTopic.id) }} {{ activeTopic.title }}</span>
            </div>

            <!-- Topic header -->
            <div class="mt-5 flex items-start justify-between gap-4">
              <div>
                <p class="text-[13px] font-medium tabular-nums text-[var(--ap-accent)]">{{ topicNumber(activeSection!.id, activeTopic.id) }}</p>
                <h1 class="mt-1 text-2xl font-bold text-highlighted">{{ activeTopic.title }}</h1>
                <p class="mt-2 max-w-3xl text-[15px] leading-7 text-muted">
                  {{ activeTopic.overview }}
                </p>
              </div>
              <div v-if="isAdmin" class="flex shrink-0 gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  @click="openEditTopic(activeTopic)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  @click="openDeleteConfirm('topic', activeTopic.id, activeTopic.title)"
                />
              </div>
            </div>

            <!-- Media -->
            <div
              v-if="activeTopic.media_url"
              class="mt-5 overflow-hidden rounded-xl border border-[var(--ap-card-border)]"
            >
              <div
                v-if="activeTopic.media_type === 'image'"
                class="flex h-72 items-center justify-center bg-[var(--ap-card-hover)]/60 p-4 md:h-[26rem]"
              >
                <img
                  :src="activeTopic.media_url"
                  :alt="activeTopic.title"
                  class="h-full w-full object-contain"
                />
              </div>
              <video
                v-else-if="activeTopic.media_type === 'video'"
                :src="activeTopic.media_url"
                controls
                class="max-h-[26rem] w-full bg-black"
              />
            </div>

            <!-- Description -->
            <div
              v-if="activeTopic.description"
              class="mt-5 whitespace-pre-line text-[15px] leading-8 text-muted"
            >
              {{ activeTopic.description }}
            </div>

            <div
              v-if="!activeTopic.description && !activeTopic.media_url"
              class="mt-8 rounded-xl border border-dashed border-[var(--ap-card-border)] px-6 py-10 text-center"
            >
              <p class="text-sm text-muted">Only the overview has been added so far. Add media or a detailed description to complete this topic.</p>
              <UButton
                v-if="isAdmin"
                size="sm"
                variant="ghost"
                class="mt-3"
                @click="openEditTopic(activeTopic)"
              >
                Add content
              </UButton>
            </div>
          </article>

          <!-- Section overview (no topic selected) -->
          <article v-else-if="activeSection" class="mx-auto max-w-4xl">
            <!-- Breadcrumbs -->
            <div class="flex items-center gap-1.5 text-[13px] text-muted">
              <span>Product Guide</span>
              <UIcon name="i-lucide-chevron-right" class="text-[10px]" />
              <span class="text-highlighted">{{ sectionNumber(activeSection.id) }}. {{ activeSection.title }}</span>
            </div>

            <!-- Section header -->
            <div class="mt-5 flex items-start justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 text-sm font-bold text-[var(--ap-accent)]">
                  {{ sectionNumber(activeSection.id) }}
                </div>
                <h1 class="text-2xl font-bold text-highlighted">{{ activeSection.title }}</h1>
              </div>
              <div v-if="isAdmin" class="flex shrink-0 gap-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-pencil"
                  @click="openEditSection(activeSection)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  @click="openDeleteConfirm('section', activeSection.id, activeSection.title)"
                />
              </div>
            </div>

            <!-- Topics list -->
            <div v-if="activeSection.topics.length" class="mt-6 space-y-3">
              <button
                v-for="topic in activeSection.topics"
                :key="topic.id"
                type="button"
                class="flex w-full items-start gap-4 rounded-xl border border-[var(--ap-card-border)] p-4 text-left transition-colors hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/5"
                @click="selectTopic(activeSection!.id, topic.id)"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-card-border)] text-[11px] font-semibold tabular-nums text-muted">
                  {{ topicNumber(activeSection!.id, topic.id) }}
                </span>
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold text-highlighted">{{ topic.title }}</h3>
                  <p
                    v-if="topic.overview || topic.description"
                    class="mt-1 line-clamp-2 text-[13px] leading-6 text-muted"
                  >
                    {{ topic.overview || topic.description }}
                  </p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="mt-1 shrink-0 text-sm text-muted" />
              </button>
            </div>

            <!-- No topics yet -->
            <div
              v-else
              class="mt-6 rounded-xl border border-dashed border-[var(--ap-card-border)] px-6 py-10 text-center"
            >
              <p class="text-sm text-muted">No topics in this section yet.</p>
              <UButton
                v-if="isAdmin"
                size="sm"
                variant="ghost"
                class="mt-3"
                @click="openAddTopic"
              >
                Add a topic
              </UButton>
            </div>
          </article>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <SectionModal
    :open="sectionModalOpen"
    :section="editingSection"
    :loading="modalLoading"
    :section-count="guide.sections.value.length"
    @update:open="sectionModalOpen = $event"
    @submit="handleSectionSubmit"
  />

  <TopicModal
    :open="topicModalOpen"
    :topic="editingTopic"
    :section-id="activeSection?.id ?? ''"
    :sections="(guide.sections.value as GuideSectionWithTopics[])"
    :loading="modalLoading"
    :topic-count="activeSection?.topics.length ?? 0"
    @update:open="topicModalOpen = $event"
    @submit="handleTopicSubmit"
  />

  <DeleteConfirmModal
    :open="deleteModalOpen"
    :title="`Delete ${deleteTarget?.type ?? 'item'}`"
    :description="`Are you sure you want to delete '${deleteTarget?.title ?? ''}'? This action cannot be undone.${deleteTarget?.type === 'section' ? ' All topics within this section will also be deleted.' : ''}`"
    :loading="modalLoading"
    @update:open="deleteModalOpen = $event"
    @confirm="handleDelete"
  />
</template>
