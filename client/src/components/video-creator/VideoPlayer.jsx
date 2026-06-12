import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

const BACKEND_URL = 'http://localhost:3001'

function toAbsoluteUrl(src) {
  if (!src) return null
  if (src.startsWith('http')) return src
  if (src.startsWith('/')) return `${BACKEND_URL}${src}`
  return src
}

function buildAutoSpecs(scenes) {
  return (scenes || []).map(scene => ({
    scene_id:       scene.scene_id,
    narration:      scene.audio_path ? { url: toAbsoluteUrl(scene.audio_path), volume: 1.0 } : null,
    music:          null,
    ambient:        null,
    sting:          null,
    overlay_sounds: [],
  }))
}

export function VideoPlayer({
  scenes = [],
  imagePaths = {},
  selectedClips = {},
  globalSettings = {},
  audioSpecs,
  style,
  autoPlay = false,
  loop = false,
  initialFrame,
}) {
  const fps = 30

  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return [...(scenes || [])].reverse().filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    }).reverse()
  }, [scenes])

  const effectiveAudioSpecs = useMemo(() => {
    if (audioSpecs?.length > 0) return audioSpecs
    return buildAutoSpecs(uniqueScenes)
  }, [uniqueScenes, audioSpecs])

  const totalFrames = useMemo(() =>
    calculateDocumentaryDuration(uniqueScenes, fps),
  [uniqueScenes])

  const inputProps = useMemo(() => ({
    scenes:        uniqueScenes.map(s => ({ ...s })),
    imagePaths:    imagePaths    || {},
    selectedClips: selectedClips || {},
    audioSpecs:    effectiveAudioSpecs,
  }), [uniqueScenes, imagePaths, selectedClips, effectiveAudioSpecs])

  if (!uniqueScenes.length) return null

  return (
    <Player
      component={Documentary}
      inputProps={inputProps}
      durationInFrames={Math.max(totalFrames, 30)}
      fps={fps}
      compositionWidth={1920}
      compositionHeight={1080}
      style={style || { width: '100%', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden' }}
      controls
      loop={loop}
      clickToPlay={!autoPlay}
      autoPlay={autoPlay}
      doubleClickToFullscreen
      acknowledgeRemotionLicense
      numberOfSharedAudioTags={32}
      {...(initialFrame !== undefined ? { initialFrame } : {})}
    />
  )
}
