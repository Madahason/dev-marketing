import { useState, useEffect, useRef } from 'react'
import { X, Search, Film, Plus, Trash2, AlertCircle, Loader2, Zap, Download, CheckCircle, Play, Upload } from 'lucide-react'
import { ClipPreviewModal } from './ClipPreviewModal'
import { ClipScrubber } from './ClipScrubber'

const SERVER_URL = 'http://localhost:3001'

const TABS = [
  { id: 'library',     label: 'My Library' },
  { id: 'pixabay',     label: 'Pixabay' },
  { id: 'pexels',      label: 'Pexels' },
  { id: 'youtube_cc',  label: 'YouTube CC' },
  { id: 'fair_use',    label: 'Fair Use' },
  { id: 'archive',     label: 'Archive' },
  { id: 'cspan',       label: 'C-SPAN' },
  { id: 'ted',         label: 'TED' },
]

// Map route-slug source identifiers to internal identifiers
const SOURCE_NORM = {
  'youtube-cc':       'youtube_cc',
  'youtube-fair-use': 'youtube_fair_use',
  'archive':          'internet_archive',
  'cspan':            'cspan',
  'ted':              'ted',
}

const SOURCE_PRIORITY = ['internet_archive', 'cspan', 'ted', 'youtube_cc', 'youtube_fair_use']

function SourcePriorityBadge({ source }) {
  const internal = SOURCE_NORM[source] || source
  if (internal === 'internet_archive' || internal === 'cspan') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.10)', color: 'rgba(74,222,128,0.85)', border: '1px solid rgba(34,197,94,0.20)' }}>
        🟢 Public domain
      </span>
    )
  }
  if (internal === 'ted') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,0.12)', color: 'rgba(252,165,165,0.90)', border: '1px solid rgba(239,68,68,0.25)' }}>
        🟢 TED CC
      </span>
    )
  }
  if (internal === 'youtube_cc') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(234,179,8,0.10)', color: 'rgba(253,224,71,0.85)', border: '1px solid rgba(234,179,8,0.22)' }}>
        🟡 Creative Commons
      </span>
    )
  }
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(249,115,22,0.10)', color: 'rgba(253,186,116,0.85)', border: '1px solid rgba(249,115,22,0.22)' }}>
      🟠 Fair use risk
    </span>
  )
}

const MOOD_OPTIONS = ['tense', 'formal', 'intense', 'neutral', 'anticipatory']

function LicenseBadge({ license }) {
  if (license === 'creative_commons' || license === 'public_domain') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.10)', color: 'rgba(74,222,128,0.80)', border: '1px solid rgba(34,197,94,0.20)' }}>
        {license === 'public_domain' ? 'PD' : 'CC'}
      </span>
    )
  }
  if (license === 'royalty_free') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,0.10)', color: 'rgba(165,180,252,0.80)', border: '1px solid rgba(99,102,241,0.22)' }}>
        RF
      </span>
    )
  }
  if (license === 'fair_use') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.10)', color: 'rgba(251,191,36,0.80)', border: '1px solid rgba(251,191,36,0.20)' }}>
        ⚠ FU
      </span>
    )
  }
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.08)' }}>
      ?
    </span>
  )
}

