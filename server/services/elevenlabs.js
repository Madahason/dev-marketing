const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const { exec }      = require('child_process')
const { promisify } = require('util')
const fs   = require('fs')
const path = require('path')
const { preprocessForTTS, validateTTSText, splitIntoChunks } = require('./textPreprocessor')

const execAsync = promisify(exec)

const DOCUMENTARY_VOICE_SETTINGS = {
  stability:       0.71,
  similarityBoost: 0.75,
  style:           0.0,
  useSpeakerBoost: true,
}

const DEFAULT_MODEL = 'eleven_multilingual_v2'

function getClient() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set')
  return new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
}

async function getAudioDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
    )
    const d = parseFloat(stdout.trim())
    return isNaN(d) ? null : Math.round(d * 10) / 10
  } catch {
    return null
  }
}

async function getVoices() {
  const client   = getClient()
  const response = await client.voices.getAll()
  return response.voices.map(v => ({
    voice_id:    v.voiceId,
    name:        v.name,
    category:    v.category,
    description: v.description,
    preview_url: v.previewUrl,
    labels:      v.labels,
  }))
}

async function generateSingleAudio({ text, voiceId, modelId, outputPath, voiceSettings = {}, retries = 3 }) {
  const client = getClient()

  const settings = {
    stability:       voiceSettings.stability       ?? DOCUMENTARY_VOICE_SETTINGS.stability,
    similarityBoost: voiceSettings.similarityBoost ?? DOCUMENTARY_VOICE_SETTINGS.similarityBoost,
    style:           voiceSettings.style           ?? DOCUMENTARY_VOICE_SETTINGS.style,
    useSpeakerBoost: true,
  }

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const audioStream = await client.textToSpeech.convert(voiceId, {
        text,
        modelId: modelId || DEFAULT_MODEL,
        outputFormat: 'mp3_44100_128',
        voiceSettings: settings,
      })

      const chunks = []
      for await (const chunk of audioStream) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      if (buffer.length < 1000) {
        throw new Error(`Audio output too small (${buffer.length} bytes) — likely empty or corrupt`)
      }

      fs.writeFileSync(outputPath, buffer)

      const duration = await getAudioDuration(outputPath)
      if (!duration || duration < 0.1) {
        throw new Error('Generated audio has no duration — corrupt file')
      }

      return outputPath

    } catch (err) {
      console.warn(`[elevenlabs] attempt ${attempt}/${retries} failed:`, err.message)
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }
}

async function generateAndConcatenate({ chunks, voiceId, modelId, outputPath, voiceSettings }) {
  const tempDir = path.dirname(outputPath)
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

  const tempFiles = []

  for (let i = 0; i < chunks.length; i++) {
    const tempPath = path.join(tempDir, `chunk_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`)
    await generateSingleAudio({ text: chunks[i], voiceId, modelId, outputPath: tempPath, voiceSettings })
    tempFiles.push(tempPath)
  }

  // Write concat manifest — ffmpeg requires forward slashes in the file list on all platforms
  const fileList = path.join(tempDir, `concat_${Date.now()}.txt`)
  fs.writeFileSync(fileList, tempFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'))

  await execAsync(`ffmpeg -f concat -safe 0 -i "${fileList}" -c copy "${outputPath}" -y`)

  tempFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
  try { fs.unlinkSync(fileList) } catch {}

  return outputPath
}

async function addSilencePadding(filePath, startMs = 100, endMs = 600) {
  const endSecs  = endMs / 1000
  const tempPath = filePath.replace(/\.mp3$/, `_pad_${Date.now()}.mp3`)

  try {
    await execAsync(
      `ffmpeg -i "${filePath}" -af "adelay=${startMs}|${startMs},apad=pad_dur=${endSecs}" -c:a libmp3lame "${tempPath}" -y`
    )
    fs.renameSync(tempPath, filePath)
    console.log('[elevenlabs] silence padding added:', filePath)
  } catch (err) {
    console.warn('[elevenlabs] silence padding failed (non-fatal):', err.message)
    try { fs.unlinkSync(tempPath) } catch {}
  }
}

async function generateAudio({ text, voiceId, modelId = DEFAULT_MODEL, outputPath, voiceSettings = {} }) {
  const cleanText = preprocessForTTS(text)

  const { valid, issues } = validateTTSText(cleanText)
  if (!valid) throw new Error(`TTS validation failed: ${issues.join(', ')}`)

  const textChunks = splitIntoChunks(cleanText)

  if (textChunks.length === 1) {
    await generateSingleAudio({ text: textChunks[0], voiceId, modelId, outputPath, voiceSettings })
  } else {
    await generateAndConcatenate({ chunks: textChunks, voiceId, modelId, outputPath, voiceSettings })
  }

  await addSilencePadding(outputPath, 350, 600) // 350ms onset buffer, 600ms tail

  const finalDuration = await getAudioDuration(outputPath)
  console.log(`[elevenlabs] audio ready: ${path.basename(outputPath)} — ${finalDuration}s (with silence buffers)`)

  return outputPath
}

module.exports = { getClient, getVoices, generateAudio, getAudioDuration }
