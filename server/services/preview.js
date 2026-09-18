const { spawn } = require('child_process');
const treeKill = require('tree-kill');

class PreviewManager {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
    this.process = null;
    this.port = null;
    this.onOutput = null;
  }

  start(port, command, onOutput) {
    // Kill existing preview process
    this.stop();

    this.port = port;
    this.onOutput = onOutput;

    const proc = spawn('bash', ['-c', command], {
      cwd: this.workspaceDir,
      env: { ...process.env, PORT: String(port), HOST: '0.0.0.0' },
    });

    this.process = proc;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      console.log(`[preview:${port}] ${text.trim()}`);
      if (this.onOutput) this.onOutput(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      console.log(`[preview:${port}:err] ${text.trim()}`);
      if (this.onOutput) this.onOutput(text);
    });

    proc.on('exit', (code) => {
      console.log(`[preview:${port}] exited with code ${code}`);
      this.process = null;
      this.port = null;
    });

    proc.on('error', (err) => {
      console.error(`[preview:${port}] error:`, err.message);
    });

    return { port, pid: proc.pid };
  }

  stop() {
    if (this.process) {
      try {
        // Kill the entire process tree
        if (this.process.pid) {
          try { treeKill(this.process.pid, 'SIGTERM'); } catch (e) {}
        }
        this.process.kill('SIGTERM');
        setTimeout(() => {
          if (this.process) {
            try { this.process.kill('SIGKILL'); } catch (e) {}
          }
        }, 3000);
      } catch (e) {}
      this.process = null;
      this.port = null;
    }
  }

  getStatus() {
    return {
      running: !!this.process,
      port: this.port,
      pid: this.process?.pid || null,
    };
  }
}

module.exports = { PreviewManager };
