// Fixture-backed data layer. Same shape the FastAPI backend will serve, so screens never change.
import type { Application, Job, Stage } from '../domain/types'
import fixtureJobs from './fixtures/jobs.json'
import fixtureScan from './fixtures/scan.json'

const KEY = 'scouter.applications'
let jobs: Job[] = fixtureJobs as Job[]
let apps: Application[] = load()
let lastScan: string = fixtureScan.startedAt

function load(): Application[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Application[]) : []
  } catch {
    return []
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(apps))
  } catch {
    /* storage blocked: keep in memory */
  }
}
const now = () => new Date().toISOString()

export async function listJobs(f: { sinceFoundAt?: string; minScore?: number } = {}): Promise<Job[]> {
  return jobs
    .filter((j) => !f.sinceFoundAt || j.foundAt >= f.sinceFoundAt)
    .filter((j) => f.minScore == null || j.score.total >= f.minScore)
    .sort((a, b) => b.score.total - a.score.total)
}

/** When the most recent daily scan started. Jobs found since then are "new overnight". */
export async function getLastScan(): Promise<{ startedAt: string }> {
  return { startedAt: lastScan }
}

export async function getJob(id: string): Promise<Job | undefined> {
  return jobs.find((j) => j.id === id)
}

export async function listApplications(): Promise<Application[]> {
  return [...apps]
}

export async function applyToJob(jobId: string): Promise<Application> {
  const existing = apps.find((a) => a.jobId === jobId)
  if (existing) return existing
  const at = now()
  const a: Application = { id: `app-${jobId}`, jobId, stage: 'applied', history: [{ stage: 'applied', at }], notes: '' }
  apps = [...apps, a]
  save()
  return a
}

export async function moveStage(appId: string, stage: Stage): Promise<Application> {
  const a = apps.find((x) => x.id === appId)
  if (!a) throw new Error(`No application ${appId}`)
  const next: Application = { ...a, stage, history: [...a.history, { stage, at: now() }] }
  apps = apps.map((x) => (x.id === appId ? next : x))
  save()
  return next
}

/** Tests only. */
export function __setFixtureJobs(next: Job[]) {
  jobs = next
}
/** Tests only. */
export function __setLastScan(at: string) {
  lastScan = at
}
/** Tests only. */
export function __reset() {
  jobs = fixtureJobs as Job[]
  lastScan = fixtureScan.startedAt
  apps = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
