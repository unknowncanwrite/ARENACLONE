import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '../store'
import { 
  Send, User, Bot, Wrench, CheckCircle2, XCircle, 
  Loader2, Sparkles, FileCode, Terminal, Search, 
  Pencil, Trash2, FolderOpen, Paperclip
} from 'lucide-react'

function ToolIcon({ name }) {
  switch (name) {
    case 'write_file': return <FileCode size={12} />
    case 'read_file': return <FolderOpen size={12} />
    case 'run_command': return <Terminal size={12} />
    case 'search_files': return <Search size={12} />
    case 'edit_file': return <Pencil size={12} />
    case 'delete_file': return <Trash2 size={12} />
    case 'list_directory': return <FolderOpen size={12} />
    default: return <Wrench size={12} />
  }
}

function ToolCall({ tool, result }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = result !== undefined

  return (
    <div className="my-2 bg-arena-surface border border-arena-border rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-arena-hover transition-colors"
      >
        <ToolIcon name={tool.name} />
        <span className="font-medium mono">{tool.name}</span>
        {tool.args?.path && (
          <span className="text-arena-muted truncate mono">{tool.args.path}</span>
        )}
        {tool.args?.command && (
          <span className="text-arena-muted truncate mono">{tool.args.command}</span>
        )}
        <span className="ml-auto">
          {!isDone ? (
            <Loader2 size={12} className="animate-spin text-arena-accent" />
          ) : result?.toString().startsWith('Error') ? (
            <XCircle size={12} className="text-arena-red" />
          ) : (
            <CheckCircle2 size={12} className="text-arena-green" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-arena-border">
          <div className="p-2">
            <div className="text-arena-muted mb-1">Arguments:</div>
            <pre className="bg-arena-bg p-2 rounded mono text-[11px] overflow-x-auto max-h-32">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>
          {isDone && (
            <div className="p-2 border-t border-arena-border">
              <div className="text-arena-muted mb-1">Result:</div>
              <pre className="bg-arena-bg p-2 rounded mono text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const toolCalls = msg.toolCalls || []
  
  // Build tool pairs (call + result)
  const toolPairs = []
  for (let i = 0; i < toolCalls.length; i++) {
    toolPairs.push(toolCalls[i])
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot size={14} className="text-white" />
        </div>
      )}
      
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {isUser ? (
          <div className="bg-arena-accent/20 border border-arena-accent/30 rounded-2xl rounded-br-md px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          </div>
        ) : (
          <div className="bg-arena-surface border border-arena-border rounded-2xl rounded-tl-md px-4 py-3">
            {msg.content && (
              <div className="chat-markdown text-sm leading-relaxed">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}
            {toolPairs.length > 0 && (
              <div className="mt-2 space-y-1">
                {toolPairs.map((tc, i) => (
                  <ToolCall key={i} tool={{ name: tc.name, args: tc.args }} result={tc.result} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-arena-hover flex items-center justify-center flex-shrink-0 mt-1">
          <User size={14} className="text-arena-text" />
        </div>
      )}
    </div>
  )
}

export default function ChatPanel() {
  const { messages, isStreaming, currentResponse, toolCalls, addMessage, setStreaming, 
          updateCurrentResponse, finalizeResponse, addToolCall, setFileTree } = useStore()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentResponse, toolCalls])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userMsg = input.trim()
    setInput('')
    addMessage({ role: 'user', content: userMsg })
    setStreaming(true)

    const allMessages = [...useStore.getState().messages, { role: 'user', content: userMsg }]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages }),
        signal: controller.signal,
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            
            if (event.type === 'assistant') {
              updateCurrentResponse(event.content)
            } else if (event.type === 'tool_call') {
              addToolCall({ name: event.name, args: event.args, result: undefined })
            } else if (event.type === 'tool_result') {
              const state = useStore.getState()
              const tcs = [...state.toolCalls]
              // Find the last matching tool call without result
              for (let i = tcs.length - 1; i >= 0; i--) {
                if (tcs[i].name === event.name && tcs[i].result === undefined) {
                  tcs[i] = { ...tcs[i], result: event.result }
                  break
                }
              }
              useStore.setState({ toolCalls: tcs })
            } else if (event.type === 'error') {
              updateCurrentResponse(`\n\n⚠️ Error: ${event.error}`)
            } else if (event.type === 'done') {
              // Done
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }

      // Finalize - move current response to messages
      finalizeResponse()
      
      // Refresh file tree
      fetch('/api/files')
        .then(r => r.json())
        .then(tree => setFileTree(tree))
        .catch(() => {})
    } catch (err) {
      if (err.name !== 'AbortError') {
        updateCurrentResponse(`\n\n⚠️ Connection error: ${err.message}`)
        finalizeResponse()
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Build streaming display
  const streamingToolCalls = useStore.getState().toolCalls

  return (
    <div className="flex-1 flex flex-col min-w-[380px] max-w-[55%]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Arena Agent Mode</h2>
            <p className="text-arena-muted text-sm max-w-md">
              I'm your AI coding agent. I can read, write, and edit files, run commands, 
              and build entire applications for you. Just tell me what you need!
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                'Build a React todo app with dark theme',
                'Create a Python REST API with FastAPI',
                'Set up a Next.js blog with MDX',
                'Make a game in vanilla JavaScript',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInput(suggestion)}
                  className="text-left text-xs px-3 py-2.5 bg-arena-surface border border-arena-border rounded-lg hover:bg-arena-hover hover:border-arena-accent/30 transition-colors text-arena-muted hover:text-arena-text"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}
            
            {/* Streaming response */}
            {isStreaming && (currentResponse || streamingToolCalls.length > 0) && (
              <div className="flex gap-3 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="max-w-[85%] bg-arena-surface border border-arena-border rounded-2xl rounded-tl-md px-4 py-3">
                  {currentResponse && (
                    <div className="chat-markdown text-sm leading-relaxed">
                      <ReactMarkdown>{currentResponse}</ReactMarkdown>
                    </div>
                  )}
                  {streamingToolCalls.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {streamingToolCalls.map((tc, i) => (
                        <ToolCall key={i} tool={{ name: tc.name, args: tc.args }} result={tc.result} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Typing indicator */}
            {isStreaming && !currentResponse && streamingToolCalls.length === 0 && (
              <div className="flex gap-3 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-arena-surface border border-arena-border rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-arena-muted rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-arena-muted rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-arena-muted rounded-full typing-dot" />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-arena-border bg-arena-surface">
        <div className="flex items-end gap-2 bg-arena-bg border border-arena-border rounded-xl px-3 py-2 focus-within:border-arena-accent/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent to build, edit, or debug..."
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-arena-muted min-h-[36px] max-h-[200px]"
            rows={1}
            disabled={isStreaming}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-arena-accent hover:bg-arena-accentHover disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        <p className="text-[10px] text-arena-muted mt-2 text-center">
          Agent can read/write files, run commands, and build full applications
        </p>
      </div>
    </div>
  )
}
