const COPY = {
  'radar-empty': {
    title: 'Radar found nothing tonight',
    body: 'No new junior roles in the north or center since your last scan. The next sweep runs tomorrow at 07:00.',
  },
  'no-gaps': {
    title: 'Nothing to train. You match every listed skill.',
    body: 'Every requirement in this post is already on your profile. Apply while it is fresh.',
  },
  'no-applications': {
    title: 'No applications yet',
    body: 'Scan a job and press Apply. Your first one lights the one-star Dragon Ball.',
  },
} as const

export function EmptyState({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind]
  return (
    <div className={`empty-state empty-${kind}`}>
      {kind === 'radar-empty' && <span className="empty-scope" aria-hidden="true" />}
      <p className="empty-title">{c.title}</p>
      <p className="empty-body">{c.body}</p>
    </div>
  )
}
