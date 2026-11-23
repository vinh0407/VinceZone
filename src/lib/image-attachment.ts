import type { ChatImageAttachment } from '@/components/ide/agent-types'

/**
 * Converts a pasted or dropped image File into a compact base64 data URL
 * (automatically scaled to <= 1400px max dimension to stay fast & token-efficient for Vision models).
 */
export async function fileToChatImage(file: File): Promise<ChatImageAttachment | null> {
  if (!file.type.startsWith('image/')) return null
  if (file.size > 12 * 1024 * 1024) return null

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  }).catch(() => '')

  if (!rawDataUrl) return null

  // Scale down very large screenshots gently via canvas
  let finalDataUrl = rawDataUrl
  let finalMime = file.type || 'image/png'
  if (typeof document !== 'undefined' && file.size > 350_000) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('Invalid image'))
        el.src = rawDataUrl
      })
      const maxDim = 1400
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h)
        finalMime = 'image/jpeg'
        finalDataUrl = canvas.toDataURL('image/jpeg', 0.84)
      }
    } catch {
      // Keep original data URL
    }
  }

  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name || `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`,
    mimeType: finalMime,
    dataUrl: finalDataUrl,
  }
}

export async function extractImagesFromFileList(
  files: FileList | File[],
): Promise<ChatImageAttachment[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 4)
  const resolved = await Promise.all(list.map((f) => fileToChatImage(f)))
  return resolved.filter((item): item is ChatImageAttachment => Boolean(item))
}
