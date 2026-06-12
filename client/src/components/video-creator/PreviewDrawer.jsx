import { useRef, useMemo } from 'react'
import { X } from 'lucide-react'
import { VideoPlayer } from './VideoPlayer'

const FPS = 30

// Mirrors Documentary.jsx's integer-accumulation rule exactly:
// frameOffset = sum of Math.max(1, Math.round(duration * fps)) for all previous scenes.
function getSceneStartFrames(scenes) {
  const frames = []
  let cursor   = 0
  scenes.forEach((scene) => {
    frames.push(cursor)
    cursor += Math.max(1, Math.round((scene.duration_seconds ?? 5) * FPS))
  })
  return frames
}

export function PreviewDrawer({
  isOpen,
  onClose,
  scenes         = [],
  imagePaths     = {},
  selectedClips  = {},
  globalSettings = {},
  sceneStatuses  = {},
  currentStep,
}) {
  const playerRef    = useRef(null)
  const startFrames  = useMemo(() => getSceneStartFrames(scenes), [scenes])
  const totalSeconds = useMemo(() => scenes.reduce((s, sc) => s + (sc.duration_seconds || 5), 0), [scenes])

  const jumpTo = (frame) => {
    if (!playerRef.current) return
    playerRef.current.pause?.()
    playerRef.current.seekTo?.(frame)
  }

  // Step-aware status
  const imageScenes  = scenes.filter(s => s.shot_type === 'image')
  const imagesReady  = imageScenes.filter(s => imagePaths[s.scene_id]).length
  const audioReady   = scenes.filter(s => s.audio_path).length
  const allVisualsOk = scenes.length > 0 && scenes.every(s => {
    if (s.shot_type === 'image')          return !!imagePaths[s.scene_id]
    if (s.shot_type === 'motion_graphic') return !!s.motion_component
    return true // real_footage — always has something (placeholder at minimum)
  })

  return (
    <>
      {/* Backdrop — closes drawer on click */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed', inset: 0, zIndex: 45,
          background: 'rgba(0,0,0,0.40)',
          opacity:     isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
      />

      {/* Drawer */}
      <div style={{
        position:   'fixed', top: 0, right: 0, bottom: 0, zIndex: 46,
        width:       420,
        background: '#0a0a0a',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        boxShadow:   isOpen ? '-20px 0 60px rgba(0,0,0,0.65)' : 'none',
        transform:   isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
        display:    'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
          padding:      '13px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink:    0,
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
            Preview
          </span>
          <button
            onClick={onClose}
            style={{ color: 'rgba(255,255,255,0.28)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.28)'}
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Player ── */}
        <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
          {scenes.length > 0 ? (
            <VideoPlayer
              playerRef={playerRef}
              scenes={scenes}
              imagePaths={imagePaths}
              selectedClips={selectedClips}
              globalSettings={globalSettings}
              style={{ width: '100%', aspectRatio: '16/9', borderRadius: 7, overflow: 'hidden' }}
            />
          ) : (
            <div style={{
              aspectRatio: '16/9', borderRadius: 7,
              background:  'rgba(255,255,255,0.02)',
              border:      '1px solid rgba(255,255,255,0.06)',
              display:     'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)' }}>No scenes yet</span>
            </div>
          )}
        </div>

        {/* ── Info + step notices ── */}
        <div style={{ padding: '10px 16px 6px', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', marginBottom: 5 }}>
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''} · {totalSeconds.toFixed(0)}s
          </div>

          {currentStep === 'visuals' && imageScenes.length > 0 && imagesReady < imageScenes.length && (
            <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.55)' }}>
              {imageScenes.length - imagesReady} scene{imageScenes.length - imagesReady !== 1 ? 's' : ''} still generating
            </div>
          )}
          {currentStep === 'voice' && audioReady > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.55)' }}>
              🔊 {audioReady} / {scenes.length} audio ready
            </div>
          )}
          {currentStep === 'export' && allVisualsOk && (
            <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.55)' }}>
              ✓ Ready to render
            </div>
          )}
        </div>

        {/* ── Jump to scene ── */}
        {scenes.length > 1 && (
          <div style={{ padding: '6px 16px 16px', flexShrink: 0 }}>
            <div style={{
              fontSize: 9, color: 'rgba(255,255,255,0.20)',
              textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 7,
            }}>
              Jump to scene
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {scenes.map((scene, i) => (
                <button
                  key={scene.scene_id}
                  onClick={() => jumpTo(startFrames[i] ?? 0)}
                  title={scene.script_excerpt?.slice(0, 70)}
                  style={{
                    width: 26, height: 26, fontSize: 10, fontFamily: 'monospace',
                    background: 'rgba(255,255,255,0.04)',
                    border:     '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4, color: 'rgba(255,255,255,0.38)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />
      </div>
    </>
  )
}
