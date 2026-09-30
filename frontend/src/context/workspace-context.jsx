import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { workspaceApi } from '@/lib/workspace-api';

const WorkspaceContext = createContext(undefined);
// Only the selected workspace's id is remembered locally; everything else comes from the API.
const STORAGE_KEY = 'intellidoc-workspace-id';

function readStoredId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
}

// Keeps the preferred workspace if it still exists, otherwise falls back to the first one.
function resolveSelection(workspaces, preferredId) {
  return workspaces.find((w) => w.id === preferredId)?.id ?? workspaces[0]?.id ?? null;
}

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(readStoredId);
  const [loading, setLoading] = useState(isAuthenticated);
  const [error, setError] = useState(null);

  // Refs let the async loaders read the latest values without being re-created on every change.
  const selectedIdRef = useRef(selectedWorkspaceId);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const applySelection = useCallback((id) => {
    selectedIdRef.current = id;
    setSelectedWorkspaceId(id);
    storeId(id);
  }, []);

  // Fetches the workspace list. `selectId` forces a selection (e.g. a workspace that was just
  // created); otherwise the current selection is kept when it still exists. Rejects on failure.
  const loadWorkspaces = useCallback(
    async ({ selectId } = {}) => {
      const requestId = ++requestIdRef.current;
      const isLatest = () => requestId === requestIdRef.current;

      // Only show the blocking loading state on the first fetch; later refreshes update silently.
      if (!hasLoadedRef.current) setLoading(true);
      setError(null);

      try {
        const items = await workspaceApi.list();
        if (!isLatest()) return items;
        hasLoadedRef.current = true;
        setWorkspaces(items);
        applySelection(resolveSelection(items, selectId ?? selectedIdRef.current));
        return items;
      } catch (err) {
        if (isLatest()) setError(err);
        throw err;
      } finally {
        if (isLatest()) setLoading(false);
      }
    },
    [applySelection]
  );

  // Load workspaces once the user is signed in; clear everything when they sign out.
  useEffect(() => {
    if (!isAuthenticated) {
      requestIdRef.current += 1; // discard any in-flight response
      hasLoadedRef.current = false;
      setWorkspaces([]);
      setError(null);
      setLoading(false);
      return;
    }
    loadWorkspaces().catch(() => {
      // Failure is exposed through `error`; the workspace selector offers a retry.
    });
  }, [isAuthenticated, loadWorkspaces]);

  // Creates a workspace, refreshes the list from the API and selects the new workspace.
  // Rejects with a WorkspaceError when the create request fails.
  const createWorkspace = useCallback(
    async (name) => {
      const created = await workspaceApi.create(name.trim());

      try {
        await loadWorkspaces({ selectId: created.id });
      } catch {
        // The workspace exists server-side even though the refresh failed, so surface it locally
        // instead of reporting a failure for an operation that succeeded.
        hasLoadedRef.current = true;
        setError(null);
        setWorkspaces((prev) => [created, ...prev.filter((w) => w.id !== created.id)]);
        applySelection(created.id);
      }

      return created;
    },
    [applySelection, loadWorkspaces]
  );

  const value = useMemo(() => {
    const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
    return {
      workspaces,
      selectedWorkspace,
      selectedWorkspaceId: selectedWorkspace?.id ?? null,
      workspaceName: selectedWorkspace?.name ?? '',
      loading,
      error,
      selectWorkspace: applySelection,
      createWorkspace,
      refreshWorkspaces: loadWorkspaces,
    };
  }, [workspaces, selectedWorkspaceId, loading, error, applySelection, createWorkspace, loadWorkspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}
