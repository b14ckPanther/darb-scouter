export type Stage =
  | 'saved'
  | 'applied'
  | 'hr_call'
  | 'tech_interview'
  | 'home_task'
  | 'final_interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export type Evidence = { quote: string; display: string; source: 'post' | 'freehire' }

export type ScoreLine = {
  kind: 'must' | 'nice' | 'seniority' | 'experience' | 'education' | 'location'
  label: string
  points: number
  evidence?: Evidence
  skill?: string
  trainGain?: number
  /** The one skill to train when a line names several. */
  trainLabel?: string
}

export type Score = { total: number; lines: ScoreLine[] }

export type Job = {
  id: string
  title: string
  company: string
  city: string
  workMode: 'onsite' | 'hybrid' | 'remote'
  url: string
  postedAt: string
  foundAt: string
  seniority: string
  score: Score
}

export type Application = {
  id: string
  jobId: string
  stage: Stage
  history: { stage: Stage; at: string }[]
  notes: string
}

export type MilestoneId =
  | 'first_application'
  | 'ten_applications'
  | 'first_hr_call'
  | 'first_tech_interview'
  | 'first_home_task'
  | 'first_final_interview'
  | 'first_offer'

export type Milestone = {
  id: MilestoneId
  star: 1 | 2 | 3 | 4 | 5 | 6 | 7
  label: string
  earnedAt: string | null
}
