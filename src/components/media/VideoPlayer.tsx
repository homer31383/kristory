import { useEffect, useRef, useState } from 'react'

interface VideoPlayerProps {
  src: string
  poster?: string | null
  preload?: 'none' | 'metadata'
}

/**
 * Inline video. Shows the poster with a big play button until the first tap,
 * then hands over to the native controls. The aspect ratio comes from the
 * poster (a frame of the same video) so the box doesn't jump on load.
 */
export default function VideoPlayer({ src, poster, preload = 'metadata' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    if (!poster) return
    const img = new Image()
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight) }
    img.src = poster
  }, [poster])

  const start = () => {
    const video = videoRef.current
    if (!video) return
    // Only one clip at a time across the page.
    document.querySelectorAll('audio, video').forEach((el) => {
      if (el !== video) (el as HTMLMediaElement).pause()
    })
    setStarted(true)
    video.play().catch((err) => console.error('[VideoPlayer] play failed:', err))
  }

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden"
      style={{ backgroundColor: '#000', aspectRatio: aspect ? `${aspect}` : '16 / 9', maxHeight: '70vh' }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        preload={preload}
        playsInline
        controls={started}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (!aspect && v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
        }}
        onPlay={() => setStarted(true)}
        className="w-full h-full block"
        style={{ objectFit: 'contain' }}
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          style={{ background: 'transparent' }}
        >
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: 'white' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
