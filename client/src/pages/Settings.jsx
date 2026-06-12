import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader2, Save, RefreshCw } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const inputCls  = 'vorta-input'
const selectCls = 'vorta-select'
const labelCls  = 'vorta-label'

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-5 pb-2 border-b border-white/[0.06]">
        {title}
      </h2>
      {children}
    </div>
  )
}

export default function Settings() {
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [defaults, setDefaults] = useState({ style: {}, render: {} })
  const [apiStatus, setApiStatus] = useState(null)  // null | 'testing' | 'ok' | 'fail'
  const [apiError,  setApiError]  = useState('')
  const [hfStatus,  setHfStatus]  = useState(null)  // null | 'loading' | { authenticated, message }
  const [elStatus,  setElStatus]  = useState(null)  // null | 'testing' | { connected, plan, charactersRemaining, error }
  // ─── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${SERVER_URL}/api/settings`)
      .then(r => r.json())
      .then(data => { if (data.defaults) setDefaults(data.defaults) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ─── Save defaults ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ defaults }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    finally { setSaving(false) }
  }

  const patchStyle  = (k, v) => setDefaults(d => ({ ...d, style:  { ...d.style,  [k]: v } }))
  const patchRender = (k, v) => setDefaults(d => ({ ...d, render: { ...d.render, [k]: v } }))

  // ─── Test Anthropic key ──────────────────────────────────────────────────────
  const testAnthropicKey = async () => {
    setApiStatus('testing')
    setApiError('')
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings/test-anthropic`, { method: 'POST' })
      const data = await res.json()
      setApiStatus(data.success ? 'ok' : 'fail')
      if (!data.success) setApiError(data.error || 'Test failed')
    } catch (err) {
      setApiStatus('fail')
      setApiError(err.message)
    }
  }

  // ─── Test ElevenLabs key ─────────────────────────────────────────────────────
  const testElevenLabs = async () => {
    setElStatus('testing')
    try {
      const res  = await fetch(`${SERVER_URL}/api/voiceover/status`)
      const data = await res.json()
      setElStatus(data)
    } catch (err) {
      setElStatus({ connected: false, error: err.message })
    }
  }

  // ─── Check Higgsfield status ─────────────────────────────────────────────────
  const checkHiggsfield = async () => {
    setHfStatus('loading')
    try {
      const res  = await fetch(`${SERVER_URL}/api/settings/higgsfield-status`)
      const data = await res.json()
      setHfStatus(data)
    } catch (err) {
      setHfStatus({ authenticated: false, message: err.message })
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-white/30 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading settings…
      </div>
    )
  }

  const s = defaults.style  || {}
  const r = defaults.render || {}

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-white/40 mt-1 text-sm">API keys, style presets, render options.</p>
      </div>

      {/* ── API Keys ─────────────────────────────────────────────────────────── */}
      <Section title="API Keys">
        <div className="space-y-5">

          <div>
            <label className={labelCls}>Anthropic API Key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value="••••••••••••••••••••••"
                readOnly
                className={inputCls}
                placeholder="Set in .env file"
              />
              <button
                onClick={testAnthropicKey}
                disabled={apiStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                {apiStatus === 'testing'
                  ? <Loader2 size={13} className="animate-spin" />
                  : apiStatus === 'ok'   ? <CheckCircle size={13} className="text-green-400" />
                  : apiStatus === 'fail' ? <XCircle     size={13} className="text-red-400" />
                  : null
                }
                Test key
              </button>
            </div>
            {apiStatus === 'ok'   && <p className="text-[11px] text-green-400/70 mt-1.5">API key is valid</p>}
            {apiStatus === 'fail' && <p className="text-[11px] text-red-400/70  mt-1.5">{apiError}</p>}
            <p className="text-[11px] text-white/25 mt-1.5">Set in .env — restart server after changing</p>
          </div>

          <div>
            <label className={labelCls}>Higgsfield Authentication</label>
            <div className="flex gap-3">
              <div className="flex-1 px-3 py-2 bg-white/[0.02] border border-white/[0.07] rounded-lg text-sm">
                {hfStatus === null
                  ? <span className="text-white/25">Not checked</span>
                  : hfStatus === 'loading'
                  ? <span className="flex items-center gap-2 text-white/30"><Loader2 size={12} className="animate-spin" /> Checking…</span>
                  : hfStatus.authenticated
                  ? <span className="flex items-center gap-2 text-green-400/80"><CheckCircle size={13} /> Authenticated</span>
                  : <span className="flex items-center gap-2 text-amber-400/80"><XCircle size={13} /> {hfStatus.message}</span>
                }
              </div>
              <button
                onClick={checkHiggsfield}
                disabled={hfStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                <RefreshCw size={13} /> Check
              </button>
            </div>
            <p className="text-[11px] text-white/25 mt-1.5">Run <code className="bg-white/[0.05] px-1 rounded">higgsfield auth login</code> in terminal if not authenticated</p>
          </div>

          <div>
            <label className={labelCls}>ElevenLabs API Key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value="••••••••••••••••••••••"
                readOnly
                className={inputCls}
                placeholder="Set ELEVENLABS_API_KEY in .env"
              />
              <button
                onClick={testElevenLabs}
                disabled={elStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors shrink-0 disabled:opacity-40"
              >
                {elStatus === 'testing'
                  ? <Loader2 size={13} className="animate-spin" />
                  : elStatus?.connected   ? <CheckCircle size={13} className="text-green-400" />
                  : elStatus && !elStatus.connected ? <XCircle size={13} className="text-red-400" />
                  : null
                }
                Test key
              </button>
            </div>
            {elStatus?.connected && (
              <p className="text-[11px] text-green-400/70 mt-1.5">
                Connected · {elStatus.plan} · {elStatus.charactersRemaining?.toLocaleString()} chars remaining
              </p>
            )}
            {elStatus && !elStatus.connected && (
              <p className="text-[11px] text-red-400/70 mt-1.5">{elStatus.error || 'Connection failed'}</p>
            )}
            <p className="text-[11px] text-white/25 mt-1.5">Set <code className="bg-white/[0.05] px-1 rounded">ELEVENLABS_API_KEY</code> in .env — restart server after changing</p>
          </div>

        </div>
      </Section>

      {/* ── Default Style Presets ─────────────────────────────────────────────── */}
      <Section title="Default Style Presets">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Default color grade</label>
            <select value={s.grade || 'cool_blue'} onChange={e => patchStyle('grade', e.target.value)} className={selectCls}>
              <option value="cool_blue">Cool Blue (default)</option>
              <option value="warm_amber">Warm Amber</option>
              <option value="desaturated">Desaturated</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default motion type</label>
            <select value={s.motionType || 'push_in'} onChange={e => patchStyle('motionType', e.target.value)} className={selectCls}>
              <option value="push_in">Push In</option>
              <option value="pull_out">Pull Out</option>
              <option value="drift_left">Drift Left</option>
              <option value="drift_right">Drift Right</option>
              <option value="drift_up">Drift Up</option>
              <option value="static">Static</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default transition</label>
            <select value={s.transition || 'dissolve'} onChange={e => patchStyle('transition', e.target.value)} className={selectCls}>
              <option value="dissolve">Dissolve</option>
              <option value="cut">Cut</option>
              <option value="dip_black">Dip Black</option>
              <option value="dip_white">Dip White</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Default scene duration (seconds)</label>
            <input type="number" min={2} max={15} value={s.durationSeconds || 5}
              onChange={e => patchStyle('durationSeconds', parseInt(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Default grain intensity — {(s.grainIntensity ?? 0.06).toFixed(2)}</label>
            <input type="range" min={0} max={0.3} step={0.01} value={s.grainIntensity ?? 0.06}
              onChange={e => patchStyle('grainIntensity', parseFloat(e.target.value))}
              className="vorta-slider mt-1" />
          </div>
          <div>
            <label className={labelCls}>Default vignette intensity — {(s.vignetteIntensity ?? 0.45).toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.05} value={s.vignetteIntensity ?? 0.45}
              onChange={e => patchStyle('vignetteIntensity', parseFloat(e.target.value))}
              className="vorta-slider mt-1" />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save presets'}
        </button>
      </Section>

      {/* ── Render Settings ───────────────────────────────────────────────────── */}
      <Section title="Render Settings">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Output resolution</label>
            <select value={r.resolution || '1080p'} onChange={e => patchRender('resolution', e.target.value)} className={selectCls}>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="4k">4K (3840×2160)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Frame rate</label>
            <select value={r.fps || 30} onChange={e => patchRender('fps', parseInt(e.target.value))} className={selectCls}>
              <option value={24}>24 fps (cinematic)</option>
              <option value={30}>30 fps (default)</option>
              <option value={60}>60 fps (smooth)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Remotion concurrency</label>
            <input type="number" min={1} max={16} value={r.concurrency || 1}
              onChange={e => patchRender('concurrency', parseInt(e.target.value))} className={inputCls} />
            <p className="text-[11px] text-white/20 mt-1">Higher = faster render, more CPU</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save settings'}
        </button>
      </Section>
    </div>
  )
}
