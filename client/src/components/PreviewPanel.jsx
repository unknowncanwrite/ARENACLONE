import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { 
  Eye, RefreshCw, ExternalLink, Loader2, 
  Monitor, RotateCcw, Maximize2, Wifi, WifiOff
} from 'lucide-react'

export default function PreviewPanel() {
  const { previewPort, previewRunning } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const iframeRef = useRef(null)
  const [key, setKey] = useState(0)

  const previewUrl = '/preview/'

  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    setKey(k => k + 1)
  }

  const handleLoad = () => {
    setLoading(false)
    setError(null)
  }

  const handleError = () => {
    setLoading(false)
    setError('Preview not responding')
  }

  // Auto-refresh when preview starts
  useEffect(() => {
    if (previewRunning) {
      // Wait a moment for the server to start, then refresh
      const timer = setTimeout(() => {
        handleRefresh()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [previewRunning, previewPort])

  // Poll preview status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/preview/status')
        const data = await res.json()
        useStore.setState({ 
          previewRunning: data.running, 
          previewPort: data.port 
        })
      } catch (e) {}
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!previewRunning) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-arena-bg text-arena-muted p-8">
        <Monitor size={48} className="mb-4 opacity-20" />
        <h3 className="text-sm font-medium mb-2">Live Preview</h3>
        <p className="text-xs text-center max-w-xs">
          When the agent builds an app, it will appear here as a live interactive preview.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Preview toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-arena-surface border-b border-arena-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1 bg-arena-bg border border-arena-border rounded-md px-2 py-1">
          <div className={`w-1.5 h-1.5 rounded-full ${previewRunning ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-[11px] mono text-arena-muted truncate">
            localhost:{previewPort}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded hover:bg-arena-hover text-arena-muted hover:text-arena-text transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-arena-hover text-arena-muted hover:text-arena-text transition-colors"
          title="Open in new tab"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-arena-bg z-10">
            <div className="text-center">
              <Loader2 size={24} className="animate-spin text-arena-accent mx-auto mb-2" />
              <p className="text-xs text-arena-muted">Loading preview...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-arena-bg z-10">
            <div className="text-center">
              <WifiOff size={24} className="text-arena-red mx-auto mb-2" />
              <p className="text-xs text-arena-muted">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-2 px-3 py-1 bg-arena-accent text-white rounded text-xs"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <iframe
          key={key}
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          onError={handleError}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          title="Live Preview"
        />
      </div>
    </div>
  )
}
