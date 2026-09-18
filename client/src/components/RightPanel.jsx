import React from 'react'
import { useStore } from '../store'
import EditorPanel from './EditorPanel'
import PreviewPanel from './PreviewPanel'
import { Code2, Eye, Monitor } from 'lucide-react'

export default function RightPanel() {
  const { rightPanel, setRightPanel, previewRunning } = useStore()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center bg-arena-surface border-b border-arena-border flex-shrink-0">
        <button
          onClick={() => setRightPanel('editor')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            rightPanel === 'editor'
              ? 'border-arena-accent text-arena-text'
              : 'border-transparent text-arena-muted hover:text-arena-text'
          }`}
        >
          <Code2 size={13} />
          Editor
        </button>
        <button
          onClick={() => setRightPanel('preview')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors relative ${
            rightPanel === 'preview'
              ? 'border-arena-accent text-arena-text'
              : 'border-transparent text-arena-muted hover:text-arena-text'
          }`}
        >
          <Monitor size={13} />
          Live Preview
          {previewRunning && (
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          )}
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {rightPanel === 'editor' && <EditorPanel />}
        {rightPanel === 'preview' && <PreviewPanel />}
      </div>
    </div>
  )
}
