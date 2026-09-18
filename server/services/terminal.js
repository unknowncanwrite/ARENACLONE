const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

// Try to load node-pty, fall back to basic shell
let pty = null;
try {
  pty = require('node-pty');
  console.log('✅ Using node-pty for terminal');
} catch (e) {
  console.log('⚠️  node-pty not available, using fallback terminal');
}

class FallbackTerminal extends EventEmitter {
  constructor(cwd) {
    super();
    this.cwd = cwd;
    this.proc = null;
    this._start();
  }

  _start() {
    const shell = process.env.SHELL || '/bin/bash';
    this.proc = spawn(shell, ['-i'], {
      cwd: this.cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout.on('data', (data) => {
      this.emit('data', data.toString());
    });

    this.proc.stderr.on('data', (data) => {
      this.emit('data', data.toString());
    });

    this.proc.on('exit', (code) => {
      this.emit('exit', { exitCode: code });
    });

    this.proc.on('error', (err) => {
      this.emit('data', `\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
    });
  }

  onData(cb) {
    this.on('data', cb);
  }

  onExit(cb) {
    this.on('exit', cb);
  }

  write(data) {
    if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(data);
    }
  }

  resize(cols, rows) {
    // Fallback doesn't support resize
  }

  kill() {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch (e) {}
    }
  }
}

class TerminalManager {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
    this.terminals = new Map();
  }

  create(id) {
    if (this.terminals.has(id)) {
      return this.terminals.get(id);
    }

    let term;
    if (pty) {
      const shell = process.env.SHELL || '/bin/bash';
      term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: this.workspaceDir,
        env: { ...process.env },
      });
    } else {
      term = new FallbackTerminal(this.workspaceDir);
    }

    this.terminals.set(id, term);

    term.onExit(() => {
      this.terminals.delete(id);
    });

    return term;
  }

  get(id) {
    return this.terminals.get(id);
  }

  kill(id) {
    const term = this.terminals.get(id);
    if (term) {
      term.kill();
      this.terminals.delete(id);
    }
  }

  killAll() {
    for (const [id, term] of this.terminals) {
      try { term.kill(); } catch (e) { /* ignore */ }
    }
    this.terminals.clear();
  }
}

module.exports = { TerminalManager };
