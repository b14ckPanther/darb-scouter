// The app's data layer. With VITE_API_URL set (empty string = same origin) it talks to the FastAPI backend.
// Without it, it runs on the labelled demo fixtures, which tests and the README demo use.
import type { Application, Job, Profile, RunSummary, SearchFilters, Stage } from '../domain/types'
import fixtureJobs from './fixtures/jobs.json'
import fixtureProfile from './fixtures/profile.json'
import fixtureRun from './fixtures/run.json'
import fixtureScan from './fixtures/scan.json'
import fixtureVocab from './fixtures/vocab.json'
import { HttpError, request } from './http'

export type VocabSkill = { id: string; label: string }
export type PasteInput = { url: string; text?: string; title?: string; company?: string }
export type PasteResult = { job: Job } | { needsText: true; reason: string }
export type ApplicationPatch = { stage?: Stage; notes?: string; contact?: string; cvVersion?: string }

let apiBase: string | undefined = import.meta.env.VITE_API_URL
const http = () => apiBase !== undefined
/** True when the app talks to the real backend rather than the demo fixtures. */
export const isLive = () => http()
const call = <T>(path: string, init?: RequestInit) => request<T>(apiBase ?? '', path, init)
const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---- demo fixtures (fixture mode only) ----

const APPS_KEY = 'scouter.applications'
const PROFILE_KEY = 'scouter.profile'
let jobs: Job[] = fixtureJobs as Job[]
let apps: Application[] = loadLocal<Application[]>(APPS_KEY) ?? []
let lastScan: string = fixtureScan.startedAt

function loadLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: keep in memory */
  }
}
const now = () => new Date().toISOString()

// ---- jobs ----

export async function listJobs(f: { sinceFoundAt?: string; minScore?: number } = {}): Promise<Job[]> {
  if (http()) return call<Job[]>(`/api/jobs${qs({ sinceFoundAt: f.sinceFoundAt, minScore: f.minScore })}`)
  return jobs
    .filter((j) => !f.sinceFoundAt || j.foundAt >= f.sinceFoundAt)
    .filter((j) => f.minScore == null || j.score.total >= f.minScore)
    .sort((a, b) => b.score.total - a.score.total)
}

export async function getJob(id: string): Promise<Job | undefined> {
  if (!http()) return jobs.find((j) => j.id === id)
  try {
    return await call<Job>(`/api/jobs/${encodeURIComponent(id)}`)
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return undefined
    throw e
  }
}

/** Search on the server (BM25 + multilingual vectors). In fixture mode, a plain text match. */
export async function searchJobs(q: string, f: SearchFilters = {}): Promise<Job[]> {
  if (http()) return call<Job[]>(`/api/jobs/search${qs({ q, ...f })}`)
  const needle = q.trim().toLowerCase()
  return (await listJobs({ minScore: f.minScore })).filter(
    (j) =>
      (!needle || `${j.title} ${j.company} ${j.city}`.toLowerCase().includes(needle)) &&
      (f.maxScore == null || j.score.total <= f.maxScore) &&
      (!f.workMode || j.workMode === f.workMode),
  )
}

/** Scan one pasted link. Blocked pages (LinkedIn, login walls) come back asking for the pasted text. */
export async function pasteLink(input: PasteInput): Promise<PasteResult> {
  if (!http()) {
    if (/linkedin\.com/i.test(input.url) && !input.text)
      return { needsText: true, reason: 'LinkedIn pages are never fetched. Paste the job text instead.' }
    return { needsText: true, reason: 'Scanning links needs the backend running. Paste the job text instead.' }
  }
  try {
    return { job: await call<Job>('/api/jobs/paste', { method: 'POST', body: JSON.stringify(input) }) }
  } catch (e) {
    if (e instanceof HttpError && e.status === 422) {
      const body = e.body as { needsText?: boolean; reason?: string }
      if (body.needsText) return { needsText: true, reason: body.reason ?? 'Paste the job text instead.' }
      throw new Error(body.reason ?? 'This job can’t be shown.')
    }
    throw e
  }
}

// ---- scans ----

/** When the most recent daily scan started. Jobs found since then are "new overnight". */
export async function getLastScan(): Promise<{ startedAt: string }> {
  if (!http()) return { startedAt: lastScan }
  const run = await getLastRun()
  return { startedAt: run?.startedAt ?? new Date(0).toISOString() }
}

export async function getLastRun(): Promise<RunSummary | null> {
  if (!http()) return { ...(fixtureRun as RunSummary), startedAt: lastScan }
  try {
    return await call<RunSummary>('/api/runs/latest')
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  }
}

// ---- applications ----

export async function listApplications(): Promise<Application[]> {
  if (http()) return call<Application[]>('/api/applications')
  return [...apps]
}

export async function applyToJob(jobId: string): Promise<Application> {
  if (http()) return call<Application>('/api/applications', { method: 'POST', body: JSON.stringify({ jobId }) })
  const existing = apps.find((a) => a.jobId === jobId)
  if (existing) return existing
  const at = now()
  const a: Application = { id: `app-${jobId}`, jobId, stage: 'applied', history: [{ stage: 'applied', at }], notes: '' }
  apps = [...apps, a]
  saveLocal(APPS_KEY, apps)
  return a
}

export async function updateApplication(appId: string, patch: ApplicationPatch): Promise<Application> {
  if (http())
    return call<Application>(`/api/applications/${encodeURIComponent(appId)}`, { method: 'PATCH', body: JSON.stringify(patch) })
  const a = apps.find((x) => x.id === appId)
  if (!a) throw new Error(`No application ${appId}`)
  const stage = patch.stage && patch.stage !== a.stage ? patch.stage : undefined
  const next: Application = {
    ...a,
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(stage ? { stage, history: [...a.history, { stage, at: now() }] } : {}),
  }
  apps = apps.map((x) => (x.id === appId ? next : x))
  saveLocal(APPS_KEY, apps)
  return next
}

export async function moveStage(appId: string, stage: Stage): Promise<Application> {
  return updateApplication(appId, { stage })
}

// ---- profile ----

export async function getProfile(): Promise<Profile> {
  if (http()) return call<Profile>('/api/profile')
  return loadLocal<Profile>(PROFILE_KEY) ?? (fixtureProfile as Profile)
}

/** Saving a profile rescores every stored job on the server. */
export async function saveProfile(p: Profile): Promise<Profile> {
  if (http()) return call<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(p) })
  const saved = { ...p, version: p.version + 1 }
  saveLocal(PROFILE_KEY, saved)
  return saved
}

/** Every skill the scouter recognises, with its display name. */
export async function getVocab(): Promise<VocabSkill[]> {
  if (http()) return call<VocabSkill[]>('/api/vocab')
  return fixtureVocab
}

// ---- test helpers ----

/** Tests only. */
export function __setFixtureJobs(next: Job[]) {
  jobs = next
}
/** Tests only. */
export function __setLastScan(at: string) {
  lastScan = at
}
/** Tests only: `undefined` = fixture mode, a string = HTTP mode against that base. */
export function __setApiBase(base: string | undefined) {
  apiBase = base
}
/** Tests only. */
export function __reset() {
  jobs = fixtureJobs as Job[]
  lastScan = fixtureScan.startedAt
  apps = []
  for (const k of [APPS_KEY, PROFILE_KEY])
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
}
