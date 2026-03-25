/**
 * Custom drag ghost that follows the cursor during HTML5 drag-and-drop.
 *
 * Suppresses the browser's default drag image and manually moves a
 * styled clone of the card with the cursor via the dragover event.
 */
let ghost: HTMLElement | null = null
let offsetX = 0
let offsetY = 0

// 1x1 transparent image used to hide the default browser drag ghost
let emptyImg: HTMLImageElement | null = null
function getEmptyImg() {
  if (!emptyImg) {
    emptyImg = new Image()
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  }
  return emptyImg
}

function onDragOver(e: DragEvent) {
  if (!ghost) return
  ghost.style.left = `${e.clientX - offsetX}px`
  ghost.style.top = `${e.clientY - offsetY}px`
}

export function useDragGhost() {
  const startDrag = (e: DragEvent) => {
    const target = e.currentTarget as HTMLElement | null
    if (!target || !e.dataTransfer) return

    const rect = target.getBoundingClientRect()

    // Hide the browser's default drag ghost
    e.dataTransfer.setDragImage(getEmptyImg(), 0, 0)
    e.dataTransfer.effectAllowed = 'move'

    // Clone the card
    const clone = target.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.margin = '0'
    clone.style.zIndex = '99999'
    clone.style.pointerEvents = 'none'
    clone.style.transform = 'rotate(2deg) scale(1.04)'
    clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)'
    clone.style.borderRadius = '10px'
    clone.style.opacity = '0.92'
    clone.style.transition = 'none'
    clone.style.willChange = 'left, top'

    // Center the ghost under the cursor
    offsetX = rect.width / 2
    offsetY = rect.height / 2
    clone.style.left = `${e.clientX - offsetX}px`
    clone.style.top = `${e.clientY - offsetY}px`

    document.body.appendChild(clone)
    ghost = clone

    // Track cursor movement
    document.addEventListener('dragover', onDragOver)
  }

  const endDrag = () => {
    document.removeEventListener('dragover', onDragOver)
    if (ghost) {
      ghost.remove()
      ghost = null
    }
  }

  return { startDrag, endDrag }
}
