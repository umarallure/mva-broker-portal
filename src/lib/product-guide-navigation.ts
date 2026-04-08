import { productGuideSections } from '../data/product-guide'

export type ProductGuideTarget = {
  sectionId: string
  subsectionId?: string
}

export const PRODUCT_GUIDE_SECTION_QUERY_KEY = 'guideSection'
export const PRODUCT_GUIDE_TOPIC_QUERY_KEY = 'guideTopic'

type GuideTopicSelectionLike = {
  id: string
  guide_key: string | null
  title: string
  sort_order: number
}

type GuideSectionSelectionLike = {
  id: string
  guide_key: string | null
  title: string
  sort_order: number
  topics: ReadonlyArray<GuideTopicSelectionLike>
}

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')

export const buildProductGuideLocation = (target: ProductGuideTarget) => ({
  path: '/product-guide',
  query: {
    [PRODUCT_GUIDE_SECTION_QUERY_KEY]: target.sectionId,
    ...(target.subsectionId ? { [PRODUCT_GUIDE_TOPIC_QUERY_KEY]: target.subsectionId } : {})
  }
})

export const findProductGuideSelection = (
  sections: ReadonlyArray<GuideSectionSelectionLike>,
  target: ProductGuideTarget
) => {
  const sectionMetaIndex = productGuideSections.findIndex((section) => section.id === target.sectionId)
  if (sectionMetaIndex === -1) {
    return { sectionId: null, topicId: null }
  }

  const sectionMeta = productGuideSections[sectionMetaIndex]
  const section =
    sections.find((entry) => entry.guide_key === target.sectionId) ??
    sections.find((entry) => normalize(entry.title) === normalize(sectionMeta.title)) ??
    sections.find((entry) => entry.sort_order === sectionMetaIndex) ??
    null

  if (!section) {
    return { sectionId: null, topicId: null }
  }

  if (!target.subsectionId) {
    return { sectionId: section.id, topicId: null }
  }

  const subsectionMetaIndex = sectionMeta.subsections.findIndex((subsection) => subsection.id === target.subsectionId)
  if (subsectionMetaIndex === -1) {
    return { sectionId: section.id, topicId: null }
  }

  const subsectionMeta = sectionMeta.subsections[subsectionMetaIndex]
  const topic =
    section.topics.find((entry) => entry.guide_key === target.subsectionId) ??
    section.topics.find((entry) => normalize(entry.title) === normalize(subsectionMeta.title)) ??
    section.topics.find((entry) => entry.sort_order === subsectionMetaIndex + 1) ??
    null

  return {
    sectionId: section.id,
    topicId: topic?.id ?? null
  }
}
