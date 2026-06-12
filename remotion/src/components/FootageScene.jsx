import { useState } from 'react'
import { Video, staticFile, AbsoluteFill } from 'remotion'
import FilmLook from './overlays/FilmLook'
import PlaceholderScene from './PlaceholderScene'

// Resolve the video src from a clip object:
//   - Stock clips (Pixabay/Pexels): have .url, no .file — use the CDN URL directly
//   - Local clips (downloaded): have .file — resolve via staticFile()
function resolveClipSrc(clip) {
  if (!clip) return null
  if (clip.url && !clip.file) return clip.url
  if (clip.file) {
    const filename = clip.file.split('/').pop().split('\\').pop()
    return filename ? staticFile(`clips/${filename}`) : null
  }
  return null
}

export default function FootageScene({ clip, scene }) {
  const [error, setError] = useState(false)

  const videoSrc = resolveClipSrc(clip)

  if (error || !videoSrc) {
    return (
      <PlaceholderScene
        label={clip ? 'Clip unavailable' : 'No clip selected'}
        sublabel={videoSrc}
        scene={scene}
      />
    )
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Video
        src={videoSrc}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => {
          console.error('[FootageScene] failed to load:', videoSrc)
          setError(true)
        }}
      />
      <FilmLook grade="neutral" grainIntensity={0.04} vignetteIntensity={0.35} />
    </AbsoluteFill>
  )
}
