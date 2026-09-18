import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '../store'
import { 
  Send, User, Bot, Wrench, CheckCircle2, XCircle, 
  Loader2, Sparkles, FileCode, Terminal, Search, 
  Pencil, Trash2, FolderOpen, Brain, Hammer, FlaskConical,
  Check, ChevronDown, ChevronRight, Monitor
} from 'lucide-react'

// ============ Tool Icon ============
function ToolIcon({ name, size = 13 }) {
  const props = { size }
  switch (name) {
    case 'write_file': return <FileCode {...props} className="text-green-400" />
    case 'read_file': return <FolderOpen {...props} className="text-blue-400" />
    case 'run_command': return <Terminal {...props} className="text-yellow-400" />
    case 'search': return <Search {...props} className="text-purple-400" />
    case 'edit_file': return <Pencil {...props} className="text-orange-400" />
    case 'delete_file': return <Trash2 {...props} className="text-red-400" />
    case 'list_files': return <FolderOpen {...props} className="text-cyan-400" />
    case 'start_preview': return <Monitor {...props} className="text-indigo-400" />
    default: return <Wrench {...props} className="text-gray-400" />
  }
}

// ============ Phase Banner ============
function PhaseBanner({ phase, message }) {
  const colors = {
    thinking: 'from-blue-500/20 to-purple-500/20 border-blue-500/30',
    building: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
    testing: 'from-cyan-500/20 to-teal-500/20 border-cyan-500/30',
    done: 'from-green-500/20 to-emerald-500/20 border-green-500/30',
  }
  const icons = {
    thinking: <Brain size={14} className="text-blue-400" />,
    building: <Hammer size={14} className="text-amber-400" />,
    testing: <FlaskConical size={14} className="text-cyan-400" />,
    done: <Check size={14} className="text-green-400" />,
  }
  return (
    <div className={`my-3 px-3 py-2 rounded-lg bg-gradient-to-r ${colors[phase] || colors.thinking} border flex items-center gap-2`}>
      {icons[phase]}
      <span className="text-xs font-medium">{message}</span>
    </div>
  )
}

