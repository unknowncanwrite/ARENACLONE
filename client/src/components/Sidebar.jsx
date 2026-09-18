import React, { useState, useCallback } from 'react'
import { useStore } from '../store'
import { 
  FolderOpen, Folder, FileText, FileCode, File, 
  ChevronRight, ChevronDown, Plus, RefreshCw,
  FileJson, FileImage, FileType
} from 'lucide-react'

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx':
      return <FileCode size={14} className="text-yellow-400" />
    case 'json':
      return <FileJson size={14} className="text-green-400" />
    case 'css': case 'scss':
      return <FileCode size={14} className="text-blue-400" />
    case 'html':
      return <FileCode size={14} className="text-orange-400" />
    case 'md':
      return <FileType size={14} className="text-gray-400" />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg':
      return <FileImage size={14} className="text-purple-400" />
    default:
      return <FileText size={14} className="text-gray-400" />
  }
}

function FileTreeNode({ node, depth = 0 }) {
  const { expandedDirs, toggleDir, openFile, activeFile } = useStore()
  const isExpanded = expandedDirs.has(node.path)
  const isActive = activeFile === node.path

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      toggleDir(node.path)
    } else {
      fetch(`/api/files/read?path=${encodeURIComponent(node.path)}`)
        .then(r => r.json())
        .then(data => openFile(node.path, data.content))
        .catch(console.error)
    }
  }, [node, toggleDir, openFile])

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer text-xs hover:bg-arena-hover transition-colors rounded mx-1 ${
          isActive ? 'bg-arena-accent/10 text-arena-accent' : 'text-arena-text'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {isExpanded ? <FolderOpen size={14} className="text-arena-accent" /> : <Folder size={14} className="text-arena-accent" />}
          </>
        ) : (
          <>
            <span className="w-3" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { fileTree, setFileTree } = useStore()
  const [loading, setLoading] = useState(false)

  const refreshTree = useCallback(() => {
    setLoading(true)
    fetch('/api/files')
      .then(r => r.json())
      .then(tree => { setFileTree(tree); setLoading(false) })
      .catch(() => setLoading(false))
  }, [setFileTree])

  return (
    <div className="w-56 bg-arena-surface border-r border-arena-border flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-arena-border">
        <span className="text-xs font-medium text-arena-muted uppercase tracking-wider">Explorer</span>
        <button
          onClick={refreshTree}
          className="p-1 rounded hover:bg-arena-hover text-arena-muted hover:text-arena-text transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-arena-muted text-center">
            <p>No files yet.</p>
            <p className="mt-1">Ask the agent to create something!</p>
          </div>
        ) : (
          fileTree.map(node => (
            <FileTreeNode key={node.path} node={node} />
          ))
        )}
      </div>
    </div>
  )
}
