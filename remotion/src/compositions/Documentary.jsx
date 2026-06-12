import { useMemo } from 'react'
import { AbsoluteFill, Audio, interpolate, useVideoConfig } from 'remotion'
import { TransitionSeries, springTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import ImageScene from '../components/ImageScene'
import FootageScene from '../components/FootageScene'
import PlaceholderScene from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

const TRANSITION_FRAMES = 12

export function calculateDocumentaryDuration(scenes, fps = 30) {
  if (!scenes?.length) return 30
  const base = scenes.reduce((sum, s) => sum + Math.max(Math.round((s.duration_seconds || 5) * fps), 30), 0)
  const overlap = Math.max(0, scenes.length - 1) * TRANSITION_FRAMES
  return Math.max(base - overlap, 30)
}

// Kept for backward compat — Remotion Studio still imports it
export function computeLayout(scenes) {
  const startFrames = []
  let cursor = 0
  scenes.forEach(scene => {
    startFrames.push(cursor)
    cursor += Math.round((scene.duration_seconds || 5) * 30)
  })
  return { startFrames, totalFrames: cursor }
}

const BACKEND_URL = 'http://localhost:3001'

function toAbsoluteUrl(src) {
  if (!src) return null
  if (src.startsWith('http')) return src
  if (src.startsWith('/')) return `${BACKEND_URL}${src}`
  return src // Windows absolute paths pass through unchanged (CLI rendering)
}

const isValidUrl = (src) =>
  !!src && (src.startsWith('http') || src.match(/^[A-Z]:\\/))

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
  scenes       = [],
  imagePaths   = {},
  selectedClips = {},
  audioSpecs   = [],
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

  useMemo(() => {
    let offset = 0
    uniqueScenes.forEach((scene, i) => {
      const dur = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
      console.log(`[composition] scene ${i} | id: ${scene.scene_id} | from: ${offset} | dur: ${dur}f | type: ${scene.shot_type} | duration_seconds: ${scene.duration_seconds}`)
      offset += dur
      if (i < uniqueScenes.length - 1) offset -= TRANSITION_FRAMES
    })
  }, [uniqueScenes, fps])

  const seriesChildren = uniqueScenes.flatMap((scene, index) => {
    const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    const spec           = audioSpecMap[scene.scene_id]
    const narrationUrl   = toAbsoluteUrl(spec?.narration?.url || scene.audio_path || null)

    const sequence = (
      <TransitionSeries.Sequence
        key={`seq_${String(scene.scene_id)}`}
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
                const fadeStart = Math.max(0, durationFrames - TRANSITION_FRAMES)
                return frame >= fadeStart
                  ? interpolate(frame, [fadeStart, durationFrames], [1.0, 0], {
                      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
                    })
                  : 1.0
              }}
            />
          )}
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    )

    if (index < uniqueScenes.length - 1) {
      return [
        sequence,
        <TransitionSeries.Transition
          key={`trans_${String(scene.scene_id)}`}
          timing={springTiming({ durationInFrames: TRANSITION_FRAMES, config: { damping: 200 } })}
          presentation={fade()}
        />,
      ]
    }
    return [sequence]
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <TransitionSeries>
        {seriesChildren}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
