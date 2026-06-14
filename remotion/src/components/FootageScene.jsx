import { useState } from 'react'
import { Video, AbsoluteFill, useVideoConfig } from 'remotion'
import FilmLook from './overlays/FilmLook'
import PlaceholderScene from './PlaceholderScene'

// Resolve the video src from a clip object.
// render.js downloads all clips before spawning the CLI and sets
// clip.url = '/clips/{filename}', so Case 1 is the normal CLI render path.
//
// Root-relative strings like '/clips/foo.mp4' are correct here — Remotion's
// bundle server resolves them from remotion/public/. Do NOT use staticFile()
// because it prepends /public/ making the URL double-prefixed and returning 404.
function resolveClipSrc(clip) {
  if (!clip) return null

  // Case 1: clip was downloaded/copied to remotion/public/clips/ by render.js
  if (clip.url && clip.url.startsWith('/clips/')) {
    console.log('[FootageScene] local clip (CLI render):', clip.url)
    return clip.url
  }

  // Case 2: local library clip — file is '/library/clips/pixabay_uuid.mp4',
  // synced to remotion/public/clips/ at download time
  if (clip.file) {
    const filename = clip.file.split('/').pop().split('\\').pop()
    const src = filename ? `/clips/${filename}` : null
    console.log('[FootageScene] library clip:', clip.file, '→', src)
    return src
  }

  // Case 3: external CDN URL — browser preview only, never reaches CLI render
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
