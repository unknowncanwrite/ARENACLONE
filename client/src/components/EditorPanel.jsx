import React, { useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useStore } from '../store'
import { X, Save, Loader2 } from 'lucide-react'
import { useState } from 'react'

function getLanguage(path) {
  const ext = path?.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', py: 'python', rb: 'ruby', go: 'go',
    rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    sh: 'shell', bash: 'shell', sql: 'sql', graphql: 'graphql',
  }
  return map[ext] || 'plaintext'
}

export default function EditorPanel() {
  const { openFiles, activeFile, fileContents, closeFile, updateFileContent, activePanel, setActivePanel } = useStore()
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: fileContents[activeFile] }),
      })
    } catch (e) {
      console.error('Save failed', e)
    }
    setSaving(false)
  }, [activeFile, fileContents])

  if (openFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-arena-bg text-arena-muted">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-arena-border rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
          </div>
          <p className="text-sm">No file open</p>
          <p className="text-xs mt-1">Click a file in the explorer to open it</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-arena-bg min-w-0">
      {/* Tabs */}
      <div className="flex items-center bg-arena-surface border-b border-arena-border overflow-x-auto flex-shrink-0">
        {openFiles.map((path) => {
          const name = path.split('/').pop()
          const isActive = path === activeFile
          return (
            <div
              key={path}
              className={`group flex items-center gap-2 px-3 py-2 text-xs border-r border-arena-border cursor-pointer whitespace-nowrap ${
                isActive ? 'bg-arena-bg text-arena-text' : 'text-arena-muted hover:bg-arena-hover'
              }`}
              onClick={() => useStore.setState({ activeFile: path })}
            >
              <span>{name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeFile(path) }}
                className="p-0.5 rounded hover:bg-arena-hover opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <div className="flex-1" />
        {activeFile && (
          <button
            onClick={handleSave}
            className="px-3 py-2 text-xs text-arena-muted hover:text-arena-text flex items-center gap-1.5"
            title="Save file (Ctrl+S)"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeFile && (
          <Editor
            height="100%"
            language={getLanguage(activeFile)}
            value={fileContents[activeFile] || ''}
            onChange={(v) => updateFileContent(activeFile, v || '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              tabSize: 2,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  )
}
