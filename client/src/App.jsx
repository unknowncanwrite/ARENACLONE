import React, { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import RightPanel from './components/RightPanel'
import TerminalPanel from './components/TerminalPanel'
import { useStore } from './store'

export default function App() {
  const { terminalOpen, sidebarOpen, setFileTree } = useStore()
  const [terminalHeight, setTerminalHeight] = useState(250)
  const resizingRef = useRef(false)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    resizingRef.current = true
    const startY = e.clientY
    const startHeight = terminalHeight
    const handleMove = (e) => {
      if (!resizingRef.current) return
      setTerminalHeight(Math.max(100, Math.min(600, startHeight + (startY - e.clientY))))
    }
    const handleUp = () => {
      resizingRef.current = false
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [terminalHeight])

  // Load file tree on mount
  useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(t => setFileTree(t)).catch(() => {})
  }, [])

  // WebSocket connection for real-time events (file changes, preview, etc.)
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?type=events`)
    
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        
        if (data.type === 'files_changed' || data.type === 'file_written') {
          // Refresh file tree
          fetch('/api/files').then(r => r.json()).then(t => setFileTree(t)).catch(() => {})
          
          // If a specific file was written, update it in the editor
          if (data.type === 'file_written' && data.path) {
            fetch(`/api/files/read?path=${encodeURIComponent(data.path)}`)
              .then(r => r.json())
              .then(result => {
                const store = useStore.getState()
                // Update file content if it's open
                if (store.fileContents[data.path] !== undefined) {
                  store.updateFileContent(data.path, result.content)
                }
              })
              .catch(() => {})
          }
        }
        
        if (data.type === 'preview_started') {
          useStore.getState().setRightPanel('preview')
          useStore.getState().setPreview(true, data.port)
        }
      } catch (err) {}
    }
    
    ws.onerror = () => {}
    ws.onclose = () => {
      // Reconnect after delay
      setTimeout(() => {
        // Component may be unmounted, that's fine
      }, 3000)
    }
    
    return () => ws.close()
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-arena-bg">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <Sidebar />}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <ChatPanel />
            <div className="w-px bg-arena-border" />
            <RightPanel />
          </div>
          {terminalOpen && (
            <>
              <div className="resizer h-1 cursor-row-resize flex-shrink-0" onMouseDown={handleResizeStart} />
              <div style={{ height: terminalHeight }} className="flex-shrink-0">
                <TerminalPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
