import { Loader2, Zap } from 'lucide-react'
import SceneGrid from '../../components/video-creator/SceneGrid'

export function VisualsStep({
  scenes, sceneStatuses, isGenerating, generateDone, generateProgress, generateError,
  onGenerateAll, onRetry, motionStatuses, onBuildComponent,
  selectedClips, onSelectClip, onConvertToImage,
  onPreviewScene, voiceoverStatuses, onOpenVoiceover,
  projectId,
  wizard,
}) {
  const imageCount   = scenes.filter(s => s.shot_type === 'image').length
  const motionCount  = scenes.filter(s => s.shot_type === 'motion_graphic').length
  const footageCount = scenes.filter(s => s.shot_type === 'real_footage').length
  const doneCount    = Object.values(sceneStatuses).filter(s => s.status === 'done').length
  const allDone      = imageCount > 0 && doneCount >= imageCount

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Visual Generation</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            {imageCount} image{imageCount !== 1 ? 's' : ''} · {motionCount} motion graphic{motionCount !== 1 ? 's' : ''} · {footageCount} footage
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('visuals'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Voice →
          </button>
        </div>
      </div>

      {/* Generate button + progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onGenerateAll}
            disabled={isGenerating || scenes.length === 0}
            className="vorta-btn vorta-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isGenerating
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Zap size={14} />
            }
            {isGenerating
              ? `Generating… (${generateProgress.done} / ${generateProgress.total})`
              : generateDone ? 'Regenerate All' : `Generate All Assets (${scenes.length})`}
          </button>
          {allDone && !isGenerating && (
            <span style={{ color: 'rgba(34,197,94,0.8)', fontSize: 13 }}>✓ All visuals ready</span>
          )}
          {!allDone && !isGenerating && imageCount > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
              {doneCount} / {imageCount} images generated
            </span>
          )}
        </div>

        {generateError && (
          <div style={{
            marginTop: 12, padding: '10px 16px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, color: '#f87171', fontSize: 13,
          }}>
            {generateError}
          </div>
        )}
      </div>

      <SceneGrid
        scenes={scenes}
        sceneStatuses={sceneStatuses}
        onRetry={onRetry}
        motionStatuses={motionStatuses}
        onBuildComponent={onBuildComponent}
        selectedClips={selectedClips}
        onSelectClip={onSelectClip}
        onConvertToImage={onConvertToImage}
        onPreviewScene={onPreviewScene}
        voiceoverStatuses={voiceoverStatuses}
        onOpenVoiceover={onOpenVoiceover}
      />
    </div>
  )
}