// ============ Command Card (Live) ============
function CommandCard({ command, output, exitCode, streaming }) {
  const [expanded, setExpanded] = useState(true)
  const outputRef = useRef(null)
  
  useEffect(() => {
    if (outputRef.current && streaming) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, streaming])

  const isSuccess = exitCode === 0
  const isRunning = streaming && exitCode === undefined

  return (
    <div className="my-2 rounded-lg border border-arena-border overflow-hidden bg-arena-surface">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-arena-hover/50 transition-colors text-left">
        <Terminal size={13} className="text-yellow-400 flex-shrink-0" />
        <code className="text-xs mono flex-1 truncate text-arena-text">$ {command}</code>
        <span className="flex-shrink-0 flex items-center gap-1">
          {isRunning && <Loader2 size={12} className="animate-spin text-yellow-400" />}
          {exitCode !== undefined && (isSuccess ? <CheckCircle2 size={13} className="text-green-400" /> : <XCircle size={13} className="text-red-400" />)}
          {expanded ? <ChevronDown size={12} className="text-arena-muted" /> : <ChevronRight size={12} className="text-arena-muted" />}
        </span>
      </button>
      {expanded && output && (
        <div ref={outputRef} className="border-t border-arena-border bg-[#0a0a0f] px-3 py-2 max-h-64 overflow-y-auto">
          <pre className="mono text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap break-all">
            {output}
            {isRunning && <span className="inline-block w-2 h-3 bg-green-400 ml-1 animate-pulse" />}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============ Tool Card ============
function ToolCard({ name, args, result }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = result !== undefined
  const isError = result?.toString().startsWith('❌') || result?.toString().startsWith('Error')

  return (
    <div className="my-2 rounded-lg border border-arena-border overflow-hidden bg-arena-surface">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-arena-hover/50 transition-colors text-left">
        <ToolIcon name={name} />
        <span className="text-xs font-medium mono">{name}</span>
        {args?.path && <span className="text-xs text-arena-muted truncate mono">{args.path}</span>}
        {args?.command && <span className="text-xs text-arena-muted truncate mono">{args.command}</span>}
        <span className="ml-auto flex items-center gap-1">
          {!isDone && <Loader2 size={12} className="animate-spin text-arena-accent" />}
          {isDone && (isError ? <XCircle size={12} className="text-red-400" /> : <CheckCircle2 size={12} className="text-green-400" />)}
          {expanded ? <ChevronDown size={12} className="text-arena-muted" /> : <ChevronRight size={12} className="text-arena-muted" />}
        </span>
      </button>
      {expanded && isDone && result && (
        <div className="border-t border-arena-border px-3 py-2">
          <pre className="mono text-[11px] text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto break-all">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============ Message Component ============
function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex gap-3 justify-end mb-4">
        <div className="max-w-[85%]">
          <div className="bg-arena-accent/20 border border-arena-accent/30 rounded-2xl rounded-br-md px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
        <div className="w-7 h-7 rounded-lg bg-arena-hover flex items-center justify-center flex-shrink-0 mt-1">
          <User size={14} className="text-arena-text" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-white" />
      </div>
      <div className="max-w-[85%] min-w-0">
        {msg.events?.map((event, i) => {
          if (event.type === 'phase') return <PhaseBanner key={i} phase={event.phase} message={event.message} />
          if (event.type === 'text') return (
            <div key={i} className="chat-markdown text-sm leading-relaxed my-2">
              <ReactMarkdown>{event.content}</ReactMarkdown>
            </div>
          )
          if (event.type === 'command') return <CommandCard key={i} command={event.command} output={event.output} exitCode={event.exitCode} streaming={event.streaming} />
          if (event.type === 'tool') return <ToolCard key={i} name={event.name} args={event.args} result={event.result} />
          return null
        })}
      </div>
    </div>
  )
}

// ============ Live Streaming Message (during agent execution) ============
function LiveMessage({ events, currentText }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-white" />
      </div>
      <div className="max-w-[85%] min-w-0">
        {events.map((event, i) => {
          if (event.type === 'phase') return <PhaseBanner key={i} phase={event.phase} message={event.message} />
          if (event.type === 'text') return (
            <div key={i} className="chat-markdown text-sm leading-relaxed my-2">
              <ReactMarkdown>{event.content}</ReactMarkdown>
            </div>
          )
          if (event.type === 'command') return <CommandCard key={i} command={event.command} output={event.output} exitCode={event.exitCode} streaming={event.streaming} />
          if (event.type === 'tool') return <ToolCard key={i} name={event.name} args={event.args} result={event.result} />
          return null
        })}
        {/* Current streaming text (character by character) */}
        {currentText && (
          <div className="chat-markdown text-sm leading-relaxed my-2">
            <ReactMarkdown>{currentText}</ReactMarkdown>
            <span className="inline-block w-2 h-4 bg-arena-accent ml-0.5 animate-pulse align-middle" />
          </div>
        )}
      </div>
    </div>
  )
}

// ============ Typing Indicator ============
function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Bot size={14} className="text-white" />
      </div>
      <div className="bg-arena-surface border border-arena-border rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-3">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-arena-accent rounded-full typing-dot" />
          <div className="w-2 h-2 bg-arena-accent rounded-full typing-dot" />
          <div className="w-2 h-2 bg-arena-accent rounded-full typing-dot" />
        </div>
        <span className="text-xs text-arena-muted">Agent is thinking...</span>
      </div>
    </div>
  )
}

// ============ Main ChatPanel ============
export default function ChatPanel() {
  const { messages, isStreaming, addMessage, setStreaming, setFileTree } = useStore()
  const [input, setInput] = useState('')
  const [liveEvents, setLiveEvents] = useState([])
  const [currentText, setCurrentText] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveEvents, currentText])

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
    setLiveEvents([])
    setCurrentText('')

    const allMessages = [...useStore.getState().messages, { role: 'user', content: userMsg }]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let events = []
      let textBuffer = ''

      const flush = () => {
        setLiveEvents([...events])
        setCurrentText(textBuffer)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))

            if (ev.type === 'phase') {
              // If there's pending text, finalize it
              if (textBuffer) {
                events.push({ type: 'text', content: textBuffer })
                textBuffer = ''
              }
              events.push({ type: 'phase', phase: ev.phase, message: ev.message })
              flush()
            }
            else if (ev.type === 'text_delta') {
              textBuffer += ev.content
              setCurrentText(textBuffer)
            }
            else if (ev.type === 'text_end') {
              if (textBuffer) {
                events.push({ type: 'text', content: textBuffer })
                textBuffer = ''
                setCurrentText('')
                flush()
              }
            }
            else if (ev.type === 'command_start') {
              // Finalize any pending text
              if (textBuffer) { events.push({ type: 'text', content: textBuffer }); textBuffer = ''; setCurrentText('') }
              events.push({ type: 'command', command: ev.command, output: '', exitCode: undefined, streaming: true })
              flush()
            }
            else if (ev.type === 'command_output') {
              const cmd = [...events].reverse().find(e => e.type === 'command' && e.streaming)
              if (cmd) { cmd.output += ev.data; flush() }
            }
            else if (ev.type === 'command_end') {
              const cmd = [...events].reverse().find(e => e.type === 'command' && e.streaming)
              if (cmd) { cmd.exitCode = ev.exitCode; cmd.streaming = false; cmd.output = ev.output || cmd.output; flush() }
            }
            else if (ev.type === 'tool_start') {
              if (textBuffer) { events.push({ type: 'text', content: textBuffer }); textBuffer = ''; setCurrentText('') }
              if (!['run_command'].includes(ev.name)) {
                events.push({ type: 'tool', name: ev.name, args: ev.args, result: undefined })
                flush()
              }
            }
            else if (ev.type === 'tool_end') {
              if (!['run_command'].includes(ev.name)) {
                const tool = [...events].reverse().find(e => e.type === 'tool' && e.name === ev.name && e.result === undefined)
                if (tool) { tool.result = ev.result; flush() }
              }
            }
            else if (ev.type === 'preview_started') {
              useStore.getState().setRightPanel('preview')
              useStore.getState().setPreview(true, ev.port)
              events.push({ type: 'text', content: `\n\n🖥️ **Live Preview** started! Check the Preview tab →` })
              flush()
            }
            else if (ev.type === 'error') {
              events.push({ type: 'text', content: `\n\n⚠️ **Error:** ${ev.error}` })
              flush()
            }
          } catch (e) {}
        }
      }

      // Finalize any remaining text
      if (textBuffer) {
        events.push({ type: 'text', content: textBuffer })
        textBuffer = ''
      }

      addMessage({ role: 'assistant', content: '', events: [...events] })
      setLiveEvents([])
      setCurrentText('')
      
      fetch('/api/files').then(r => r.json()).then(t => setFileTree(t)).catch(() => {})
    } catch (err) {
      if (err.name !== 'AbortError') {
        addMessage({ role: 'assistant', content: '', events: [{ type: 'text', content: `⚠️ Error: ${err.message}` }] })
        setLiveEvents([])
        setCurrentText('')
      }
    } finally {
      setStreaming(false)
    }
  }, [input, isStreaming])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className="flex-1 flex flex-col min-w-[380px] max-w-[55%]">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
              <Sparkles size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Arena Agent Mode</h2>
            <p className="text-arena-muted text-sm max-w-md mb-6">
              I build, test, and deliver. Watch me work in real-time — every command streams live to the terminal, every file appears in the editor.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {[
                { icon: '🌐', text: 'Build a full-stack web app' },
                { icon: '⚡', text: 'Create a REST API with tests' },
                { icon: '🎮', text: 'Make a browser game' },
                { icon: '📊', text: 'Build a data dashboard' },
              ].map((s, i) => (
                <button key={i} onClick={() => setInput(s.text)}
                  className="text-left text-xs px-3 py-3 bg-arena-surface border border-arena-border rounded-lg hover:bg-arena-hover hover:border-arena-accent/30 transition-all">
                  <span className="mr-1">{s.icon}</span><span className="text-arena-muted">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {isStreaming && (liveEvents.length > 0 || currentText) && <LiveMessage events={liveEvents} currentText={currentText} />}
            {isStreaming && liveEvents.length === 0 && !currentText && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="p-4 border-t border-arena-border bg-arena-surface">
        <div className="flex items-end gap-2 bg-arena-bg border border-arena-border rounded-xl px-3 py-2 focus-within:border-arena-accent/50 transition-colors">
          <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Tell the agent what to build..."
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-arena-muted min-h-[36px] max-h-[200px]"
            rows={1} disabled={isStreaming} />
          <button onClick={sendMessage} disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-arena-accent hover:bg-arena-accentHover disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0">
            <Send size={16} className="text-white" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-arena-muted">Streams live: chat • terminal • editor • preview</p>
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-[10px] text-arena-accent">
              <div className="w-1.5 h-1.5 bg-arena-accent rounded-full animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
