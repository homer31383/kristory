import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../lib/media'

interface AudioPlayerProps {
  src: string
  /** Stored duration, shown before the browser has loaded any metadata. */
  durationHint?: number | null
  preload?: 'none' | 'metadata'
  label?: string
}

/**
 * Compact audio player: play/pause, seekable progress bar, time readout.
 * Colors come from the --media-player-* tokens so it themes with the app
 * (and the family feed can pin its own palette by overriding them).
 */
export default function AudioPlayer({ src, durationHint, preload = 'metadata', label }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState<number | null>(durationHint ?? null)
  const [failed, setFailed] = useState(false)
  const seekingRef = useRef(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => { if (!seekingRef.current) setCurrent(audio.currentTime) }
    const onMeta = () => { if (isFinite(audio.duration)) setDuration(audio.duration) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setCurrent(0); audio.currentTime = 0 }
    const onError = () => setFailed(true)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      // Only one clip at a time across the page.
      document.querySelectorAll('audio, video').forEach((el) => {
        if (el !== audio) (el as HTMLMediaElement).pause()
      })
      audio.play().catch((err) => {
        console.error('[AudioPlayer] play failed:', err)
        setFailed(true)
      })
    } else {
      audio.pause()
    }
  }

  const seekToClientX = (clientX: number) => {
    const audio = audioRef.current
    const track = trackRef.current
    if (!audio || !track || !duration) return
    const rect = track.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const time = fraction * duration
    setCurrent(time)
    audio.currentTime = time
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    seekingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (seekingRef.current) seekToClientX(e.clientX)
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    seekingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 5 : -5
      audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + delta))
      setCurrent(audio.currentTime)
    }
  }

  const progress = duration ? Math.min(1, current / duration) : 0

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
      style={{
        backgroundColor: 'var(--media-player-bg)',
        borderColor: 'var(--media-player-border)',
        boxShadow: 'var(--media-player-shadow)',
      }}
    >
      <audio ref={audioRef} src={src} preload={preload} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center cursor-pointer"
        style={{ backgroundColor: 'var(--media-player-ink)', color: 'var(--media-player-bg)' }}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        {label && (
          <div className="text-xs font-medium truncate mb-1" style={{ color: 'var(--media-player-text)' }}>
            {label}
          </div>
        )}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatDuration(current)} of ${formatDuration(duration)}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="relative h-5 flex items-center cursor-pointer touch-none"
        >
          <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--media-player-track)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${progress * 100}%`, backgroundColor: 'var(--media-player-ink)' }}
            />
          </div>
          <div
            className="absolute w-3 h-3 rounded-full -translate-x-1/2"
            style={{ left: `${progress * 100}%`, backgroundColor: 'var(--media-player-ink)' }}
          />
        </div>
      </div>

      <div
        className="text-xs flex-shrink-0 tabular-nums"
        style={{ color: 'var(--media-player-text)' }}
      >
        {failed ? "Can't play" : `${formatDuration(current)} / ${formatDuration(duration)}`}
      </div>
    </div>
  )
}
