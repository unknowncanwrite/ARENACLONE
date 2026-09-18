import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Chat
  messages: [],
  isStreaming: false,
  currentResponse: '',
  toolCalls: [],
  
  // Editor
  openFiles: [],
  activeFile: null,
  fileContents: {},
  
  // File Explorer
  fileTree: [],
  expandedDirs: new Set(),
  
  // UI State
  activePanel: 'chat',
  terminalOpen: true,
  sidebarOpen: true,
  
  // Actions
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg]
  })),
  
  updateCurrentResponse: (text) => set((state) => ({
    currentResponse: state.currentResponse + text
  })),
  
  finalizeResponse: () => set((state) => ({
    messages: [...state.messages, { role: 'assistant', content: state.currentResponse, toolCalls: state.toolCalls }],
    currentResponse: '',
    toolCalls: [],
    isStreaming: false,
  })),
  
  setStreaming: (val) => set({ isStreaming: val }),
  
  addToolCall: (tool) => set((state) => ({
    toolCalls: [...state.toolCalls, tool]
  })),
  
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
  setActivePanel: (panel) => set({ activePanel: panel }),
  
  clearMessages: () => set({ messages: [], currentResponse: '', toolCalls: [], isStreaming: false }),
}))
