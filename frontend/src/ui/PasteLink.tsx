import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { pasteLink } from '../data/api'
import './paste-link.css'

/** Scan one job from any link. LinkedIn and blocked pages switch to a pasted-text form. */
export function PasteLink() {
  const id = useId()
  const nav = useNavigate()
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [needsText, setNeedsText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await pasteLink(needsText ? { url, text, title: title || undefined, company: company || undefined } : { url })
      if ('job' in res) nav(`/job/${encodeURIComponent(res.job.id)}`)
      else setNeedsText(res.reason)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The scan failed. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pl" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="pl-title">
        Scan a link
      </h2>
      <div className="pl-row">
        <input
          className="pl-url"
          type="url"
          inputMode="url"
          aria-label="Job link"
          placeholder="https://careers.example.com/jobs/123"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="pl-go" type="submit" disabled={busy}>
          {busy ? 'Scanning…' : needsText ? 'Scan text' : 'Scan link'}
        </button>
      </div>
      {needsText && (
        <div className="pl-text">
          <p className="pl-why" role="status">
            {needsText}
          </p>
          <div className="pl-row">
            <input aria-label="Job title" placeholder="Job title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input aria-label="Company" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <textarea aria-label="Job text" rows={8} dir="auto" placeholder="Paste the whole job post here" value={text} onChange={(e) => setText(e.target.value)} required />
        </div>
      )}
      {error && (
        <p className="pl-err" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
