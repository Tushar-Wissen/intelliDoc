import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useWorkspace } from '@/context/workspace-context';
import { modulesApi } from '@/lib/modules-api';

const FolderContext = createContext(undefined);

// Single source of truth for the selected workspace's folders (backend "modules"), shared by
// the sidebar, dashboard, workspace page and dialogs so they all update together.
//
// Every folder operation (list, create, rename, delete) goes through the API, and the API
// response is the source of truth for what is shown.
export function FolderProvider({ children }) {
  const { selectedWorkspaceId, loading: workspacesLoading } = useWorkspace();

  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(Boolean(selectedWorkspaceId));
  const [error, setError] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);

  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);

  // Fetches the folder list for the selected workspace. Rejects on failure.
  const loadFolders = useCallback(async () => {
    if (!selectedWorkspaceId) return [];

    const requestId = ++requestIdRef.current;
    const isLatest = () => requestId === requestIdRef.current;

    // Only show the blocking loading state on the first fetch; later refreshes update silently.
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);

    try {
      const items = await modulesApi.list(selectedWorkspaceId);
      if (!isLatest()) return items;
      hasLoadedRef.current = true;
      setFolders(items);
      return items;
    } catch (err) {
      if (isLatest()) setError(err);
      throw err;
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [selectedWorkspaceId]);

  // Reload whenever the selected workspace changes; folders never carry across workspaces.
  useEffect(() => {
    requestIdRef.current += 1; // discard any in-flight response for the previous workspace
    hasLoadedRef.current = false;
    setFolders([]);
    setSelectedFolderId(null);
    setError(null);

    if (!selectedWorkspaceId) {
      setLoading(false);
      return;
    }
    loadFolders().catch(() => {
      // Failure is exposed through `error`; consumers offer a retry.
    });
  }, [selectedWorkspaceId, loadFolders]);

  // Creates a folder in the selected workspace, then refreshes the list from the API.
  // Rejects with an ApiError when the request fails.
  const createFolder = useCallback(
    async (name) => {
      if (!selectedWorkspaceId) throw new Error('Select a workspace before creating a folder.');

      const created = await modulesApi.create(selectedWorkspaceId, name.trim());

      try {
        await loadFolders();
      } catch {
        // The folder exists server-side even though the refresh failed, so surface it locally
        // instead of reporting a failure for an operation that succeeded.
        hasLoadedRef.current = true;
        setError(null);
        setFolders((prev) => [created, ...prev.filter((f) => f.id !== created.id)]);
      }

      return created;
    },
    [selectedWorkspaceId, loadFolders]
  );

  // Renames a folder via the API and applies the response to state, so the sidebar, page
  // header and cards all pick up the server's name. Selection is by id, so it is unaffected.
  // Rejects with an ApiError when the request fails.
  const renameFolder = useCallback(async (folderId, name) => {
    const updated = await modulesApi.rename(folderId, name.trim());
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: updated.name, workspaceId: updated.workspaceId } : f))
    );
    return updated;
  }, []);

  // Deletes a folder via the API, drops it from state right away and re-syncs the list.
  // Rejects with an ApiError when the request fails (state is left untouched in that case).
  const deleteFolder = useCallback(
    async (folderId) => {
      await modulesApi.remove(folderId);

      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setSelectedFolderId((prev) => (prev === folderId ? null : prev));

      // The folder is gone server-side, so a failed refresh must not turn into a delete error;
      // the list already reflects the deletion.
      loadFolders().catch(() => {});
    },
    [loadFolders]
  );

  const value = useMemo(
    () => ({
      folders,
      loading: workspacesLoading || loading,
      error,
      selectedFolderId,
      selectFolder: setSelectedFolderId,
      createFolder,
      renameFolder,
      refreshFolders: loadFolders,
      deleteFolder,
    }),
    [
      folders,
      workspacesLoading,
      loading,
      error,
      selectedFolderId,
      createFolder,
      renameFolder,
      loadFolders,
      deleteFolder,
    ]
  );

  return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>;
}

export function useFolders() {
  const ctx = useContext(FolderContext);
  if (!ctx) throw new Error('useFolders must be used within a FolderProvider');
  return ctx;
}
