import { useState, useEffect } from 'react'
import { Search, Loader2, X, Film } from 'lucide-react'

export function StockFootagePanel({ sceneId, query: initialQuery, onSelect, onClose }) {
  const [query,   setQuery]   = useState(initialQuery || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (query.trim()) doSearch(query.trim())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = async (q) => {
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const res  = await fetch('/api/stock/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q, perPage: 6 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')

      const errs = Object.values(data.errors || {})
      if (errs.length > 0 && (data.results || []).length === 0) {
        if (errs.some(e => e.includes('not set'))) {
          setError('api_keys_missing')
        } else {
          setError(errs[0])
        }
        return
      }

      setResults(data.results || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) doSearch(query.trim())
  }

  const durationLabel = (sec) => {
    if (!sec) return ''
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: 'rgba(0,0,0,0.65)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 71,
        transform: 'translate(-50%, -50%)',
        width: 640, maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh',
        background: '#111', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.70)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Film size={14} style={{ color: 'rgba(251,191,36,0.60)' }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>Find Stock Footage</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>Pixabay · Pexels</span>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'rgba(255,255,255,0.28)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.65)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.28)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex', gap: 8, padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 8, padding: '7px 12px',
          }}>
            <Search size={12} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search royalty-free footage…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 13, color: 'rgba(255,255,255,0.85)',
              }}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px',
              background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: 8, color: 'rgba(251,191,36,0.85)', fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={12} />}
            Search
          </button>
        </form>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* API key error */}
          {error === 'api_keys_missing' && (
            <div style={{
              padding: '16px 18px', background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.20)', borderRadius: 8, fontSize: 13,
              color: 'rgba(251,191,36,0.80)', lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>API keys not configured</div>
              <div style={{ fontSize: 12, color: 'rgba(251,191,36,0.60)' }}>
                Add your keys to <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>.env</code> and restart the server:
              </div>
              <pre style={{ marginTop: 8, fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.40)', lineHeight: 1.8 }}>
                PIXABAY_API_KEY=   # free at pixabay.com/api/docs/{'\n'}
                PEXELS_API_KEY=    # free at pexels.com/api/
              </pre>
            </div>
          )}

          {/* Other error */}
          {error && error !== 'api_keys_missing' && (
            <div style={{
              padding: '10px 14px', background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.18)', borderRadius: 7,
              fontSize: 12, color: 'rgba(239,68,68,0.75)',
            }}>
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 7,
                  aspectRatio: '16/9',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && results.length === 0 && query && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '32px 0' }}>
              No results. Try different keywords.
            </p>
          )}

          {/* Results grid */}
          {!loading && results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {results.map((result, i) => (
                <div
                  key={result.id || i}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 8, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0a0a', flexShrink: 0 }}>
                    {result.thumbnail
                      ? <img src={result.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Film size={20} style={{ color: 'rgba(255,255,255,0.10)' }} />
                        </div>
                    }
                    {result.duration > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 4, right: 5,
                        fontSize: 9, fontFamily: 'monospace',
                        background: 'rgba(0,0,0,0.72)', color: 'rgba(255,255,255,0.80)',
                        padding: '1px 4px', borderRadius: 3,
                      }}>
                        {durationLabel(result.duration)}
                      </span>
                    )}
                    <span style={{
                      position: 'absolute', top: 4, left: 5,
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      background: result.source === 'pixabay' ? 'rgba(34,197,94,0.80)' : 'rgba(6,182,212,0.80)',
                      color: 'white',
                    }}>
                      {result.source === 'pixabay' ? 'Pixabay' : 'Pexels'}
                    </span>
                  </div>

                  {/* Info + button */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <p style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.50)', lineHeight: 1.3,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {result.title || result.id}
                    </p>
                    <button
                      onClick={() => onSelect(result)}
                      style={{
                        marginTop: 'auto',
                        padding: '5px 0', fontSize: 11, fontWeight: 500,
                        background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)',
                        borderRadius: 5, color: 'rgba(251,191,36,0.90)', cursor: 'pointer', width: '100%',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,191,36,0.20)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,191,36,0.12)'}
                    >
                      Use this clip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }`}</style>
      </div>
    </>
  )
}
