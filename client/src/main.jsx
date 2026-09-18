import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#0a0a0f', color: '#e4e4e7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'sans-serif', padding: '20px'
        }}>
          <div style={{
            background: '#12121a', border: '1px solid #ef4444', borderRadius: '12px',
            padding: '32px', maxWidth: '600px', width: '100%'
          }}>
            <h2 style={{ color: '#ef4444', marginTop: 0 }}>⚠️ Application Error</h2>
            <p style={{ color: '#a1a1aa' }}>Something went wrong loading the app:</p>
            <pre style={{
              background: '#1a1a2e', padding: '16px', borderRadius: '8px',
              overflow: 'auto', fontSize: '12px', color: '#f87171'
            }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#6366f1', color: 'white', border: 'none', padding: '10px 20px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '14px', marginTop: '16px'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Global error handler
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Hide loading screen once React mounts
setTimeout(() => {
  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    loadingScreen.classList.add('hidden')
    setTimeout(() => loadingScreen.remove(), 300)
  }
}, 100)
