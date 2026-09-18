import React, { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import EditorPanel from './components/EditorPanel'
import TerminalPanel from './components/TerminalPanel'
import { useStore } from './store'

export default function App() {
  const { terminalOpen, sidebarOpen } = useStore()
  const [terminalHeight, setTerminalHeight] = useState(250)
  const resizingRef = useRef(false)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    resizingRef.current = true
    const startY = e.clientY
    const startHeight = terminalHeight

    const handleMove = (e) => {
      if (!resizingRef.current) return
      const diff = startY - e.clientY
      setTerminalHeight(Math.max(100, Math.min(600, startHeight + diff)))
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
    fetch('/api/files')
      .then(r => r.json())
      .then(tree => useStore.getState().setFileTree(tree))
      .catch(console.error)
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
            <EditorPanel />
          </div>
          
          {terminalOpen && (
            <>
              <div
                className="resizer h-1 cursor-row-resize flex-shrink-0"
                onMouseDown={handleResizeStart}
              />
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
