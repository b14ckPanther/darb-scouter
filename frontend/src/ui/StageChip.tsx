import type { Stage } from '../domain/types'

export const STAGE_LABEL: Record<Stage, string> = {
  saved: 'Saved',
  applied: 'Applied',
  hr_call: 'HR call',
  tech_interview: 'Tech interview',
  home_task: 'Home task',
  final_interview: 'Final interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export function StageChip({ stage }: { stage: Stage }) {
  return (
    <span className={`stage-chip stage-${stage}`}>
      <span className="stage-chip-dot" aria-hidden="true" />
      {STAGE_LABEL[stage]}
    </span>
  )
}
