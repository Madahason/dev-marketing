import VoiceoverPanel from '../../components/video-creator/VoiceoverPanel'

export function VoiceStep({
  scenes, projectId,
  onAudioGenerated, voiceoverStatuses, onVoiceoverStatusChange, onScenesChange,
  wizard,
}) {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Voice Generation</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Generate narration for all {scenes.length} scenes using ElevenLabs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('voice'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Export →
          </button>
        </div>
      </div>

      {/* Always open in wizard context */}
      <VoiceoverPanel
        scenes={scenes}
        projectId={projectId}
        isOpen={true}
        onClose={() => {}}
        onAudioGenerated={onAudioGenerated}
        onVoiceoverStatusChange={onVoiceoverStatusChange}
        onScenesChange={onScenesChange}
      />
    </div>
  )
}
