import { getMediaUrl, sortMedia } from '../../lib/media'
import type { JournalMedia } from '../../types'
import AudioPlayer from './AudioPlayer'
import VideoPlayer from './VideoPlayer'

interface MediaListProps {
  media: JournalMedia[]
  /** 'metadata' on a single entry, 'none' where many entries are on screen. */
  preload?: 'none' | 'metadata'
  captionColor?: string
}

/** Entry media in sort order: inline video players and audio players with captions. */
export default function MediaList({ media, preload = 'metadata', captionColor = 'var(--text-muted)' }: MediaListProps) {
  const sorted = sortMedia(media)
  if (sorted.length === 0) return null

  return (
    <div className="space-y-3">
      {sorted.map((m) => (
        <figure key={m.id} className="m-0">
          {m.file_type === 'video' ? (
            <VideoPlayer
              src={m.file_url || getMediaUrl(m.file_path)}
              poster={m.thumbnail_path ? getMediaUrl(m.thumbnail_path) : null}
              preload={preload}
            />
          ) : (
            <AudioPlayer
              src={m.file_url || getMediaUrl(m.file_path)}
              durationHint={m.duration_seconds}
              preload={preload}
            />
          )}
          {m.caption && (
            <figcaption className="text-xs mt-1.5 px-1" style={{ color: captionColor }}>
              {m.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}
