import { useState } from 'react'
import { isMuted, play, setMuted } from '../audio/sfx'
import './settings.css'

type Level = 'proven' | 'used' | 'learning' | 'none'
const KEY = 'scouter.settings'
const DEFAULT = {
  threshold: 9000,
  south: false,
  skills: {
    React: 'proven', 'Next.js': 'proven', TypeScript: 'proven', 'Node.js': 'proven', NestJS: 'proven', PostgreSQL: 'proven',
    Supabase: 'proven', Redis: 'proven', Docker: 'proven', Playwright: 'proven', Flutter: 'used', Python: 'learning',
    AWS: 'learning', Java: 'learning', 'C# / .NET': 'none', Go: 'none', Kubernetes: 'none', Angular: 'none',
  } as Record<string, Level>,
}
type Settings = typeof DEFAULT

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT, ...JSON.parse(raw), skills: { ...DEFAULT.skills, ...JSON.parse(raw).skills } } : DEFAULT
  } catch {
    return DEFAULT
  }
}

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
  const [s, setS] = useState<Settings>(load)
  const [sound, setSound] = useState(() => !isMuted())
  const update = (next: Settings) => {
    setS(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage blocked */
    }
  }

  return (
    <div className="st">
      <header className="st-head">
        <p className="st-kicker">Settings</p>
        <h1 className="st-title">Tune the scouter</h1>
        <p className="st-lede">Your skill levels set every match score. Be honest here: proven means a public repo shows it.</p>
      </header>

      <section className="st-sec" aria-labelledby="st-skills">
        <h2 id="st-skills">Your skills</h2>
        <ul className="st-skills">
          {Object.entries(s.skills).map(([name, level]) => (
            <li key={name} data-level={level}>
              <span>{name}</span>
              <select aria-label={`${name} level`} value={level} onChange={(e) => update({ ...s, skills: { ...s.skills, [name]: e.target.value as Level } })}>
                <option value="proven">Proven</option>
                <option value="used">Used</option>
                <option value="learning">Learning</option>
                <option value="none">Not yet</option>
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section className="st-sec" aria-labelledby="st-scan">
        <h2 id="st-scan">Scan and alerts</h2>
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
            value={s.threshold}
            onChange={(e) => update({ ...s, threshold: Number(e.target.value) })}
          />
        </div>
        <Switch label="Show Jerusalem and south" hint="Off keeps the radar on the north and center." checked={s.south} onChange={(v) => update({ ...s, south: v })} />
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
    </div>
  )
}
