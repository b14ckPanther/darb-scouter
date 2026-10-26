import { NavLink, Route, Routes } from 'react-router'
import { JourneyScreen } from './screens/JourneyScreen'
import { LogScreen } from './screens/LogScreen'
import { RadarScreen } from './screens/RadarScreen'
import { ScouterScreen } from './screens/ScouterScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { SoundToggle } from './ui/SoundToggle'

const nav = [
  { to: '/', label: 'Radar', end: true },
  { to: '/log', label: 'Scouter log' },
  { to: '/journey', label: 'Journey' },
  { to: '/settings', label: 'Settings' },
]

export function AppRoutes() {
  return (
    <div className="shell">
      <main className="shell-main">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<RadarScreen />} />
          <Route path="/job/:id" element={<ScouterScreen />} />
          <Route path="/journey" element={<JourneyScreen />} />
          <Route path="/log" element={<LogScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
        </ErrorBoundary>
      </main>
      <nav className="shell-nav" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {n.label}
          </NavLink>
        ))}
        <SoundToggle />
      </nav>
    </div>
  )
}
