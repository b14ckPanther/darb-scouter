import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { listApplications, listJobs } from '../data/api'
import { formatPower, isOver9000, matchTier } from '../domain/power'
import type { Application, Job } from '../domain/types'
import { STAGE_LABEL } from '../ui/StageChip'
import './log.css'

const MODES = ['all', 'onsite', 'hybrid', 'remote'] as const

export function LogScreen() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [apps, setApps] = useState<Map<string, Application>>(new Map())
  const [q, setQ] = useState('')
  const [min, setMin] = useState(0)
  const [mode, setMode] = useState<(typeof MODES)[number]>('all')
  const nav = useNavigate()

  useEffect(() => {
    void Promise.all([listJobs(), listApplications()]).then(([j, a]) => {
      setJobs(j)
      setApps(new Map(a.map((x) => [x.jobId, x])))
    })
  }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (jobs ?? [])
      .filter((j) => !needle || `${j.title} ${j.company} ${j.city}`.toLowerCase().includes(needle))
      .filter((j) => j.score.total >= min)
      .filter((j) => mode === 'all' || j.workMode === mode)
      .sort((a, b) => b.score.total - a.score.total)
  }, [jobs, q, min, mode])

  return (
    <div className="lg">
      <header className="lg-head">
        <p className="lg-kicker">Scouter log</p>
        <h1 className="lg-title">Every job the radar has read</h1>
        <div className="lg-filters" role="search">
          <label className="lg-search">
            <span className="sr-only">Search jobs</span>
            <input type="search" aria-label="Search jobs" placeholder="Title, company or city" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="lg-select">
            <span>Match</span>
            <select aria-label="Match" value={min} onChange={(e) => setMin(Number(e.target.value))}>
              <option value={0}>Any</option>
              <option value={7000}>Strong (7,000+)</option>
              <option value={9000}>Top (over 9,000)</option>
            </select>
          </label>
          <label className="lg-select">
            <span>Work mode</span>
            <select aria-label="Work mode" value={mode} onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m === 'all' ? 'Any' : m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <span className="lg-count" aria-live="polite">
            {jobs ? `${shown.length} of ${jobs.length}` : ''}
          </span>
        </div>
      </header>

      {jobs && shown.length === 0 ? (
        <p className="lg-none">No jobs match. Clear the search or lower the power filter.</p>
      ) : (
        <div className="lg-table-wrap">
          <table className="lg-table">
            <thead>
              <tr>
                <th scope="col">Match /10,000</th>
                <th scope="col">Role</th>
                <th scope="col">Where</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => {
                const a = apps.get(j.id)
                const open = () => nav(`/job/${encodeURIComponent(j.id)}`)
                return (
                  <tr key={j.id} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <td className={`lg-pl${isOver9000(j.score.total) ? ' is-over' : ''}`}>
                      {formatPower(j.score.total)}
                      <small>{matchTier(j.score.total)}</small>
                    </td>
                    <td>
                      <span className="lg-role" dir="auto">
                        {j.title}
                      </span>
                      <span className="lg-co">{j.company}</span>
                    </td>
                    <td className="lg-where">
                      {j.city}
                      <span>{j.workMode}</span>
                    </td>
                    <td className="lg-status">{a ? STAGE_LABEL[a.stage] : <span className="lg-new">Not applied</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
