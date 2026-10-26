import type { Application, Milestone, MilestoneId, Stage } from './types'

const SENT: Stage[] = ['applied', 'hr_call', 'tech_interview', 'home_task', 'final_interview', 'offer', 'rejected', 'withdrawn']

const DEFS: { id: MilestoneId; star: Milestone['star']; label: string }[] = [
  { id: 'first_application', star: 1, label: 'First application sent' },
  { id: 'ten_applications', star: 2, label: '10 applications sent' },
  { id: 'first_hr_call', star: 3, label: 'First HR call' },
  { id: 'first_tech_interview', star: 4, label: 'First technical interview' },
  { id: 'first_home_task', star: 5, label: 'First home task' },
  { id: 'first_final_interview', star: 6, label: 'First final interview' },
  { id: 'first_offer', star: 7, label: 'First offer' },
]

const STAGE_FOR: Partial<Record<MilestoneId, Stage>> = {
  first_hr_call: 'hr_call',
  first_tech_interview: 'tech_interview',
  first_home_task: 'home_task',
  first_final_interview: 'final_interview',
  first_offer: 'offer',
}

/** The seven Black Star milestones, derived from tracker history (never stored). */
export function deriveMilestones(apps: Application[]): Milestone[] {
  // when each application was first sent, oldest first
  const sentAt = apps
    .map((a) => a.history.find((h) => SENT.includes(h.stage))?.at)
    .filter((x): x is string => !!x)
    .sort()
  const firstAt = (stage: Stage) =>
    apps
      .flatMap((a) => a.history.filter((h) => h.stage === stage).map((h) => h.at))
      .sort()[0] ?? null

  return DEFS.map((d) => {
    let earnedAt: string | null = null
    if (d.id === 'first_application') earnedAt = sentAt[0] ?? null
    else if (d.id === 'ten_applications') earnedAt = sentAt[9] ?? null
    else earnedAt = firstAt(STAGE_FOR[d.id]!)
    return { ...d, earnedAt }
  })
}
