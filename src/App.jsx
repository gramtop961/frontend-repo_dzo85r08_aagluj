import { useState } from 'react'

const API_BASE = import.meta.env.VITE_BACKEND_URL || ''

function App() {
  const [text, setText] = useState('')
  const [platform, setPlatform] = useState('youtube')
  const [language, setLanguage] = useState('hinglish')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analyzeText = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/analyze/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, language, text })
      })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError('Something went wrong while analyzing.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="max-w-3xl mx-auto">
        <header className="py-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800">WatchDog — Indic Abuse Detection Demo</h1>
          <p className="text-slate-600 mt-2">Analyze text or audio content for abusive patterns, with emphasis on Hindi, Hinglish, Punjabi.</p>
        </header>

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <select className="border rounded px-3 py-2" value={platform} onChange={e=>setPlatform(e.target.value)}>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter</option>
              <option value="other">Other</option>
            </select>
            <select className="border rounded px-3 py-2" value={language} onChange={e=>setLanguage(e.target.value)}>
              <option value="hindi">Hindi</option>
              <option value="hinglish">Hinglish</option>
              <option value="punjabi">Punjabi</option>
              <option value="other">Other</option>
            </select>
            <button onClick={analyzeText} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 disabled:opacity-50">Analyze Text</button>
          </div>

          <textarea
            value={text}
            onChange={e=>setText(e.target.value)}
            placeholder="Paste text or a transcript snippet here..."
            className="w-full border rounded px-3 py-2 h-32"
          />

          {error && <div className="text-red-600 text-sm">{error}</div>}

          {loading && <div className="text-slate-600">Analyzing...</div>}

          {result && (
            <div className="mt-4 border rounded p-4 bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">Label</div>
                <div className={`text-sm font-semibold ${result.flagged ? 'text-red-600' : 'text-emerald-600'}`}>
                  {result.label} {result.flagged ? '(18+ warning)' : ''}
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-700">
                <div className="font-medium">Preview</div>
                <div className="mt-1 bg-white border rounded p-2 text-slate-800">{result.preview}</div>
              </div>
              <div className="mt-3 text-sm text-slate-700">
                <div className="font-medium">Scores</div>
                <pre className="mt-1 bg-white border rounded p-2 text-xs overflow-auto">{JSON.stringify(result.scores, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-slate-500 mt-6">This is a demo using simple heuristics. For production, integrate ASR, prosody features, and trained classifiers.</footer>
      </div>
    </div>
  )
}

export default App
