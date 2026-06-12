import { useState } from 'react'
import SceneGrid from '../../components/video-creator/SceneGrid'

export function ScenesStep({
  scenes, onScenesChange, sceneStatuses, onRetry,
  motionStatuses, onBuildComponent,
  selectedClips, onSelectClip, onConvertToImage,
  onPreviewScene, voiceoverStatuses, onOpenVoiceover,
  wizard,
}) {
  const [isEnhancing, setIsEnhancing] = useState(false)

  async function handleEnhancePrompts() {
    const imageScenes = scenes.filter(s => s.shot_type === 'image')
    if (!imageScenes.length) return
    setIsEnhancing(true)
    try {
      const res = await fetch('/api/generate/enhance-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { scenes: enhanced } = await res.json()
      onScenesChange(enhanced)
    } catch (err) {
      console.error('[ScenesStep] enhance-prompts failed:', err)
    } finally {
      setIsEnhancing(false)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Scene Breakdown</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Review and edit the {scenes.length} scenes Claude identified. Change shot types and edit prompts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={handleEnhancePrompts}
            disabled={isEnhancing}
            className="vorta-btn vorta-btn-secondary"
            title="Rewrite image prompts to cinematographic standard"
          >
            {isEnhancing ? 'Enhancing…' : '✦ Enhance prompts'}
          </button>
          <button
            onClick={() => { wizard.markComplete('scenes'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Visuals →
          </button>
        </div>
      </div>

      <SceneGrid
        scenes={scenes}
        onScenesChange={onScenesChange}
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
