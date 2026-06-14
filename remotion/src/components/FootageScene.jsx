import { useState } from 'react'
import { Video, staticFile, AbsoluteFill, useVideoConfig } from 'remotion'
import FilmLook from './overlays/FilmLook'
import PlaceholderScene from './PlaceholderScene'

// Resolve the video src from a clip object.
// render.js downloads all clips before spawning the CLI and sets
// clip.url = '/clips/{filename}', so Case 1 is the normal CLI render path.
function resolveClipSrc(clip) {
  if (!clip) return null

  // Case 1: clip was downloaded to remotion/public/clips/ by render.js
  // url is a root-relative string like '/clips/clip_001.mp4'
  if (clip.url && clip.url.startsWith('/clips/')) {
    const filename = clip.url.split('/clips/')[1]
    const resolved = staticFile(`clips/${filename}`)
    console.log('[FootageScene] local clip:', clip.url, '→', resolved)
    return resolved
  }

  // Case 2: local library clip referenced by .file path
  // file is '/library/clips/pixabay_uuid.mp4', already synced to remotion/public/clips/
  if (clip.file) {
    const filename = clip.file.split('/').pop().split('\\').pop()
    const resolved = filename ? staticFile(`clips/${filename}`) : null
    console.log('[FootageScene] library clip:', clip.file, '→', resolved)
    return resolved
  }

  // Case 3: external CDN URL — only reached in browser preview, never in CLI render
  // (render.js downloads all proxy/CDN URLs before spawning the CLI)
  if (clip.url && clip.url.startsWith('http')) {
    console.log('[FootageScene] CDN URL (browser preview):', clip.url)
    return clip.url
  }

  return null
}

export default function FootageScene({ clip, scene }) {
  const [error, setError] = useState(false)
  const { durationInFrames } = useVideoConfig()

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
        endAt={durationInFrames}
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
