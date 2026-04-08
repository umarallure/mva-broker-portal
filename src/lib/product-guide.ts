import { supabase } from './supabase'

const GUIDE_IMAGE_TARGET_HEIGHT = 1080
const GUIDE_IMAGE_RESIZE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type GuideSection = {
  id: string
  guide_key: string | null
  title: string
  icon: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GuideTopic = {
  id: string
  section_id: string
  guide_key: string | null
  title: string
  overview: string
  description: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type GuideSectionWithTopics = GuideSection & { topics: GuideTopic[] }

// ── Sections ──

export async function listSections(): Promise<GuideSectionWithTopics[]> {
  const { data, error } = await supabase
    .from('product_guide_sections')
    .select('*, topics:product_guide_topics(*)')
    .order('sort_order')
    .order('sort_order', { referencedTable: 'product_guide_topics' })

  if (error) throw new Error(error.message)
  return data as GuideSectionWithTopics[]
}

export async function createSection(input: {
  guide_key?: string | null
  title: string
  icon?: string
  sort_order?: number
}) {
  const { data, error } = await supabase
    .from('product_guide_sections')
    .insert({
      guide_key: input.guide_key ?? null,
      title: input.title,
      icon: input.icon || 'i-lucide-book-open',
      sort_order: input.sort_order ?? 0
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as GuideSection
}

export async function updateSection(
  id: string,
  input: { title?: string; icon?: string; sort_order?: number }
) {
  const updates: Record<string, unknown> = {}
  if (input.title !== undefined) updates.title = input.title
  if (input.icon !== undefined) updates.icon = input.icon
  if (input.sort_order !== undefined) updates.sort_order = input.sort_order

  const { data, error } = await supabase
    .from('product_guide_sections')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as GuideSection
}

export async function deleteSection(id: string) {
  const { error } = await supabase
    .from('product_guide_sections')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// ── Topics ──

export async function createTopic(input: {
  section_id: string
  guide_key?: string | null
  title: string
  overview: string
  description?: string
  media_url?: string | null
  media_type?: 'image' | 'video' | null
  sort_order?: number
}) {
  const { data, error } = await supabase
    .from('product_guide_topics')
    .insert({
      section_id: input.section_id,
      guide_key: input.guide_key ?? null,
      title: input.title,
      overview: input.overview,
      description: input.description || null,
      media_url: input.media_url || null,
      media_type: input.media_type || null,
      sort_order: input.sort_order ?? 0
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as GuideTopic
}

export async function updateTopic(
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
) {
  const updates: Record<string, unknown> = {}
  if (input.section_id !== undefined) updates.section_id = input.section_id
  if (input.title !== undefined) updates.title = input.title
  if (input.overview !== undefined) updates.overview = input.overview
  if (input.description !== undefined) updates.description = input.description || null
  if (input.media_url !== undefined) updates.media_url = input.media_url
  if (input.media_type !== undefined) updates.media_type = input.media_type
  if (input.sort_order !== undefined) updates.sort_order = input.sort_order

  const { data, error } = await supabase
    .from('product_guide_topics')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as GuideTopic
}

export async function deleteTopic(id: string) {
  const { error } = await supabase
    .from('product_guide_topics')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// ── Media Upload ──

const loadImageFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The selected image could not be processed.'))
    }

    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })

async function normalizeGuideUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || !GUIDE_IMAGE_RESIZE_TYPES.has(file.type)) {
    return file
  }

  const image = await loadImageFile(file)
  if (image.naturalHeight <= GUIDE_IMAGE_TARGET_HEIGHT) {
    return file
  }

  const scale = GUIDE_IMAGE_TARGET_HEIGHT / image.naturalHeight
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = GUIDE_IMAGE_TARGET_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    return file
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, targetWidth, GUIDE_IMAGE_TARGET_HEIGHT)

  const blob = await canvasToBlob(
    canvas,
    file.type,
    file.type === 'image/jpeg' || file.type === 'image/webp' ? 0.92 : undefined
  )

  if (!blob) {
    return file
  }

  return new File([blob], file.name, {
    type: file.type,
    lastModified: file.lastModified
  })
}

export async function uploadGuideMedia(file: File): Promise<string> {
  const normalizedFile = await normalizeGuideUpload(file)
  const ext = normalizedFile.name.split('.').pop() || 'bin'
  const path = `${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('product-guide-media')
    .upload(path, normalizedFile, { contentType: normalizedFile.type })

  if (error) throw new Error(error.message)

  const { data } = supabase.storage
    .from('product-guide-media')
    .getPublicUrl(path)

  return data.publicUrl
}

export async function deleteGuideMedia(url: string) {
  const path = url.split('/product-guide-media/')[1]
  if (!path) return

  const { error } = await supabase.storage
    .from('product-guide-media')
    .remove([path])

  if (error) throw new Error(error.message)
}
