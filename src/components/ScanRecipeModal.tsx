import { useState, useRef, useEffect } from 'react'
import type { RecipePrefill } from './AddRecipeSheet'
import { resizeImage } from '../lib/helpers'
import { scanRecipe, scannedRecipeToPrefill, blobToBase64 } from '../lib/scanRecipe'

interface ScanRecipeModalProps {
  onClose: () => void
  onScanned: (prefill: RecipePrefill) => void
}

interface StagedPhoto {
  id: string
  blob: Blob
  url: string
}

const MAX_PHOTOS = 5

function Spinner() {
  return (
    <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--border-card)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function ScanRecipeModal({ onClose, onScanned }: ScanRecipeModalProps) {
  const [photos, setPhotos] = useState<StagedPhoto[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragIndexRef = useRef<number | null>(null)
  const photosRef = useRef<StagedPhoto[]>([])

  // Track the latest photos so the unmount cleanup can revoke object URLs.
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    }
  }, [])

  const handleFiles = async (files: File[]) => {
    setError(null)
    const remaining = Math.max(0, MAX_PHOTOS - photosRef.current.length)
    for (const file of files.slice(0, remaining)) {
      try {
        const blob = await resizeImage(file, 1200, 0.85)
        const url = URL.createObjectURL(blob)
        setPhotos((prev) => [...prev, { id: crypto.randomUUID(), blob, url }])
      } catch {
        setError("Couldn't process that image. Try a different photo.")
      }
    }
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.id !== id)
    })
  }

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    setPhotos((prev) => {
      if (from >= prev.length || index >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      if (!moved) return prev
      next.splice(index, 0, moved)
      return next
    })
    dragIndexRef.current = index
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
  }

  const handleScan = async () => {
    if (photos.length === 0) return
    setScanning(true)
    setError(null)
    try {
      const images = await Promise.all(
        photos.map(async (p) => ({
          image: await blobToBase64(p.blob),
          media_type: 'image/jpeg',
        })),
      )
      const recipe = await scanRecipe(images)
      onScanned(scannedRecipeToPrefill(recipe))
    } catch {
      setError("Couldn't read the recipe. Try clearer photos or add manually.")
      setScanning(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !scanning) onClose()
      }}
    >
      <div
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[88vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', animation: 'slideUp 200ms ease' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 pt-5 pb-3"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <h3
            className="text-lg"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Scan Recipe
          </h3>
          <button
            onClick={onClose}
            disabled={scanning}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6">
          {scanning ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Spinner />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Reading recipe with AI…
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Add a photo of each page of the recipe, in order — Claude reads
                them all together as one recipe. Drag to reorder.
              </p>

              {/* Staged page thumbnails */}
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(index, e)}
                      onDrop={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                      className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 cursor-move"
                      style={{ border: '1px solid var(--border-card)' }}
                    >
                      <img
                        src={photo.url}
                        alt={`Page ${index + 1}`}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <div
                        className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                      >
                        {index + 1}
                      </div>
                      <button
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] text-white cursor-pointer"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <p className="text-xs mb-3" style={{ color: '#C0473E' }}>
                  {error}
                </p>
              )}

              {/* Add a page */}
              {photos.length < MAX_PHOTOS ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer mb-4 flex items-center justify-center gap-1.5"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 9a2 2 0 0 1 2-2h1.5l1-2h7l1 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"
                    />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  {photos.length === 0 ? 'Add Photo' : 'Add Another Page'}
                </button>
              ) : (
                <p className="text-xs text-center mb-4" style={{ color: 'var(--text-muted)' }}>
                  Maximum of {MAX_PHOTOS} pages added.
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleScan}
                  disabled={photos.length === 0}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Scan Recipe
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) void handleFiles(files)
        }}
        className="hidden"
      />

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
