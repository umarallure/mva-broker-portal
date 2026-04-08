import {
  productGuideSections,
  type GuideSection as StaticGuideSection,
  type GuideSubsection
} from '../data/product-guide'

export type ProductGuideSeedTopic = {
  guide_key: string | null
  title: string
  overview: string
  description: string | null
  sort_order: number
}

export type ProductGuideSeedSection = {
  guide_key: string | null
  title: string
  icon: string
  sort_order: number
  topics: ProductGuideSeedTopic[]
}

const joinBlocks = (blocks: Array<string | null | undefined>) =>
  blocks
    .map((block) => block?.trim())
    .filter((block): block is string => Boolean(block))
    .join('\n\n')

const formatBulletBlock = (title: string, items: string[]) => {
  if (!items.length) return null
  return `${title}\n${items.map((item) => `- ${item}`).join('\n')}`
}

const formatComponentsBlock = (subsection: GuideSubsection) => {
  if (!subsection.components?.length) return null

  return [
    'Components',
    ...subsection.components.map((component) => `- ${component.label}: ${component.description}`)
  ].join('\n')
}

const buildOverviewTopic = (section: StaticGuideSection): ProductGuideSeedTopic => ({
  guide_key: `${section.id}__overview`,
  title: 'Overview',
  overview: section.overview,
  description: formatBulletBlock('Highlights', section.highlights),
  sort_order: 0
})

const buildSubsectionTopic = (subsection: GuideSubsection, sortOrder: number): ProductGuideSeedTopic => ({
  guide_key: subsection.id,
  title: subsection.title,
  overview: subsection.summary,
  description: joinBlocks([
    formatBulletBlock('Key details', subsection.bullets),
    formatComponentsBlock(subsection),
    subsection.note ? `Note\n${subsection.note}` : null
  ]) || null,
  sort_order: sortOrder
})

export const getDefaultProductGuideSeed = (): ProductGuideSeedSection[] =>
  productGuideSections.map((section, sectionIndex) => ({
    guide_key: section.id,
    title: section.title,
    icon: section.icon,
    sort_order: sectionIndex,
    topics: [
      buildOverviewTopic(section),
      ...section.subsections.map((subsection, subsectionIndex) =>
        buildSubsectionTopic(subsection, subsectionIndex + 1)
      )
    ]
  }))
