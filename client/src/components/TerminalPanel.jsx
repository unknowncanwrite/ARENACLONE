import React, { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useStore } from '../store'

// Lazy load xterm to prevent crash if it fails
const XtermTerminal = lazy(() => import('./XtermTerminal'))

export default function TerminalPanel() {
  const [error, setError] = useState(null)

  if (error) {
    return (
      <div className="h-full flex flex-col bg-[#0a0a0f]">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-arena-border bg-arena-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-arena-muted">Terminal</span>
            <span className="text-xs text-arena-red">⚠️ Error</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-arena-muted text-sm p-4">
          <div className="text-center">
            <p>Terminal failed to load</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 px-3 py-1 bg-arena-accent text-white rounded text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center bg-[#0a0a0f] text-arena-muted text-sm">
        Loading terminal...
      </div>
    }>
      <ErrorCatcher onError={setError}>
        <XtermTerminal />
      </ErrorCatcher>
    </Suspense>
  )
}

// Error boundary for terminal
class ErrorCatcher extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  componentDidCatch(error) {
    this.props.onError?.(error)
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
