import { useState } from 'react'
import { isMuted, play, setMuted } from '../audio/sfx'

export function SoundToggle() {
  const [on, setOn] = useState(() => !isMuted())
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={() => {
        const next = !on
        setMuted(!next)
        setOn(next)
        if (next) play('beep')
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none" />
        {on ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  )
}
