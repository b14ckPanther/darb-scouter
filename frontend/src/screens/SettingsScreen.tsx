import { useEffect, useRef, useState } from 'react'
import { isMuted, play, setMuted } from '../audio/sfx'
import { getProfile, getScanSettings, getVocab, saveProfile, saveScanSettings, startScan, type VocabSkill } from '../data/api'
import { AuthError, getToken, setToken } from '../data/http'
import type { Level, Profile } from '../domain/types'
import './settings.css'

type Choice = Level | 'none'

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="st-row">
      <div>
        <p className="st-label">{label}</p>
        <p className="st-hint">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="st-switch" onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

export function SettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [vocab, setVocab] = useState<VocabSkill[]>([])
  const [sound, setSound] = useState(() => !isMuted())
  const [needsToken, setNeedsToken] = useState(false)
  const [token, setTokenDraft] = useState(getToken)
  const [status, setStatus] = useState('')
  const [autoScan, setAutoScan] = useState(false)
  const saving = useRef(Promise.resolve())

  useEffect(() => {
    let alive = true
    Promise.all([getProfile(), getVocab(), getScanSettings()])
      .then(([p, v, scan]) => {
        if (!alive) return
        setProfile(p)
        setVocab(v)
        setAutoScan(scan.autoScan)
      })
      .catch((e: unknown) => {
        if (alive && e instanceof AuthError) setNeedsToken(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // edits apply at once; saves queue so they reach the server in order (each one rescores every job)
  const update = (next: Profile) => {
    setProfile(next)
    setStatus('Saving…')
    saving.current = saving.current
      .then(() => saveProfile(next))
      .then((saved) => {
        setProfile((cur) => (cur ? { ...cur, version: saved.version } : saved))
        setStatus('Saved. Every job was rescored.')
      })
      .catch(() => setStatus('Couldn’t save. Check the server is running, then try again.'))
  }

  const toggleScan = (on: boolean) => {
    setAutoScan(on)
    saveScanSettings({ autoScan: on })
      .then(() =>
        setStatus(on ? 'Daily scan on. If today’s scan hasn’t run, it starts within 10 minutes.' : 'Daily scan off. No scans run and nothing is spent.'),
      )
      .catch(() => {
        setAutoScan(!on)
        setStatus('Couldn’t save. Check the server is running, then try again.')
      })
  }

  const scanNow = () => {
    setStatus('Starting a scan…')
    startScan()
      .then(setStatus)
      .catch(() => setStatus('Couldn’t start a scan. Check the server is running, then try again.'))
  }

  const setLevel = (id: string, choice: Choice) => {
    if (!profile) return
    const skills = { ...profile.skills }
    if (choice === 'none') delete skills[id]
    else skills[id] = choice
    update({ ...profile, skills })
  }

  return (
    <div className="st">
      <header className="st-head">
        <p className="st-kicker">Settings</p>
        <h1 className="st-title">Tune the scouter</h1>
        <p className="st-lede">Your skill levels set every match score. Be honest here: proven means a public repo shows it.</p>
        <p className="st-status" role="status" aria-live="polite">
          {status}
        </p>
      </header>

      {needsToken && (
        <section className="st-sec" aria-labelledby="st-access">
          <h2 id="st-access">Access</h2>
          <form
            className="st-row"
            onSubmit={(e) => {
              e.preventDefault()
              setToken(token.trim())
              window.location.reload()
            }}
          >
            <div>
              <label className="st-label" htmlFor="st-token">
                Access token
              </label>
              <p className="st-hint">The SCOUTER_TOKEN from the server’s .env file. It stays on this device.</p>
            </div>
            <input id="st-token" className="st-num st-token" type="password" autoComplete="off" value={token} onChange={(e) => setTokenDraft(e.target.value)} />
            <button type="submit" className="st-save">
              Save token
            </button>
          </form>
        </section>
      )}

      {profile && (
        <>
          <section className="st-sec" aria-labelledby="st-skills">
            <h2 id="st-skills">Your skills</h2>
            <ul className="st-skills">
              {vocab.map(({ id, label }) => {
                const level: Choice = profile.skills[id] ?? 'none'
                return (
                  <li key={id} data-level={level}>
                    <span>{label}</span>
                    <select aria-label={`${label} level`} value={level} onChange={(e) => setLevel(id, e.target.value as Choice)}>
                      <option value="proven">Proven</option>
                      <option value="used">Used</option>
                      <option value="learning">Learning</option>
                      <option value="none">Not yet</option>
                    </select>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="st-sec" aria-labelledby="st-scan">
            <h2 id="st-scan">Scan and alerts</h2>
            <Switch
              label="Daily scan"
              hint="Reads new jobs every morning at 07:00. Each new post costs one Claude call; off means no scans and no spend."
              checked={autoScan}
              onChange={toggleScan}
            />
            <div className="st-row">
              <div>
                <p className="st-label">Scan once</p>
                <p className="st-hint">Reads everything new right now, even with the daily scan off.</p>
              </div>
              <button type="button" className="st-save" onClick={scanNow}>
                Scan now
              </button>
            </div>
            <div className="st-row">
              <div>
                <label className="st-label" htmlFor="st-threshold">
                  Alert me above
                </label>
                <p className="st-hint">Telegram pings you when a new job reads higher than this.</p>
              </div>
              <input
                id="st-threshold"
                className="st-num"
                type="number"
                min={0}
                max={12000}
                step={250}
                value={profile.alertThreshold}
                onChange={(e) => update({ ...profile, alertThreshold: Number(e.target.value) })}
              />
            </div>
            <Switch
              label="Show Jerusalem and south"
              hint="Off keeps the radar on the north and center."
              checked={profile.showHiddenRegions}
              onChange={(v) => update({ ...profile, showHiddenRegions: v })}
            />
            <Switch
              label="Show senior roles"
              hint="Off hides roles labelled senior, lead or staff. Some labels are wrong, so peek now and then."
              checked={profile.showSenior}
              onChange={(v) => update({ ...profile, showSenior: v })}
            />
            <Switch
              label="Degree completed"
              hint="On once you graduate. “B.Sc. required” then counts as fully met."
              checked={profile.degree === 'completed'}
              onChange={(v) => update({ ...profile, degree: v ? 'completed' : 'in_progress' })}
            />
            <Switch
              label="Sound effects"
              hint="Scouter beeps, radar pings and the over-9,000 crack."
              checked={sound}
              onChange={(v) => {
                setMuted(!v)
                setSound(v)
                if (v) play('beep')
              }}
            />
          </section>
        </>
      )}
    </div>
  )
}
