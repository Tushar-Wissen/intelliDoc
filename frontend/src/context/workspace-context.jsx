import React, { createContext, useContext, useState } from 'react';

const WorkspaceContext = createContext(undefined);
const STORAGE_KEY = 'intellidoc-workspace-name';
const DEFAULT_NAME = 'My Workspace';

function readStoredName() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export function WorkspaceProvider({ children }) {
  const [workspaceName, setWorkspaceNameState] = useState(readStoredName);

  const setWorkspaceName = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    setWorkspaceNameState(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // ignore write failures (private browsing, storage full, etc.)
    }
  };

  return (
    <WorkspaceContext.Provider value={{ workspaceName, setWorkspaceName }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}
