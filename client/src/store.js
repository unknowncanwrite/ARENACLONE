import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Chat
  messages: [],
  isStreaming: false,
  
  // Editor
  openFiles: [],
  activeFile: null,
  fileContents: {},
  
  // File Explorer
  fileTree: [],
  expandedDirs: new Set(),
  
  // UI State
  terminalOpen: true,
  sidebarOpen: true,
  
  // Actions
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg]
  })),
  
  setStreaming: (val) => set({ isStreaming: val }),
  
  setFileTree: (tree) => set({ fileTree: tree }),
  
  toggleDir: (path) => set((state) => {
    const newExpanded = new Set(state.expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    return { expandedDirs: newExpanded };
  }),
  
  openFile: (path, content) => set((state) => {
    const existing = state.openFiles.find(f => f === path);
    if (!existing) {
      return {
        openFiles: [...state.openFiles, path],
        activeFile: path,
        fileContents: { ...state.fileContents, [path]: content }
      };
    }
    return {
      activeFile: path,
      fileContents: { ...state.fileContents, [path]: content }
    };
  }),
  
  closeFile: (path) => set((state) => {
    const newOpen = state.openFiles.filter(f => f !== path);
    return {
      openFiles: newOpen,
      activeFile: newOpen.length > 0 ? newOpen[newOpen.length - 1] : null,
    };
  }),
  
  updateFileContent: (path, content) => set((state) => ({
    fileContents: { ...state.fileContents, [path]: content }
  })),
  
  setTerminalOpen: (val) => set({ terminalOpen: val }),
  setSidebarOpen: (val) => set({ sidebarOpen: val }),
  
  clearMessages: () => set({ messages: [], isStreaming: false }),
}))
