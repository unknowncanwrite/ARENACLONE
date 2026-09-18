const fs = require('fs');
const path = require('path');

class FileManager {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
  }

  resolvePath(relativePath) {
    const resolved = path.resolve(this.workspaceDir, relativePath);
    // Security: ensure path is within workspace
    if (!resolved.startsWith(this.workspaceDir)) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }

  readFile(relativePath) {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeFile(relativePath, content) {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  deleteFile(relativePath) {
    const fullPath = this.resolvePath(relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }

  renameFile(oldPath, newPath) {
    const fullOld = this.resolvePath(oldPath);
    const fullNew = this.resolvePath(newPath);
    const dir = path.dirname(fullNew);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.renameSync(fullOld, fullNew);
  }

  listDir(relativePath) {
    const fullPath = this.resolvePath(relativePath || '.');
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory not found: ${relativePath}`);
    }
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => {
        const entryPath = path.join(fullPath, e.name);
        try {
          const stat = fs.statSync(entryPath);
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        } catch {
          return { name: e.name, type: 'unknown' };
        }
      })
      .sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
    
    return JSON.stringify(result, null, 2);
  }

  getTree(dirPath = '', depth = 0) {
    if (depth > 4) return [];
    const fullPath = this.resolvePath(dirPath || '.');
    if (!fs.existsSync(fullPath)) return [];

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      const relPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
      const item = {
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? 'directory' : 'file',
      };

      if (entry.isDirectory()) {
        item.children = this.getTree(relPath, depth + 1);
      }

      result.push(item);
    }

    return result.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }
}

module.exports = { FileManager };
