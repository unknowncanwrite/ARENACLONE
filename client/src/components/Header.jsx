import React from 'react'
import { useStore } from '../store'
import { 
  Terminal, PanelLeftClose, PanelLeft, Zap, 
  RotateCcw, Settings, Github
} from 'lucide-react'

export default function Header() {
  const { sidebarOpen, setSidebarOpen, terminalOpen, setTerminalOpen, clearMessages, isStreaming } = useStore()

  return (
    <header className="h-12 bg-arena-surface border-b border-arena-border flex items-center px-4 justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded hover:bg-arena-hover text-arena-muted hover:text-arena-text transition-colors"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
        
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm">Arena Agent Mode</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-arena-accent/20 text-arena-accent rounded font-medium">
            BETA
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isStreaming && (
          <div className="flex items-center gap-2 px-3 py-1 bg-arena-accent/10 border border-arena-accent/30 rounded-full">
            <div className="w-2 h-2 bg-arena-accent rounded-full animate-pulse" />
            <span className="text-xs text-arena-accent">Agent working...</span>
          </div>
        )}
        
        <button
          onClick={() => setTerminalOpen(!terminalOpen)}
          className={`p-1.5 rounded hover:bg-arena-hover transition-colors ${terminalOpen ? 'text-arena-accent' : 'text-arena-muted'}`}
          title="Toggle terminal"
        >
          <Terminal size={18} />
        </button>

        <button
          onClick={() => { if (confirm('Clear all messages?')) clearMessages(); }}
          className="p-1.5 rounded hover:bg-arena-hover text-arena-muted hover:text-arena-text transition-colors"
          title="Clear chat"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </header>
  )
}
