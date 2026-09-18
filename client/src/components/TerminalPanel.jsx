import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useStore } from '../store'

export default function TerminalPanel() {
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)
  const containerRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#0a0a0f',
        foreground: '#e4e4e7',
        cursor: '#6366f1',
        selectionBackground: '#6366f140',
        black: '#1e1e2e',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa',
      },
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Connect WebSocket
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}/ws?type=terminal`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // Send initial size
      ws.send(JSON.stringify({
        type: 'terminal:resize',
        cols: term.cols,
        rows: term.rows,
      }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'terminal:data') {
          term.write(msg.data)
        } else if (msg.type === 'terminal:exit') {
          term.write(`\r\n\x1b[31mProcess exited with code ${msg.exitCode}\x1b[0m\r\n`)
        }
      } catch (err) {
        console.error('WS parse error', err)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      term.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n')
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:input', data }))
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:resize', cols, rows }))
      }
    })

    // Fit on resize
    const observer = new ResizeObserver(() => {
      try { fitAddon.fit() } catch (e) {}
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      ws.close()
      term.dispose()
      termRef.current = null
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-arena-border bg-arena-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-arena-muted" />
          <span className="text-xs font-medium text-arena-muted">Terminal</span>
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-arena-green' : 'bg-arena-red'}`} />
        </div>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  )
}
