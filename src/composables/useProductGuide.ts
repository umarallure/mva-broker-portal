import { ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import {
  listSections,
  createSection,
  updateSection,
  deleteSection,
  createTopic,
  updateTopic,
  deleteTopic,
  uploadGuideMedia,
  deleteGuideMedia,
  type GuideSectionWithTopics
} from '../lib/product-guide'
import type { ProductGuideSeedSection } from '../lib/product-guide-seed'

const _useProductGuide = () => {
  const sections = ref<GuideSectionWithTopics[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : 'Something went wrong.'
  }

  const load = async () => {
    loading.value = true
    error.value = null
    try {
      sections.value = await listSections()
    } catch (errorValue: unknown) {
      error.value = getErrorMessage(errorValue)
    } finally {
      loading.value = false
    }
  }

  const addSection = async (input: {
    guide_key?: string | null
    title: string
    icon?: string
    sort_order?: number
  }) => {
    const created = await createSection(input)
    sections.value.push({ ...created, topics: [] })
    sections.value.sort((a, b) => a.sort_order - b.sort_order)
    return created
  }

  const editSection = async (id: string, input: { title?: string; icon?: string; sort_order?: number }) => {
    const updated = await updateSection(id, input)
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx !== -1) {
      sections.value[idx] = { ...sections.value[idx], ...updated }
      sections.value.sort((a, b) => a.sort_order - b.sort_order)
    }
    return updated
  }

  const removeSection = async (id: string) => {
    await deleteSection(id)
    sections.value = sections.value.filter((s) => s.id !== id)
  }

  const addTopic = async (input: {
    section_id: string
    guide_key?: string | null
    title: string
    overview: string
    description?: string
    media_url?: string | null
    media_type?: 'image' | 'video' | null
    sort_order?: number
  }) => {
    const created = await createTopic(input)
    const section = sections.value.find((s) => s.id === input.section_id)
    if (section) {
      section.topics.push(created)
      section.topics.sort((a, b) => a.sort_order - b.sort_order)
    }
    return created
  }

  const editTopic = async (
    id: string,
    input: {
      section_id?: string
      title?: string
      overview?: string
      description?: string
      media_url?: string | null
      media_type?: 'image' | 'video' | null
      sort_order?: number
    }
  ) => {
    const updated = await updateTopic(id, input)

    const sourceSection = sections.value.find((section) => section.topics.some((topic) => topic.id === id))
    const sourceTopicIndex = sourceSection?.topics.findIndex((topic) => topic.id === id) ?? -1

    if (!sourceSection || sourceTopicIndex === -1) {
      const targetSection = sections.value.find((section) => section.id === updated.section_id)
      if (targetSection) {
        targetSection.topics.push(updated)
        targetSection.topics.sort((a, b) => a.sort_order - b.sort_order)
      }
      return updated
    }

    const merged = { ...sourceSection.topics[sourceTopicIndex], ...updated }
    if (sourceSection.id === updated.section_id) {
      sourceSection.topics[sourceTopicIndex] = merged
      sourceSection.topics.sort((a, b) => a.sort_order - b.sort_order)
      return updated
    }

    sourceSection.topics.splice(sourceTopicIndex, 1)

    const targetSection = sections.value.find((section) => section.id === updated.section_id)
    if (targetSection) {
      targetSection.topics.push(merged)
      targetSection.topics.sort((a, b) => a.sort_order - b.sort_order)
    }

    return updated
  }

  const removeTopic = async (id: string) => {
    await deleteTopic(id)
    for (const section of sections.value) {
      const idx = section.topics.findIndex((t) => t.id === id)
      if (idx !== -1) {
        section.topics.splice(idx, 1)
        break
      }
    }
  }

  const reorderSections = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map((id) => sections.value.find((s) => s.id === id))
      .filter((s): s is GuideSectionWithTopics => s !== null)

    sections.value = reordered

    await Promise.all(
      reordered.map((s, i) => updateSection(s.id, { sort_order: i }))
    )
  }

  const reorderTopics = async (sectionId: string, orderedIds: string[]) => {
    const section = sections.value.find((s) => s.id === sectionId)
    if (!section) return

    const reordered = orderedIds
      .map((id) => section.topics.find((t) => t.id === id))
      .filter((t): t is GuideSectionWithTopics['topics'][number] => t !== null)

    section.topics.splice(0, section.topics.length, ...reordered)

    await Promise.all(
      reordered.map((t, i) => updateTopic(t.id, { sort_order: i }))
    )
  }

  const importTemplate = async (templateSections: ProductGuideSeedSection[]) => {
    if (sections.value.length > 0) {
      throw new Error('The Product Guide already has content. Clear it first before importing the default guide.')
    }

    const createdSectionIds: string[] = []
    const createdSections: GuideSectionWithTopics[] = []

    try {
      for (const sectionInput of templateSections) {
        const createdSection = await createSection({
          guide_key: sectionInput.guide_key,
          title: sectionInput.title,
          icon: sectionInput.icon,
          sort_order: sectionInput.sort_order
        })

        createdSectionIds.push(createdSection.id)

        const createdSectionWithTopics: GuideSectionWithTopics = {
          ...createdSection,
          topics: []
        }

        sections.value.push(createdSectionWithTopics)
        createdSections.push(createdSectionWithTopics)

        for (const topicInput of sectionInput.topics) {
          const createdTopic = await createTopic({
            section_id: createdSection.id,
            guide_key: topicInput.guide_key,
            title: topicInput.title,
            overview: topicInput.overview,
            description: topicInput.description ?? undefined,
            sort_order: topicInput.sort_order
          })

          createdSectionWithTopics.topics.push(createdTopic)
        }

        createdSectionWithTopics.topics.sort((a, b) => a.sort_order - b.sort_order)
      }

      sections.value.sort((a, b) => a.sort_order - b.sort_order)
      return createdSections
    } catch (e) {
      await Promise.allSettled(createdSectionIds.map((id) => deleteSection(id)))
      sections.value = []
      throw e
    }
  }

  return {
    sections: readonly(sections),
    loading: readonly(loading),
    error: readonly(error),
    load,
    addSection,
    editSection,
    removeSection,
    addTopic,
    editTopic,
    removeTopic,
    reorderSections,
    reorderTopics,
    importTemplate,
    uploadMedia: uploadGuideMedia,
    deleteMedia: deleteGuideMedia
  }
}

export const useProductGuide = createSharedComposable(_useProductGuide)
