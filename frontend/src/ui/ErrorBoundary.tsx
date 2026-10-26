import { Component, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app, and says what happened. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[scouter] screen crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="placeholder" role="alert">
        <h1>This screen crashed</h1>
        <p>{this.state.error.message}</p>
        <button type="button" className="hs-btn" onClick={() => location.reload()}>
          Reload
        </button>
      </section>
    )
  }
}
