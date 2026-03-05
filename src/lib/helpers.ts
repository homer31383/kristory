import { format, parse, isValid } from 'date-fns'
import DOMPurify from 'dompurify'

export function formatDateHeading(dateStr: string): string {
  const date = parse(dateStr, 'yyyy-MM-dd', new Date())
  return format(date, 'EEEE, MMMM d, yyyy')
}

export function formatDateShort(dateStr: string): string {
  const date = parse(dateStr, 'yyyy-MM-dd', new Date())
  return format(date, 'MMM d, EEEE')
}

export function formatMonthYear(dateStr: string): string {
  const date = parse(dateStr, 'yyyy-MM-dd', new Date())
  return format(date, 'MMMM yyyy')
}

export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isValidDate(dateStr: string): boolean {
  const date = parse(dateStr, 'yyyy-MM-dd', new Date())
  return isValid(date)
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i'],
    ALLOWED_ATTR: [],
  })
}

export function truncateText(text: string, maxLength: number): string {
  const stripped = text.replace(/<[^>]*>/g, '')
  if (stripped.length <= maxLength) return stripped
  return stripped.slice(0, maxLength).trim() + '...'
}

export async function resizeImage(file: File, maxWidth = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      console.error(`[resizeImage] Loaded ${img.width}x${img.height}`)
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height))
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      console.error(`[resizeImage] Canvas ${canvas.width}x${canvas.height}, scale=${scale.toFixed(2)}`)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas 2d context'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.error(`[resizeImage] Blob created: ${blob.size} bytes`)
            resolve(blob)
          } else {
            reject(new Error('canvas.toBlob returned null — image may be too large for this device'))
          }
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Failed to load image (type=${file.type}, size=${file.size})`))
    }
    img.src = objectUrl
  })
}

export function getStorageUrl(path: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${supabaseUrl}/storage/v1/object/public/kristory-photos/${path}`
}