export default function ClipLibrary({ onClose, projectId }) {
  const [visible,    setVisible]    = useState(false)
  const [tab,        setTab]        = useState('library')
  const [previewClip, setPreviewClip] = useState(null)

  // Library tab state
  const [allClips,   setAllClips]   = useState([])
  const [clips,      setClips]      = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [libError,   setLibError]   = useState(null)
  const [query,      setQuery]      = useState('')
  const [catFilter,  setCatFilter]  = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleting,   setDeleting]   = useState(null)
  const [gaps,       setGaps]       = useState({ total: 0, topTags: [] })

  // yt-dlp / ffmpeg dependency status
  const [ytdlpStatus, setYtdlpStatus] = useState(null)
  const [ffmpegOk,    setFfmpegOk]    = useState(true) // assume ok until checked

  // Seeding state
  const [seeding,    setSeeding]    = useState(false)
  const [seedEvents, setSeedEvents] = useState([])
  const seedEsRef                   = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setVisible(false)
    seedEsRef.current?.close()
    setTimeout(onClose, 280)
  }

  const fetchLibrary = (q = query, cat = catFilter) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)   params.set('q', q)
    if (cat) params.set('category', cat)
    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then(data => {
        setClips(data.clips || [])
        if (!q && !cat) setAllClips(data.clips || [])
        setCategories(data.categories || [])
        setLibError(null)
      })
      .catch(e => setLibError(e.message))
      .finally(() => setLoading(false))
  }

  const fetchGaps = () => {
    fetch('/api/library/gaps')
      .then(r => r.json())
      .then(data => setGaps({ total: data.total || 0, topTags: data.topTags || [] }))
      .catch(() => { /* ignore */ })
  }

  const fetchStatus = () => {
    fetch('/api/library/status')
      .then(r => r.json())
      .then(data => setYtdlpStatus(data))
      .catch(() => { /* ignore */ })
  }

  const fetchDeps = () => {
    fetch('/api/deps')
      .then(r => r.json())
      .then(data => setFfmpegOk(data.ffmpeg === true))
      .catch(() => { /* ignore */ })
  }

  useEffect(() => { fetchLibrary(); fetchGaps(); fetchStatus(); fetchDeps() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLibrary(query, catFilter) }, [query, catFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClipUploaded = (clip) => {
    setClips(prev => [...prev, clip])
    setAllClips(prev => [...prev, clip])
    fetchStatus()
  }

  const handleDelete = async (clip_id) => {
    setDeleting(clip_id)
    try {
      await fetch(`/api/library/${clip_id}`, { method: 'DELETE' })
      fetchLibrary()
      fetchGaps()
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  const handleSeed = async () => {
    const meta = (() => {
      try { return JSON.parse(localStorage.getItem('dm_script_metadata') || '{}') } catch { return {} }
    })()
    setSeeding(true)
    setSeedEvents([])
    try {
      const res  = await fetch('/api/library/seed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: meta.title || 'Documentary', niche: meta.niche || 'General', projectId, maxClips: 15 }),
      })
      const { seedId } = await res.json()
      seedEsRef.current?.close()
      const es = new EventSource(`${SERVER_URL}/api/library/seed/progress/${seedId}`)
      seedEsRef.current = es
      es.onmessage = e => {
        const ev = JSON.parse(e.data)
        setSeedEvents(prev => [...prev, ev])
        if (ev.type === 'seed_complete' || ev.type === 'seed_error') {
          setSeeding(false)
          fetchLibrary()
          fetchGaps()
          fetchStatus()
          es.close()
        }
      }
      es.onerror = () => { setSeeding(false); es.close() }
    } catch (err) {
      setSeedEvents([{ type: 'seed_error', error: err.message }])
      setSeeding(false)
    }
  }

  const totalCount = allClips.length || clips.length

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 520, maxWidth: '100vw',
        background: '#111111', borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Film size={15} style={{ color: 'rgba(251,191,36,0.6)' }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.70)' }}>Clip Library</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>· {loading ? '…' : `${totalCount} clips`}</span>
              {ytdlpStatus?.ytdlp?.installed
                ? <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 3, padding: '1px 5px' }}>yt-dlp {ytdlpStatus.ytdlp.version}</span>
                : <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.60)', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 3, padding: '1px 5px' }}>yt-dlp not found</span>
              }
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleSeed}
                disabled={seeding || !ytdlpStatus?.ytdlp?.installed}
                title={!ytdlpStatus?.ytdlp?.installed ? 'yt-dlp must be installed to auto-seed' : 'Auto-seed library from project entities'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, padding: '4px 10px',
                  background: seeding ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.25)', borderRadius: 5,
                  color: seeding || !ytdlpStatus?.ytdlp?.installed ? 'rgba(165,180,252,0.35)' : 'rgba(165,180,252,0.80)',
                  cursor: seeding || !ytdlpStatus?.ytdlp?.installed ? 'not-allowed' : 'pointer',
                }}
              >
                {seeding ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                {seeding ? 'Seeding…' : 'Seed Library'}
              </button>
              <button onClick={handleClose} style={{ color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.30)'}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Source breakdown — only shown once status is loaded and there are clips */}
          {ytdlpStatus && totalCount > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
              {(ytdlpStatus.sources?.manual || 0) > 0 && (
                <span>Manual: {ytdlpStatus.sources.manual}</span>
              )}
              {(ytdlpStatus.sources?.youtube_cc || 0) > 0 && (
                <span style={{ color: 'rgba(74,222,128,0.50)' }}>CC: {ytdlpStatus.sources.youtube_cc}</span>
              )}
              {(ytdlpStatus.sources?.internet_archive || 0) > 0 && (
                <span style={{ color: 'rgba(74,222,128,0.50)' }}>Archive: {ytdlpStatus.sources.internet_archive}</span>
              )}
              {(ytdlpStatus.sources?.cspan || 0) > 0 && (
                <span style={{ color: 'rgba(74,222,128,0.50)' }}>C-SPAN: {ytdlpStatus.sources.cspan}</span>
              )}
              {(ytdlpStatus.sources?.youtube_fair_use || 0) > 0 && (
                <span style={{ color: 'rgba(251,191,36,0.55)' }}>⚠ Fair Use: {ytdlpStatus.sources.youtube_fair_use}</span>
              )}
              {/* Show zero-count categories too so user knows sourcing is possible */}
              {(ytdlpStatus.sources?.youtube_cc || 0) === 0 && ytdlpStatus.ytdlp?.installed && (
                <span style={{ color: 'rgba(255,255,255,0.16)' }}>0 CC · 0 Archive · 0 C-SPAN</span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 10px', fontSize: 12, background: 'none', border: 'none',
              cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? (t.id === 'ted' ? '#ef4444' : '#6366f1') : 'transparent'}`,
              color: tab === t.id ? (t.id === 'ted' ? 'rgba(252,165,165,0.90)' : 'rgba(165,180,252,0.90)') : 'rgba(255,255,255,0.35)',
              marginBottom: -1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {t.id === 'ted' && <span style={{ fontSize: 9, fontWeight: 700, background: '#ef4444', color: 'white', padding: '1px 4px', borderRadius: 2, letterSpacing: '0.05em' }}>TED</span>}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* ffmpeg warning — source tabs only, shown when not installed */}
          {tab !== 'library' && !ffmpegOk && (
            <div style={{
              margin: '12px 20px 0', padding: '8px 12px', flexShrink: 0,
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 6, fontSize: 12,
              color: 'rgba(239,68,68,0.80)', lineHeight: 1.5,
            }}>
              ⚠ ffmpeg not found — clip trimming disabled. Install:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>winget install ffmpeg</code>
            </div>
          )}
          {/* yt-dlp warning — source tabs only, shown when not installed */}
          {tab !== 'library' && ytdlpStatus && !ytdlpStatus.ytdlp?.installed && (
            <div style={{
              margin: '12px 20px 0', padding: '8px 12px', flexShrink: 0,
              background: 'rgba(234,179,8,0.07)',
              border: '1px solid rgba(234,179,8,0.25)',
              borderRadius: 6, fontSize: 12,
              color: 'rgba(234,179,8,0.80)', lineHeight: 1.5,
            }}>
              yt-dlp not installed — clip downloading is disabled.{' '}
              Install with:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>pip install yt-dlp</code>
            </div>
          )}
          {tab === 'library'     && <LibraryTab clips={clips} allClips={allClips} categories={categories} loading={loading} error={libError} query={query} setQuery={setQuery} catFilter={catFilter} setCatFilter={setCatFilter} showAddForm={showAddForm} setShowAddForm={setShowAddForm} deleting={deleting} onDelete={handleDelete} onRefresh={fetchLibrary} onRefreshGaps={fetchGaps} onPreview={setPreviewClip} onClipUploaded={handleClipUploaded} />}
          {tab === 'pixabay'     && <StockTab source="pixabay" label="Pixabay" projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'pexels'      && <StockTab source="pexels"  label="Pexels"  projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'youtube_cc'  && <SourceTab source="youtube-cc"       label="YouTube CC"       hasSegment={true}  warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'fair_use'    && <SourceTab source="youtube-fair-use" label="YouTube Fair Use"  hasSegment={true}  warningText="Copyrighted content — confirm documentary/commentary purpose before distributing." projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'archive'     && <SourceTab source="archive"          label="Internet Archive"  hasSegment={false} warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'cspan'       && <SourceTab source="cspan"            label="C-SPAN"            hasSegment={true}  warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'ted'         && <SourceTab source="ted"              label="TED"               hasSegment={true}  warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} tedNote />}
        </div>

        {/* Seed progress banner */}
        {(seeding || seedEvents.length > 0) && (
          <SeedProgressBanner events={seedEvents} seeding={seeding} onDismiss={() => setSeedEvents([])} />
        )}

        {/* Gap footer */}
        {tab === 'library' && !seeding && seedEvents.length === 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            {gaps.total > 0
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertCircle size={12} style={{ color: 'rgba(251,191,36,0.50)' }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    <span style={{ color: 'rgba(251,191,36,0.70)', fontWeight: 500 }}>{gaps.total} scene{gaps.total !== 1 ? 's' : ''} need clips</span>
                    {gaps.topTags.length > 0 && <span style={{ color: 'rgba(255,255,255,0.22)' }}> · {gaps.topTags.join(', ')}</span>}
                  </span>
                </div>
              : <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Add clips to <code>library/clips/</code> or use Seed Library to auto-download</p>
            }
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {previewClip && (
        <ClipPreviewModal clip={previewClip} onClose={() => setPreviewClip(null)} />
      )}
    </>
  )
}

// ─── LibraryTab ───────────────────────────────────────────────────────────────

const LICENSE_OPTIONS = ['creative_commons', 'public_domain', 'fair_use', 'unknown']

function LibraryTab({ clips, allClips, categories, loading, error, query, setQuery, catFilter, setCatFilter, showAddForm, setShowAddForm, deleting, onDelete, onRefresh, onRefreshGaps, onPreview, onClipUploaded }) {
  const [addForm,    setAddForm]    = useState({ file: '', tagsRaw: '', mood: 'neutral', category: '', duration: '', description: '', source_url: '' })
  const [adding,     setAdding]     = useState(false)
  const [addError,   setAddError]   = useState(null)
  const [fileStatus, setFileStatus] = useState({})

  // Upload form state
  const [showUpload,  setShowUpload]  = useState(false)
  const [uploadForm,  setUploadForm]  = useState({ title: '', tagsRaw: '', mood: 'neutral', category: '', license: 'creative_commons', source_url: '' })
  const [uploadFile,  setUploadFile]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetch('/api/library/verify')
      .then(r => r.json())
      .then(data => setFileStatus(data || {}))
      .catch(() => {})
  }, [clips])

  const handleAdd = async () => {
    const tags = addForm.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    if (!addForm.file || !tags.length || !addForm.mood || !addForm.category) {
      setAddError('File, tags, mood, and category are required.')
      return
    }
    setAdding(true); setAddError(null)
    try {
      const res = await fetch('/api/library/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: addForm.file, tags, mood: addForm.mood, category: addForm.category, duration: parseInt(addForm.duration, 10) || 0, description: addForm.description, source_url: addForm.source_url }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Add failed')
      setAddForm({ file: '', tagsRaw: '', mood: 'neutral', category: '', duration: '', description: '', source_url: '' })
      setShowAddForm(false)
      onRefresh(); onRefreshGaps()
    } catch (err) { setAddError(err.message) }
    finally { setAdding(false) }
  }

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploadFile(f)
    if (!uploadForm.title) {
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
      setUploadForm(prev => ({ ...prev, title: name }))
    }
    setUploadError(null)
  }

  const handleUpload = async () => {
    if (!uploadFile) { setUploadError('Select a file first.'); return }
    if (!uploadForm.title || !uploadForm.mood || !uploadForm.category) {
      setUploadError('Title, mood, and category are required.')
      return
    }
    setUploading(true); setUploadError(null); setUploadProgress(0)

    const fd = new FormData()
    fd.append('clip', uploadFile)
    fd.append('title', uploadForm.title)
    fd.append('tags', uploadForm.tagsRaw)
    fd.append('mood', uploadForm.mood)
    fd.append('category', uploadForm.category)
    fd.append('license', uploadForm.license)
    fd.append('source_url', uploadForm.source_url)

    try {
      const responseData = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/library/upload')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed')) }
            catch { reject(new Error('Upload failed')) }
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(fd)
      })

      const newClip = responseData.clip
      // Immediately mark the new clip's file as verified (we just uploaded it)
      setFileStatus(prev => ({ ...prev, [newClip.clip_id]: true }))
      // Push clip into parent state without waiting for a full refetch
      onClipUploaded(newClip)

      setUploadFile(null)
      setUploadForm({ title: '', tagsRaw: '', mood: 'neutral', category: '', license: 'creative_commons', source_url: '' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowUpload(false)
      onRefreshGaps()
    } catch (err) { setUploadError(err.message) }
    finally { setUploading(false) }
  }

  const inp = { width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6, color: 'rgba(255,255,255,0.88)', fontSize: 12, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, color: 'rgba(255,255,255,0.58)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: (showAddForm || showUpload) ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '6px 10px' }}>
            <Search size={12} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tags, title, category…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'rgba(255,255,255,0.88)' }} />
            {query && <button onClick={() => setQuery('')} style={{ color: 'rgba(255,255,255,0.40)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>}
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'rgba(255,255,255,0.75)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={() => { setShowUpload(u => !u); setShowAddForm(false); setUploadError(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: showUpload ? 'rgba(74,222,128,0.90)' : 'rgba(255,255,255,0.45)', background: showUpload ? 'rgba(34,197,94,0.10)' : 'transparent', border: '1px solid ' + (showUpload ? 'rgba(34,197,94,0.30)' : 'rgba(255,255,255,0.12)'), borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
          >
            <Upload size={11} /> Upload
          </button>
          <button onClick={() => { setShowAddForm(f => !f); setShowUpload(false); setAddError(null) }} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: showAddForm ? 'rgba(99,102,241,0.90)' : 'rgba(255,255,255,0.45)', background: showAddForm ? 'rgba(99,102,241,0.10)' : 'transparent', border: '1px solid ' + (showAddForm ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.12)'), borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
            <Plus size={11} /> Add
          </button>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div style={{ padding: '12px 14px', background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.14)', borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={lbl}>Video file (mp4, mov, webm — max 500 MB)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileSelect}
                  style={{ ...inp, padding: '4px 8px', cursor: 'pointer' }}
                />
                {uploadFile && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 3 }}>{uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>}
              </div>
              <div><label style={lbl}>Title</label><input type="text" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} placeholder="Clip title" style={inp} /></div>
              <div><label style={lbl}>Tags (comma separated)</label><input type="text" value={uploadForm.tagsRaw} onChange={e => setUploadForm(f => ({ ...f, tagsRaw: e.target.value }))} placeholder="finance, wall street, 2008" style={inp} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Mood</label><select value={uploadForm.mood} onChange={e => setUploadForm(f => ({ ...f, mood: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>{MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={lbl}>Category</label><input type="text" value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))} placeholder="finance" style={inp} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>License</label><select value={uploadForm.license} onChange={e => setUploadForm(f => ({ ...f, license: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>{LICENSE_OPTIONS.map(l => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}</select></div>
              </div>
              <div><label style={lbl}>Source URL (optional)</label><input type="text" value={uploadForm.source_url} onChange={e => setUploadForm(f => ({ ...f, source_url: e.target.value }))} placeholder="https://…" style={inp} /></div>
              {uploading && (
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#22c55e', borderRadius: 2, transition: 'width 0.2s' }} />
                </div>
              )}
              {uploadError && <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={11} />{uploadError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleUpload} disabled={uploading} style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 500, background: 'rgba(34,197,94,0.18)', color: 'rgba(74,222,128,0.90)', border: '1px solid rgba(34,197,94,0.30)', borderRadius: 6, cursor: uploading ? 'not-allowed' : 'pointer' }}>
                  {uploading ? `Uploading… ${uploadProgress}%` : 'Upload to Library'}
                </button>
                <button onClick={() => { setShowUpload(false); setUploadError(null) }} style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Manual add form */}
        {showAddForm && (
          <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><label style={lbl}>File path</label><input type="text" value={addForm.file} onChange={e => setAddForm(f => ({ ...f, file: e.target.value }))} placeholder="/library/clips/my_clip.mp4" style={inp} /></div>
              <div><label style={lbl}>Tags (comma separated)</label><input type="text" value={addForm.tagsRaw} onChange={e => setAddForm(f => ({ ...f, tagsRaw: e.target.value }))} placeholder="finance, wall street, 2008" style={inp} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Mood</label><select value={addForm.mood} onChange={e => setAddForm(f => ({ ...f, mood: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>{MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={lbl}>Category</label><input type="text" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} placeholder="finance" style={inp} /></div>
                <div style={{ width: 72 }}><label style={lbl}>Dur (s)</label><input type="number" min={0} value={addForm.duration} onChange={e => setAddForm(f => ({ ...f, duration: e.target.value }))} style={{ ...inp, textAlign: 'center' }} /></div>
              </div>
              <div><label style={lbl}>Description</label><input type="text" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" style={inp} /></div>
              {addError && <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={11} />{addError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAdd} disabled={adding} style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 500, background: 'rgba(99,102,241,0.18)', color: 'rgba(165,180,252,0.90)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 6, cursor: adding ? 'not-allowed' : 'pointer' }}>{adding ? 'Adding…' : 'Add to Library'}</button>
                <button onClick={() => { setShowAddForm(false); setAddError(null) }} style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clip list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {loading && <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '24px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={14} className="animate-spin" /> Loading…</div>}
        {error   && <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', padding: '12px 0' }}>{error}</div>}
        {!loading && !error && clips.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>{query || catFilter ? 'No clips match.' : 'Library is empty.'}</p>
            {(query || catFilter) && <button onClick={() => { setQuery(''); setCatFilter('') }} style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>}
          </div>
        )}
        {!loading && clips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clips.map(clip => (
              <ClipCard key={clip.clip_id} clip={clip} onDelete={() => onDelete(clip.clip_id)} isDeleting={deleting === clip.clip_id} fileExists={fileStatus[clip.clip_id] ?? null} onPreview={() => onPreview(clip)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ClipCard ─────────────────────────────────────────────────────────────────

function ClipCard({ clip, onDelete, isDeleting, fileExists, onPreview }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hoverVideo,    setHoverVideo]    = useState(false)
  const hoverTimerRef = useRef(null)
  const videoRef      = useRef(null)
  const filename      = clip.file?.split('/').pop()
  const videoSrc      = `/library/clips/${filename}`

  const handleMouseEnter = () => {
    if (!fileExists) return
    hoverTimerRef.current = setTimeout(() => setHoverVideo(true), 800)
  }
  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current)
    setHoverVideo(false)
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
  }

  return (
    <div
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px', position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hover video preview tooltip */}
      {hoverVideo && fileExists && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
          width: 240, aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden',
          background: '#000', zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.80)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}>
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setHoverVideo(false)}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(251,191,36,0.50)' }}>{clip.clip_id}</span>
            <LicenseBadge license={clip.license} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{clip.category}</span>
            {fileExists === true && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.08)', color: 'rgba(74,222,128,0.65)', border: '1px solid rgba(34,197,94,0.16)' }}>
                Ready
              </span>
            )}
            {fileExists === false && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                No file
              </span>
            )}
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.20)', marginLeft: 'auto' }}>{clip.duration > 0 ? `${clip.duration}s` : ''}</span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', marginBottom: 5 }}>{clip.title || clip.description || clip.file?.split('/').pop()}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {(clip.tags || []).slice(0, 6).map(tag => (
              <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.05)', color: 'rgba(251,191,36,0.35)', border: '1px solid rgba(251,191,36,0.10)' }}>{tag}</span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* Play button */}
          <button
            onClick={() => onPreview()}
            disabled={!fileExists}
            title={fileExists ? 'Preview clip' : 'No file on disk'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: '50%',
              background: fileExists ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${fileExists ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.08)'}`,
              color: fileExists ? 'rgba(165,180,252,0.80)' : 'rgba(255,255,255,0.18)',
              cursor: fileExists ? 'pointer' : 'not-allowed',
              padding: 0,
            }}
          >
            <Play size={11} style={{ marginLeft: 1 }} />
          </button>

          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)} style={{ color: 'rgba(255,255,255,0.15)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.65)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}><Trash2 size={12} /></button>
            : <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => { onDelete(); setConfirmDelete(false) }} disabled={isDeleting} style={{ fontSize: 10, color: 'rgba(239,68,68,0.80)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 3, padding: '2px 7px', cursor: 'pointer' }}>{isDeleting ? '…' : 'Delete'}</button>
                <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ─── SourceTab ────────────────────────────────────────────────────────────────

const CONTEXT_OPTIONS = [
  { value: '',        label: 'Any' },
  { value: 'person',  label: 'Person' },
  { value: 'company', label: 'Company' },
  { value: 'event',   label: 'Event' },
]

function SourceTab({ source, label, hasSegment, warningText, projectId, onDownloaded, tedNote }) {
  const [query,    setQuery]    = useState('')
  const [context,  setContext]  = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [expanded, setExpanded] = useState(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true); setError(null); setResults([])
    try {
      const body = { query: query.trim(), maxResults: 8 }
      if (context) body.context = context
      const res  = await fetch(`/api/library/search/${source}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      // Results already scored + sorted by server — show in order
      setResults(data.results || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {tedNote && (
        <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 6, fontSize: 11, color: 'rgba(252,165,165,0.80)', lineHeight: 1.5 }}>
          TED talks — high quality real speeches, CC licensed (BY-NC-ND).
        </div>
      )}
      {warningText && (
        <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <AlertCircle size={12} style={{ color: 'rgba(251,191,36,0.60)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: 'rgba(251,191,36,0.70)', lineHeight: 1.5 }}>{warningText}</p>
        </div>
      )}

      {/* Search bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '6px 10px' }}>
          <Search size={12} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder={`Search ${label}…`} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'rgba(255,255,255,0.88)' }} />
        </div>
        <select
          value={context}
          onChange={e => setContext(e.target.value)}
          title="Search context helps build better queries"
          style={{ background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: 'rgba(255,255,255,0.72)', outline: 'none', cursor: 'pointer' }}
        >
          {CONTEXT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={handleSearch} disabled={loading || !query.trim()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: loading ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: 'rgba(165,180,252,0.80)', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Search
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {error && <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6 }}>{error}</div>}

        {!loading && results.length === 0 && !error && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: '24px 0', textAlign: 'center' }}>
            {query ? 'No results found.' : `Search ${label} for clips to download.`}
          </p>
        )}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <SearchResult
                key={r.id || i}
                result={r}
                source={source}
                hasSegment={hasSegment}
                projectId={projectId}
                isExpanded={expanded === (r.id || i)}
                onToggle={() => setExpanded(expanded === (r.id || i) ? null : (r.id || i))}
                onDownloaded={() => { setExpanded(null); onDownloaded() }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SearchResult ─────────────────────────────────────────────────────────────

const MAX_CLIP_SEC = 8 // hard limit enforced server-side + UI

// Sources whose result URLs are playable in a video tag (direct MP4 or CORS-ok)
const SCRUBBER_SOURCES = new Set(['archive', 'cspan'])
// Sources served from YouTube (no embed — show thumbnail + link instead)
const YOUTUBE_SOURCES  = new Set(['youtube-cc', 'youtube-fair-use', 'ted'])

function SearchResult({ result, source, hasSegment, projectId, isExpanded, onToggle, onDownloaded }) {
  const [startSec,    setStartSec]    = useState(25)  // default: skip first 25s
  const [endSec,      setEndSec]      = useState(25 + MAX_CLIP_SEC)
  const [tagsRaw,     setTagsRaw]     = useState('')
  const [mood,        setMood]        = useState('neutral')
  const [category,    setCategory]    = useState('')
  const [downloading, setDownloading] = useState(false)
  const [dlStatus,    setDlStatus]    = useState('')
  const [dlError,     setDlError]     = useState(null)
  const [done,        setDone]        = useState(false)
  const [segment,     setSegment]     = useState(null) // { startTime, endTime } from scrubber

  const internalSource = SOURCE_NORM[source] || source
  const isYouTubeSrc   = YOUTUBE_SOURCES.has(source)
  const hasScrubber    = SCRUBBER_SOURCES.has(source) && !!result.url

  const durationLabel = result.duration > 0 ? `${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, '0')}` : ''
  const clipDur       = endSec - startSec

  const effectiveStart = segment ? segment.startTime : startSec
  const effectiveEnd   = segment ? segment.endTime   : endSec

  const handleEndChange = (val) => {
    const n = parseFloat(val) || 0
    setEndSec(Math.min(n, startSec + MAX_CLIP_SEC))
    setSegment(null)
  }
  const handleStartChange = (val) => {
    const n = parseFloat(val) || 0
    setStartSec(n)
    setEndSec(n + MAX_CLIP_SEC)
    setSegment(null)
  }

  const handleDownload = async () => {
    setDlError(null); setDownloading(true); setDlStatus('Starting…')
    try {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const body = {
        url:      result.url,
        source:   internalSource,
        tags,
        mood,
        category: category || 'general',
        projectId,
        title:    result.title,
        startSec: hasSegment ? Math.round(effectiveStart) : 25,
        endSec:   hasSegment ? Math.min(Math.round(effectiveEnd), Math.round(effectiveStart) + MAX_CLIP_SEC) : 25 + MAX_CLIP_SEC,
      }

      const res = await fetch('/api/library/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error || 'Download failed')
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim()
          if (!line) continue
          let ev
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.type === 'start')                      setDlStatus('Downloading…')
          else if (ev.type === 'generating_description') setDlStatus('Generating description…')
          else if (ev.type === 'saving')                setDlStatus('Saving to library…')
          else if (ev.type === 'done')  { setDone(true); setTimeout(onDownloaded, 1000); return }
          else if (ev.type === 'error') throw new Error(ev.message)
        }
      }
    } catch (err) {
      setDlError(err.message)
    } finally {
      setDownloading(false)
      setDlStatus('')
    }
  }

  const inp = { width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 5, color: 'rgba(255,255,255,0.88)', fontSize: 11, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }} onClick={onToggle}>
        {result.thumbnail && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img src={result.thumbnail} alt="" style={{ width: 72, height: 44, objectFit: 'cover', borderRadius: 4, background: 'rgba(255,255,255,0.04)', display: 'block' }} />
            {isYouTubeSrc && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.30)', borderRadius: 4 }}>
                <Play size={14} style={{ color: 'white', opacity: 0.85 }} />
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
            {result.channel && <span>{result.channel}</span>}
            {durationLabel  && <span>{durationLabel}</span>}
            <SourcePriorityBadge source={source} />
            {result.relevanceScore != null && result.relevanceScore >= 7 && (
              <span style={{ color: 'rgba(74,222,128,0.55)', fontSize: 9 }}>★ {result.relevanceScore}/10</span>
            )}
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>max 8s</span>
          </div>
        </div>
        {done
          ? <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
          : <Download size={13} style={{ color: isExpanded ? 'rgba(165,180,252,0.60)' : 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
        }
      </div>

      {isExpanded && !done && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hasSegment && (
              <>
                {/* Archive/C-SPAN: full scrubber with video player */}
                {hasScrubber && (
                  <ClipScrubber
                    videoUrl={result.url}
                    maxDuration={MAX_CLIP_SEC}
                    onSegmentSelected={s => setSegment(s)}
                  />
                )}

                {/* YouTube/TED: thumbnail + link + manual inputs */}
                {isYouTubeSrc && (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'rgba(99,102,241,0.80)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        onClick={e => e.stopPropagation()}
                      >
                        ↗ Open in YouTube to find exact moment
                      </a>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
                      Tip: skip the first 20-30s to avoid title cards and intros
                    </div>
                  </>
                )}

                {/* Manual time inputs — always shown for non-scrubber sources */}
                {!hasScrubber && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Start (sec)</label>
                      <input type="number" min={0} max={result.duration || 3600} value={startSec} onChange={e => handleStartChange(e.target.value)} style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>End (sec) — max {MAX_CLIP_SEC}s</label>
                      <input type="number" min={0} max={startSec + MAX_CLIP_SEC} value={endSec} onChange={e => handleEndChange(e.target.value)} style={inp} />
                    </div>
                    <div style={{ width: 54, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 10, color: clipDur > 0 && clipDur <= MAX_CLIP_SEC ? 'rgba(74,222,128,0.60)' : 'rgba(251,191,36,0.70)', paddingBottom: 7, textAlign: 'center' }}>
                        {Math.max(0, clipDur).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                )}

                {/* Show effective segment when using scrubber */}
                {hasScrubber && segment && (
                  <div style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)' }}>
                    Selected: {segment.startTime.toFixed(1)}s → {segment.endTime.toFixed(1)}s ({segment.duration?.toFixed(1)}s)
                  </div>
                )}
              </>
            )}

            {!hasSegment && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                First {MAX_CLIP_SEC}s from ~25s will be downloaded and trimmed automatically.
              </p>
            )}

            <div>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Tags (comma separated)</label>
              <input type="text" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="finance, government, 2008" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Mood</label>
                <select value={mood} onChange={e => setMood(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>{MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Category</label>
                <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="general" style={inp} />
              </div>
            </div>
            {downloading && dlStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(165,180,252,0.70)' }}>
                <Loader2 size={11} className="animate-spin" /> {dlStatus}
              </div>
            )}
            {dlError && <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)' }}>{dlError}</p>}
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: 'rgba(165,180,252,0.85)', fontSize: 12, cursor: downloading ? 'not-allowed' : 'pointer' }}
            >
              {downloading ? <><Loader2 size={11} className="animate-spin" /> {dlStatus || 'Downloading…'}</> : <><Download size={11} /> Download 8s clip</>}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(34,197,94,0.10)', background: 'rgba(34,197,94,0.04)', fontSize: 12, color: 'rgba(74,222,128,0.70)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} /> Added to library
        </div>
      )}
    </div>
  )
}

// ─── StockTab ─────────────────────────────────────────────────────────────────

function StockTab({ source, label, projectId, onDownloaded }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [apiError, setApiError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true); setError(null); setResults([]); setApiError(null)
    try {
      const res  = await fetch('/api/stock/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), perPage: 8, sources: [source] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      if (data.errors?.[source]) setApiError(data.errors[source])
      setResults(data.results || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const accent = source === 'pixabay' ? '#22c55e' : '#06b6d4'
  const accentFg = source === 'pixabay' ? 'rgba(74,222,128,0.85)' : 'rgba(103,232,249,0.85)'
  const accentBg = source === 'pixabay' ? 'rgba(34,197,94,0.12)' : 'rgba(6,182,212,0.12)'
  const accentBorder = source === 'pixabay' ? 'rgba(34,197,94,0.28)' : 'rgba(6,182,212,0.28)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ margin: '12px 20px 0', padding: '7px 12px', background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 6, fontSize: 11, color: accentFg, lineHeight: 1.5 }}>
        {source === 'pixabay' ? 'Pixabay License — free for commercial use, no attribution required.' : 'Pexels License — free for commercial use, no attribution required.'}
      </div>

      {/* Search bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '6px 10px' }}>
          <Search size={12} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={`Search ${label} for royalty-free footage…`}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'rgba(255,255,255,0.88)' }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: loading ? accentBg : accentBg, border: `1px solid ${accentBorder}`, borderRadius: 6, color: accentFg, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Search
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {apiError && (
          <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.75)', marginBottom: 10, padding: '7px 10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 6 }}>
            ⚠ {apiError}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6 }}>{error}</div>
        )}
        {!loading && results.length === 0 && !error && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: '24px 0', textAlign: 'center' }}>
            {query ? 'No results found.' : `Search ${label} for royalty-free clips.`}
          </p>
        )}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <StockResult
                key={r.id || i}
                result={r}
                source={source}
                projectId={projectId}
                accent={accent}
                accentFg={accentFg}
                accentBg={accentBg}
                accentBorder={accentBorder}
                isExpanded={expanded === (r.id || i)}
                onToggle={() => setExpanded(expanded === (r.id || i) ? null : (r.id || i))}
                onDownloaded={() => { setExpanded(null); onDownloaded() }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StockResult ──────────────────────────────────────────────────────────────

function StockResult({ result, source, projectId, accent, accentFg, accentBg, accentBorder, isExpanded, onToggle, onDownloaded }) {
  const [tagsRaw,     setTagsRaw]     = useState(() => (result.title || '').split(',').slice(0, 5).map(t => t.trim()).join(', '))
  const [mood,        setMood]        = useState('neutral')
  const [category,    setCategory]    = useState('')
  const [segment,     setSegment]     = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [dlStatus,    setDlStatus]    = useState('')
  const [dlError,     setDlError]     = useState(null)
  const [done,        setDone]        = useState(false)

  const MAX_CLIP_SEC = 8
  const durationLabel = result.duration > 0
    ? `${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, '0')}`
    : ''

  const handleDownload = async () => {
    setDlError(null); setDownloading(true); setDlStatus('Starting…')
    try {
      const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const startSec = segment ? Math.round(segment.startTime) : 0
      const endSec   = segment ? Math.min(Math.round(segment.endTime), startSec + MAX_CLIP_SEC) : MAX_CLIP_SEC
      const body = {
        url:      result.url,
        source,
        tags,
        mood,
        category: category || 'general',
        projectId,
        title:    result.title,
        startSec,
        endSec,
      }
      const res = await fetch('/api/stock/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error || 'Download failed')
      }
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''
      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim()
          if (!line) continue
          let ev
          try { ev = JSON.parse(line) } catch { continue }
          if (ev.type === 'start')   setDlStatus('Downloading…')
          else if (ev.type === 'saving') setDlStatus('Saving to library…')
          else if (ev.type === 'done')  { setDone(true); setTimeout(onDownloaded, 1000); return }
          else if (ev.type === 'error') throw new Error(ev.message)
        }
      }
    } catch (err) {
      setDlError(err.message)
    } finally {
      setDownloading(false)
      setDlStatus('')
    }
  }

  const inp = { width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 5, color: 'rgba(255,255,255,0.88)', fontSize: 11, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }} onClick={onToggle}>
        {result.thumbnail && (
          <img src={result.thumbnail} alt="" style={{ width: 72, height: 44, objectFit: 'cover', borderRadius: 4, background: 'rgba(255,255,255,0.04)', display: 'block', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title || result.id}</p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
            {durationLabel && <span>{durationLabel}</span>}
            {result.width > 0 && <span>{result.width}×{result.height}</span>}
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: accentBg, color: accentFg, border: `1px solid ${accentBorder}` }}>
              {source === 'pixabay' ? 'Pixabay' : 'Pexels'} · RF
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>max 8s</span>
          </div>
        </div>
        {done
          ? <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
          : <Download size={13} style={{ color: isExpanded ? accentFg : 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
        }
      </div>

      {isExpanded && !done && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.url && (
              <ClipScrubber
                videoUrl={result.url}
                maxDuration={MAX_CLIP_SEC}
                onSegmentSelected={s => setSegment(s)}
              />
            )}
            {segment && (
              <div style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)' }}>
                Selected: {segment.startTime.toFixed(1)}s → {segment.endTime.toFixed(1)}s ({segment.duration?.toFixed(1)}s)
              </div>
            )}
            {!segment && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                Scrub the video to pick a segment, or download the first {MAX_CLIP_SEC}s.
              </p>
            )}
            <div>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Tags (comma separated)</label>
              <input type="text" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="business, city, people" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Mood</label>
                <select value={mood} onChange={e => setMood(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Category</label>
                <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="general" style={inp} />
              </div>
            </div>
            {downloading && dlStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: accentFg }}>
                <Loader2 size={11} className="animate-spin" /> {dlStatus}
              </div>
            )}
            {dlError && <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)' }}>{dlError}</p>}
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 6, color: accentFg, fontSize: 12, cursor: downloading ? 'not-allowed' : 'pointer' }}
            >
              {downloading
                ? <><Loader2 size={11} className="animate-spin" /> {dlStatus || 'Downloading…'}</>
                : <><Download size={11} /> Download {MAX_CLIP_SEC}s clip</>
              }
            </button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${accentBorder}`, background: accentBg, fontSize: 12, color: accentFg, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} /> Added to library
        </div>
      )}
    </div>
  )
}

