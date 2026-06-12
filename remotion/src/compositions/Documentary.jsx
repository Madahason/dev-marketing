import { useMemo } from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, useVideoConfig } from 'remotion'
import ImageScene from '../components/ImageScene'
import FootageScene from '../components/FootageScene'
import PlaceholderScene from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

// Frames for the audio fade-out at the end of each scene (no visual transition).
const AUDIO_FADE_FRAMES = 12

const BACKEND_URL = 'http://localhost:3001'

function toAbsoluteUrl(src) {
  if (!src) return null
  if (src.startsWith('http')) return src
  if (src.startsWith('/')) return `${BACKEND_URL}${src}`
  return src // Windows absolute paths pass through unchanged (CLI rendering)
}

const isValidUrl = (src) =>
  !!src && (src.startsWith('http') || src.match(/^[A-Z]:\\/))

// Total composition length = sum of all scene durations (integers, no overlap).
// frameOffset must always equal sum of all previous Math.max(1, Math.round(...)) values.
export function calculateDocumentaryDuration(scenes, fps = 30) {
  if (!scenes?.length) return 30
  return Math.max(
    scenes.reduce((sum, s) => sum + Math.max(1, Math.round((s.duration_seconds ?? 5) * fps)), 0),
    30
  )
}

// Kept for backward compat — Remotion Studio still imports it.
export function computeLayout(scenes, fps = 30) {
  const startFrames = []
  let cursor = 0
  scenes.forEach(scene => {
    startFrames.push(cursor)
    cursor += Math.max(1, Math.round((scene.duration_seconds ?? 5) * fps))
  })
  return { startFrames, totalFrames: cursor }
}

// Dispatches each scene to the correct visual component.
// imagePath: from imagePaths[scene.scene_id] (browser player) OR scene.image_path (render)
function SceneRenderer({ scene, imagePath, selectedClips }) {
  const effectivePath = imagePath || scene.image_path || null
  const selectedClip  = selectedClips?.[scene.scene_id] || null

  if (!scene) return <PlaceholderScene scene={{ scene_id: 'unknown' }} />

  if (scene.shot_type === 'image') {
    if (!effectivePath) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={scene} imagePath={effectivePath} globalSettings={{}} />
  }
  if (scene.shot_type === 'motion_graphic') {
    if (!scene.motion_component) return <PlaceholderScene scene={scene} />
    return <MotionGraphicScene scene={scene} />
  }
  if (scene.shot_type === 'real_footage') {
    if (!selectedClip) return <PlaceholderScene scene={scene} />
    return <FootageScene clip={selectedClip} />
  }
  return <PlaceholderScene scene={scene} />
}

export function Documentary({
  scenes        = [],
  imagePaths    = {},
  selectedClips = {},
  audioSpecs    = [],
}) {
  const { fps } = useVideoConfig()

  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return scenes.filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    })
  }, [scenes])

  const audioSpecMap = useMemo(() => {
    const map = {}
    audioSpecs.forEach(spec => { map[spec.scene_id] = spec })
    return map
  }, [audioSpecs])

  if (!uniqueScenes.length) {
    return (
      <AbsoluteFill style={{
        backgroundColor: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 24, fontFamily: 'sans-serif' }}>
          No scenes loaded
        </div>
      </AbsoluteFill>
    )
  }

  // Build sequences with a running integer frameOffset.
  // Rule: frameOffset must equal the exact sum of all previous durationFrames values.
  // Never use float arithmetic here — Math.round() once, accumulate integers only.
  let frameOffset = 0

  const sequences = uniqueScenes.map((scene) => {
    const durationFrames = Math.max(1, Math.round((scene.duration_seconds ?? 5) * fps))
    const spec           = audioSpecMap[scene.scene_id]
    const narrationUrl   = toAbsoluteUrl(spec?.narration?.url || scene.audio_path || null)

    const from = frameOffset
    frameOffset += durationFrames  // integer accumulation — no float drift

    return (
      <Sequence
        key={`seq_${String(scene.scene_id)}`}
        from={from}
        durationInFrames={durationFrames}
      >
        <AbsoluteFill>
          <ErrorBoundaryScene scene={scene}>
            <SceneRenderer
              scene={scene}
              imagePath={imagePaths[scene.scene_id]}
              selectedClips={selectedClips}
            />
          </ErrorBoundaryScene>

          {isValidUrl(narrationUrl) && (
            <Audio
              key={`audio_${scene.scene_id}`}
              src={narrationUrl}
              endAt={durationFrames}
              pauseWhenBuffering
              volume={(frame) => {
                const fadeStart = Math.max(0, durationFrames - AUDIO_FADE_FRAMES)
                return frame >= fadeStart
                  ? interpolate(frame, [fadeStart, durationFrames], [1.0, 0], {
                      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                    })
                  : 1.0
              }}
            />
          )}
        </AbsoluteFill>
      </Sequence>
    )
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {sequences}
    </AbsoluteFill>
  )
}
