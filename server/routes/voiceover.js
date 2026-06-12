const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const { getVoices, generateAudio, getAudioDuration } = require('../services/elevenlabs')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')

// GET /api/voiceover/status
// Verify API key and return character credits
router.get('/status', async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.json({ connected: false, error: 'ELEVENLABS_API_KEY not set in .env' })
    }
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

    let planInfo = {
      plan:               'unknown',
      charactersUsed:     0,
      charactersLimit:    999999,
      charactersRemaining: 999999,
    }

    try {
      // SDK shape has changed across versions — try every known path
      let subscription = null
      if (typeof client.user?.getSubscription === 'function') {
        subscription = await client.user.getSubscription()
      } else if (typeof client.user?.subscription?.get === 'function') {
        subscription = await client.user.subscription.get()
      }

      if (subscription) {
        const used  = subscription.characterCount  ?? subscription.character_count  ?? 0
        const limit = subscription.characterLimit  ?? subscription.character_limit  ?? 999999
        planInfo = {
          plan:                subscription.tier || subscription.plan || 'active',
          charactersUsed:      used,
          charactersLimit:     limit,
          charactersRemaining: Math.max(0, limit - used),
        }
      }
    } catch (subErr) {
      // Subscription details unavailable — still verify connectivity via voices ping
      console.warn('[voiceover] subscription details unavailable:', subErr.message)
      try { await client.voices.getAll() } catch (voiceErr) {
        throw voiceErr // voices ping also failed — real auth error
      }
    }

    res.json({ connected: true, ...planInfo })
  } catch (err) {
    res.json({ connected: false, error: err.message })
  }
})

// GET /api/voiceover/voices
router.get('/voices', async (req, res) => {
  try {
    const voices = await getVoices()
    res.json(voices)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/voiceover/generate
// Body: { projectId, scenes, voiceId, modelId, mode: 'full'|'scene', sceneId?, voiceSettings? }
// SSE stream of scene_done / scene_error / done events
router.post('/generate', async (req, res) => {
  const { projectId, scenes, voiceId, modelId, mode = 'full', sceneId, voiceSettings } = req.body

  if (!voiceId)    return res.status(400).json({ error: 'voiceId required' })
  if (!projectId)  return res.status(400).json({ error: 'projectId required' })
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes must be a non-empty array' })
  }

  const audioDir = path.join(PROJECTS_DIR, projectId, 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const scenesToProcess = mode === 'scene'
      ? scenes.filter(s => s.scene_id === sceneId)
      : scenes

    const results = []

    for (const scene of scenesToProcess) {
      if (!scene.script_excerpt?.trim()) continue

      send({ type: 'generating', scene_id: scene.scene_id, message: `Generating audio for scene ${scene.scene_id}…` })

      const outputPath = path.join(audioDir, `scene_${scene.scene_id}.mp3`)

      try {
        await generateAudio({
          text:          scene.script_excerpt,
          voiceId,
          modelId:       modelId || 'eleven_multilingual_v2',
          outputPath,
          voiceSettings: voiceSettings || {},
        })

        const audioDuration = await getAudioDuration(outputPath)
        const sceneDuration = audioDuration
          ? parseFloat((audioDuration + 1.2).toFixed(2))
          : (scene.duration_seconds || 5)
        console.log(`[voiceover] scene ${scene.scene_id}: audio=${audioDuration?.toFixed(2)}s, scene=${sceneDuration.toFixed(2)}s`)
        const audio_path = `/projects/${projectId}/audio/scene_${scene.scene_id}.mp3`

        results.push({ scene_id: scene.scene_id, audio_path, audio_duration: audioDuration, scene_duration: sceneDuration, status: 'done' })

        send({ type: 'scene_done', scene_id: scene.scene_id, audio_path, audio_duration: audioDuration, scene_duration: sceneDuration })

      } catch (err) {
        send({ type: 'scene_error', scene_id: scene.scene_id, error: err.message })
        console.error(`[voiceover] scene ${scene.scene_id} failed:`, err.message)
      }
    }

    send({ type: 'done', results })
    res.end()

  } catch (err) {
    send({ type: 'error', message: err.message })
    res.end()
  }
})

// POST /api/voiceover/preview
// Body: { voiceId, text? }
router.post('/preview', async (req, res) => {
  const { voiceId, text = 'In the beginning, there was nothing. Then, everything changed.' } = req.body

  if (!voiceId) return res.status(400).json({ error: 'voiceId required' })

  const outputPath = path.join(PROJECTS_DIR, `voice_preview_${voiceId}.mp3`)

  try {
    if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true })
    await generateAudio({ text, voiceId, outputPath })
    res.json({ preview_url: `/projects/voice_preview_${voiceId}.mp3` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/voiceover/sync-timings
// Re-measures audio durations from disk and returns updated scene objects.
// Called automatically after Generate All completes and by the Sync Timings button.
router.post('/sync-timings', async (req, res) => {
  const { scenes, projectId } = req.body
  if (!Array.isArray(scenes) || !projectId) {
    return res.status(400).json({ error: 'scenes array and projectId required' })
  }

  const updatedScenes = await Promise.all(scenes.map(async (scene) => {
    const audioPath = path.resolve(PROJECTS_DIR, projectId, 'audio', `scene_${scene.scene_id}.mp3`)
    if (!fs.existsSync(audioPath)) return scene
    const duration = await getAudioDuration(audioPath)
    if (!duration) return scene
    const sceneDuration = parseFloat((duration + 1.2).toFixed(2))
    console.log(`[voiceover] sync: scene ${scene.scene_id}: audio=${duration.toFixed(2)}s, scene=${sceneDuration.toFixed(2)}s`)
    return {
      ...scene,
      audio_path:       `/projects/${projectId}/audio/scene_${scene.scene_id}.mp3`,
      audio_duration:   duration,
      duration_seconds: sceneDuration,
    }
  }))

  const synced = updatedScenes.filter(s => s.audio_duration).length
  console.log(`[voiceover] sync-timings — synced ${synced} / ${scenes.length} scenes`)
  res.json({ success: true, updatedScenes })
})

module.exports = router
