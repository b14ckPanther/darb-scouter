// Every sound is synthesized here. No samples, no clips from the show.

export type SfxName = 'beep' | 'tick' | 'ping' | 'lockOn' | 'crack' | 'kiCharge' | 'kiBlast' | 'chime' | 'fanfare'

const KEY = 'scouter.muted'

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

let muted = readMuted()
let ctx: AudioContext | null = null
let unavailable = false

export function isMuted(): boolean {
  return muted
}

export function setMuted(m: boolean): void {
  muted = m
  try {
    localStorage.setItem(KEY, String(m))
  } catch {
    /* storage blocked: keep the in-memory value */
  }
}

function audio(): AudioContext | null {
  if (ctx || unavailable) return ctx
  try {
    ctx = new AudioContext()
  } catch {
    unavailable = true
  }
  return ctx
}

type Env = { at?: number; attack?: number; hold?: number; release: number; peak?: number }

function envelope(a: AudioContext, env: Env): GainNode {
  const g = a.createGain()
  const t = a.currentTime + (env.at ?? 0)
  const peak = env.peak ?? 0.25
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + (env.attack ?? 0.005))
  g.gain.setValueAtTime(peak, t + (env.attack ?? 0.005) + (env.hold ?? 0))
  g.gain.exponentialRampToValueAtTime(0.0001, t + (env.attack ?? 0.005) + (env.hold ?? 0) + env.release)
  g.connect(a.destination)
  return g
}

function tone(a: AudioContext, type: OscillatorType, from: number, to: number, env: Env) {
  const o = a.createOscillator()
  const t = a.currentTime + (env.at ?? 0)
  const dur = (env.attack ?? 0.005) + (env.hold ?? 0) + env.release
  o.type = type
  o.frequency.setValueAtTime(from, t)
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  o.connect(envelope(a, env))
  o.start(t)
  o.stop(t + dur + 0.05)
}

function noise(a: AudioContext, filter: BiquadFilterType, fFrom: number, fTo: number, env: Env) {
  const dur = (env.attack ?? 0.005) + (env.hold ?? 0) + env.release
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * (dur + 0.05)), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  const t = a.currentTime + (env.at ?? 0)
  f.type = filter
  f.frequency.setValueAtTime(fFrom, t)
  f.frequency.exponentialRampToValueAtTime(fTo, t + dur)
  src.connect(f)
  f.connect(envelope(a, env))
  src.start(t)
}

const sounds: Record<SfxName, (a: AudioContext) => void> = {
  beep: (a) => tone(a, 'square', 1800, 1800, { hold: 0.05, release: 0.02, peak: 0.08 }),
  tick: (a) => tone(a, 'square', 2600, 2400, { release: 0.02, peak: 0.04 }),
  ping: (a) => tone(a, 'sine', 880, 1320, { attack: 0.01, release: 0.9, peak: 0.2 }),
  lockOn: (a) => {
    tone(a, 'square', 900, 1500, { release: 0.07, peak: 0.07 })
    tone(a, 'square', 1200, 2100, { at: 0.09, release: 0.09, peak: 0.07 })
  },
  crack: (a) => {
    noise(a, 'highpass', 6000, 1500, { release: 0.35, peak: 0.35 })
    tone(a, 'sawtooth', 420, 60, { release: 0.4, peak: 0.12 })
  },
  kiCharge: (a) => noise(a, 'bandpass', 200, 2400, { attack: 1.0, hold: 0.1, release: 0.15, peak: 0.25 }),
  kiBlast: (a) => {
    noise(a, 'lowpass', 4000, 300, { release: 0.6, peak: 0.35 })
    tone(a, 'sine', 120, 40, { release: 0.5, peak: 0.4 })
  },
  chime: (a) =>
    [1046.5, 1318.5, 1568].forEach((f, i) => tone(a, 'triangle', f, f, { at: i * 0.11, release: 0.8, peak: 0.12 })),
  fanfare: (a) =>
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) =>
      tone(a, 'triangle', f, f, { at: i * 0.14, hold: i === 4 ? 0.4 : 0.05, release: 0.6, peak: 0.14 }),
    ),
}

export function play(name: SfxName): void {
  if (muted) return
  const a = audio()
  if (!a) return
  try {
    // Until the browser allows audio (a user gesture), skip the sound rather than queue it:
    // queued sounds would all fire at once on the first click.
    if (a.state !== 'running') {
      void a.resume().catch(() => {})
      return
    }
    sounds[name](a)
  } catch {
    /* a blocked or closed context stays silent */
  }
}