// ─── SeedProgressBanner ───────────────────────────────────────────────────────

function SeedProgressBanner({ events, seeding, onDismiss }) {
  const lastEvent     = events[events.length - 1]
  const downloadingNow = events.filter(e => e.status === 'downloading' && !events.some(e2 => e2.entity === e.entity && (e2.status === 'done' || e2.status === 'error'))).length
  const doneCount     = events.filter(e => e.status === 'done').length
  const errorCount    = events.filter(e => e.status === 'error').length

  return (
    <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.04)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {seeding
            ? <Loader2 size={12} className="animate-spin" style={{ color: 'rgba(165,180,252,0.60)', flexShrink: 0 }} />
            : <CheckCircle size={12} style={{ color: '#4ade80', flexShrink: 0 }} />
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            {seeding && lastEvent?.entity && (
              <p style={{ fontSize: 11, color: 'rgba(165,180,252,0.70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Searching: <strong>{lastEvent.entity}</strong>{downloadingNow > 0 ? ` · downloading…` : ''}
              </p>
            )}
            {!seeding && lastEvent?.type === 'seed_complete' && (
              <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.70)' }}>Seed complete — {lastEvent.clipsAdded} clip{lastEvent.clipsAdded !== 1 ? 's' : ''} added{errorCount > 0 ? ` (${errorCount} skipped)` : ''}</p>
            )}
            {!seeding && lastEvent?.type === 'seed_error' && (
              <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.70)' }}>Seed error: {lastEvent.error}</p>
            )}
            {seeding && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{doneCount} downloaded · {errorCount} skipped</p>
            )}
          </div>
        </div>
        {!seeding && (
          <button onClick={onDismiss} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex' }}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
