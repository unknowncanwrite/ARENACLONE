import React, { useCallback, lazy, Suspense } from 'react'
import { useStore } from '../store'
import { X, Save, Loader2, Code2 } from 'lucide-react'
import { useState } from 'react'

// Lazy load Monaco editor
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

function getLanguage(path) {
  const ext = path?.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    json: 'json', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', py: 'python', rb: 'ruby', go: 'go',
    rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    sh: 'shell', bash: 'shell', sql: 'sql',
  }
  return map[ext] || 'plaintext'
}

export default function EditorPanel() {
  const { openFiles, activeFile, fileContents, closeFile, updateFileContent } = useStore()
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
        <Code2 size={40} className="mb-3 opacity-30" />
        <p className="text-sm">No file open</p>
        <p className="text-xs mt-1">Click a file in the explorer</p>
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
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeFile && (
          <Suspense fallback={
            <div className="h-full flex items-center justify-center text-arena-muted text-sm">
              Loading editor...
            </div>
          }>
            <MonacoEditor
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
                tabSize: 2,
                wordWrap: 'on',
                automaticLayout: true,
              }}
              loading={
                <div className="h-full flex items-center justify-center text-arena-muted text-sm">
                  Loading Monaco Editor...
                </div>
              }
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
