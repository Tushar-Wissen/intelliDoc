import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, UploadCloud, FileText, FolderOpen } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FolderCard } from '@/components/features/folder-card';
import { FolderDetail } from '@/components/features/folder-detail';
import { UploadDialog } from '@/components/features/upload-dialog';
import { CopilotSidebar } from '@/components/features/copilot-sidebar';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';
import { CreateFolderDialog } from '@/components/features/create-folder-dialog';
import { RenameFolderDialog } from '@/components/features/rename-folder-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { WorkspaceRequiredAction } from '@/components/features/workspace-required-action';

import { useHealthStatus } from '@/hooks/use-health-status';
import { useDocumentProcessingStatus } from '@/hooks/use-document-processing-status';
import { CHAT_SCOPE_TYPES } from '@/lib/chat-api';
import { useAuth } from '@/context/auth-context';
import { useWorkspace } from '@/context/workspace-context';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';

const SUBTITLE = 'Browse folders and analyze documents with AI';

export function WorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const healthStatus = useHealthStatus();
  const { user } = useAuth();
  const toast = useToast();
  const { workspaceName, selectedWorkspaceId } = useWorkspace();
  const {
    folders,
    loading: foldersLoading,
    error: foldersError,
    selectFolder,
    selectFile,
    refreshFolders,
    deleteFolder,
  } = useFolders();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Only the id is stored; the folder itself is looked up so it always reflects the shared list.
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [chatHistories, setChatHistories] = useState({});

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) ?? null,
    [folders, activeFolderId]
  );

  // Tabs and the open folder belong to a workspace, so start fresh when it changes.
  useEffect(() => {
    setActiveFolderId(null);
    setActiveFileId(null);
    setOpenTabs([]);
    setActiveTabId(null);
    setChatHistories({});
  }, [selectedWorkspaceId]);

  // Mirror the open folder into the shared folder state so the sidebar can highlight it.
  useEffect(() => {
    selectFolder(activeFolderId);
  }, [activeFolderId, selectFolder]);
  useEffect(() => () => selectFolder(null), [selectFolder]);

  // Likewise for the open file, so the sidebar highlights it.
  useEffect(() => {
    selectFile(activeFileId);
  }, [activeFileId, selectFile]);
  useEffect(() => () => selectFile(null), [selectFile]);

  // The shared folder list is already updated by the time this runs, so the sidebar, cards and
  // the page title (all derived from it) show the new name. Open tabs keep their own copy of
  // the name, so refresh those, and the active folder simply stays selected by id.
  const handleFolderRenamed = (folder) => {
    setOpenTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === `folder:${folder.id}`) return { ...tab, name: folder.name };
        if (tab.folderId === folder.id) return { ...tab, folderName: folder.name };
        return tab;
      })
    );
  };

  const handleDeleteFolder = (folder) => {
    setDeletingFolder(folder);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder || deleting) return;
    const { id: folderId, name } = deletingFolder;

    setDeleting(true);
    try {
      // Deletes via the API, then the shared folder list (sidebar, cards) updates itself.
      await deleteFolder(folderId);

      // If the deleted folder was open, clear it and fall back to the workspace-level view.
      if (activeFolderId === folderId) {
        setActiveFolderId(null);
        setActiveFileId(null);
        navigate('/workspace', { replace: true, state: { clearFolder: true } });
      }
      setOpenTabs((prev) => prev.filter((t) => t.id !== `folder:${folderId}` && t.folderId !== folderId));
      setActiveTabId((prev) => (prev === `folder:${folderId}` ? null : prev));

      toast.success('Folder deleted', `"${name}" was deleted.`);
      setDeleting(false);
      setDeletingFolder(null);
    } catch (err) {
      // Keep the dialog open so the user can retry or cancel.
      toast.error('Could not delete folder', err?.message || 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  const handleSelectFolder = (folder) => {
    setActiveFolderId(folder.id);
    setActiveFileId(null);

    const tabId = `folder:${folder.id}`;
    setOpenTabs((prev) => {
      if (prev.some((tab) => tab.id === tabId)) return prev;
      return [
        ...prev,
        {
          id: tabId,
          name: folder.name,
          type: 'folder',
          pinned: true,
        },
      ];
    });
    setActiveTabId(tabId);
  };

  // Opens a folder (and optionally a specific file within it) passed in via router state
  // when navigating here from the sidebar's quick folder/file list. The sidebar's "My
  // Workspace" link also uses this to reliably clear the active folder even when it's
  // navigating to the same /workspace path (which wouldn't otherwise reset local state).
  useEffect(() => {
    const pendingFolderId = location.state?.folderId;
    if (pendingFolderId) {
      const folder = folders.find((f) => f.id === pendingFolderId);
      if (folder) {
        handleSelectFolder(folder);
        const pendingFileId = location.state?.fileId;
        const file = pendingFileId ? folder.files?.find((f) => f.id === pendingFileId) : null;
        if (file) {
          handleFileClick({ ...file, folderId: folder.id, folderName: folder.name });
        }
        navigate(location.pathname + location.search, { replace: true, state: {} });
      }
      return;
    }

    if (location.state?.clearFolder) {
      setActiveFolderId(null);
      setActiveFileId(null);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, folders]);

  /* ─── Tab management ─── */
  const handleFileClick = useCallback((fileData) => {
    const tabId = fileData.id;
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [
        ...prev,
        {
          id: tabId,
          name: fileData.name,
          tag: fileData.tag,
          hasUpdates: fileData.hasUpdates,
          folderId: fileData.folderId,
          folderName: fileData.folderName,
        },
      ];
    });
    setActiveTabId(tabId);
    setActiveFileId(fileData.id);
    if (fileData.folderId) {
      setActiveFolderId((prev) => (folders.some((f) => f.id === fileData.folderId) ? fileData.folderId : prev));
    }
  }, [folders]);

  const activeTabName = openTabs.find((t) => t.id === activeTabId)?.name;

  // Unified copilot context: active tab takes priority; falls back to active folder
  const activeCopilotId = activeTabId
    ? `tab-${activeTabId}`
    : activeFolder
      ? `folder-${activeFolder.id}`
      : null;
  const activeCopilotName = activeTabId ? activeTabName : activeFolder?.name ?? null;

  // Documents the copilot answers from: the open file, else the open folder, else the whole workspace.
  // File tabs are keyed by document id; folder tabs by `folder:<id>`.
  const activeDocumentId = activeTabId && !activeTabId.startsWith('folder:') ? activeTabId : null;
  // Document-level chat stays locked until this document is READY; polled so it unlocks on its own.
  const activeDocumentStatus = useDocumentProcessingStatus(activeDocumentId);

  const activeScopeFolderId = activeDocumentId
    ? null
    : activeTabId
      ? activeTabId.slice('folder:'.length)
      : activeFolder?.id ?? null;

  const copilotScope = useMemo(() => {
    if (activeDocumentId) return { type: 'DOCUMENTS', documentIds: [activeDocumentId] };
    return activeScopeFolderId ? { type: 'MODULE', moduleId: activeScopeFolderId } : { type: 'WORKSPACE' };
  }, [activeDocumentId, activeScopeFolderId]);

  // Same context, addressed the way the chat-history API expects: the id of the document,
  // folder or workspace itself, tagged with its scope type.
  const copilotHistoryScope = useMemo(() => {
    if (activeDocumentId) return { scopeType: CHAT_SCOPE_TYPES.DOCUMENT, scopeId: activeDocumentId };
    if (activeScopeFolderId) return { scopeType: CHAT_SCOPE_TYPES.FOLDER, scopeId: activeScopeFolderId };
    return { scopeType: CHAT_SCOPE_TYPES.WORKSPACE, scopeId: selectedWorkspaceId };
  }, [activeDocumentId, activeScopeFolderId, selectedWorkspaceId]);

  // `messages` may be an updater function so streamed tokens always build on the latest history.
  const handleUpdateChatHistory = useCallback((key, messages) => {
    setChatHistories((prev) => ({
      ...prev,
      [key]: typeof messages === 'function' ? messages(prev[key] ?? []) : messages,
    }));
  }, []);

  const filteredFolders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter((folder) => folder.name?.toLowerCase().includes(query));
  }, [folders, search]);

  const totalFilesCount = useMemo(
    () => folders.reduce((sum, folder) => sum + (folder.filesCount || 0), 0),
    [folders]
  );

  const workspaceSummary = useMemo(
    () => [
      {
        label: 'Total folders',
        value: String(folders.length),
        detail: folders.length > 0 ? `${totalFilesCount} files across workspace` : 'Create your first folder',
      },
      {
        label: 'Files',
        value: String(totalFilesCount),
        detail: 'Across all folders',
      },
    ],
    [folders, totalFilesCount]
  );

  const ownerName = user?.fullName || 'You';
  const ownerInitials =
    ownerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'Y';

  // DocuMind AI's chat panel is always visible; its subtitle/placeholder switch between
  // workspace-wide, single-folder and single-document context depending on what is open.
  const copilotSubtitle = activeFileId
    ? 'Answering from this document'
    : activeFolder
      ? 'Searching across documents in this folder'
      : `Searching across ${totalFilesCount} ${totalFilesCount === 1 ? 'document' : 'documents'}`;
  const copilotPlaceholder = activeFileId
    ? 'Ask DocuMind AI about this document...'
    : activeFolder
      ? 'Ask DocuMind AI about your folder...'
      : 'Ask DocuMind AI about your workspace...';

  const recentFiles = useMemo(() => {
    const flattened = [];
    folders.forEach((folder) => {
      (folder.files || []).forEach((file) => {
        flattened.push({ ...file, folderId: folder.id, folderName: folder.name, date: folder.updatedAt });
      });
    });
    return flattened
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
  }, [folders]);

  // The page is titled with the selected workspace's name.
  const title = workspaceName || 'Workspace';

  return (
    <AppShell
      title={activeFolder ? activeFolder.name : title}
      subtitle={activeFolder ? undefined : SUBTITLE}
      healthStatus={healthStatus}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        {!activeFolder && !(!foldersLoading && folders.length === 0) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="folder-search-input"
                placeholder="Filter folders..."
                className="bg-card pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 mr-80 sm:mr-96" data-tour="workspace-actions">
              <WorkspaceRequiredAction disabled={!selectedWorkspaceId}>
                <Button
                  id="create-folder-button"
                  data-testid="create-folder-button"
                  variant="outline"
                  className="gap-2 bg-card font-semibold"
                  disabled={!selectedWorkspaceId}
                  onClick={() => setCreateFolderOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create Folder
                </Button>
              </WorkspaceRequiredAction>
              <WorkspaceRequiredAction disabled={!selectedWorkspaceId}>
                <Button
                  id="document-upload-button"
                  data-testid="document-upload-button"
                  className="gap-2 bg-wissen-navy font-semibold text-white hover:bg-wissen-navy/90"
                  disabled={!selectedWorkspaceId}
                  onClick={() => setUploadOpen(true)}
                >
                  <UploadCloud className="h-4 w-4" />
                  Upload
                </Button>
              </WorkspaceRequiredAction>
            </div>
          </div>
        )}

        {activeFolder ? (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className="px-1 pb-1 mr-80 sm:mr-96">
              <FolderDetail
                folder={activeFolder}
                onFileClick={handleFileClick}
                activeFileId={activeFileId}
                uploadDisabled={!selectedWorkspaceId}
                onUploadClick={() => setUploadOpen(true)}
              />
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className="px-1 pb-1 mr-80 sm:mr-96">
              {foldersLoading && folders.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="h-36 animate-pulse rounded-xl border border-border bg-muted/40" />
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="h-12 animate-pulse rounded-lg border border-border bg-muted/40" />
                  ))}
                </div>
              ) : foldersError && folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-foreground">Unable to load folders</p>
                    <p className="max-w-md text-sm text-muted-foreground">{foldersError.message}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => refreshFolders().catch(() => {})}
                    data-testid="workspace-retry-folder-load"
                  >
                    Try again
                  </Button>
                </div>
              ) : folders.length === 0 ? (
                <EmptyWorkspaceState
                  className="flex-1 justify-center px-4 py-16"
                  icon={FileText}
                  heading="Your folders are empty"
                  description="Create your first folder to keep related documents organized and ready for AI-powered review."
                  ctaLabel="Create Folder"
                  ctaIcon={Plus}
                  ctaDisabled={!selectedWorkspaceId}
                  onCtaClick={() => setCreateFolderOpen(true)}
                />
              ) : filteredFolders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                  No folders match &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <>
                  {/* Overview strip: folder/file counts and the owner in one card, split by dividers. */}
                  <div
                    data-testid="workspace-overview"
                    className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0"
                  >
                    {workspaceSummary.map(({ label, value, detail }) => (
                      <div key={label} className="min-w-0 px-5 py-5 xl:px-6">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                      </div>
                    ))}

                    <div className="min-w-0 px-5 py-5 xl:px-6">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Owner
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wissen-navy text-xs font-semibold text-white">
                          {ownerInitials}
                        </span>
                        <span
                          className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-snug text-foreground xl:text-base"
                          title={ownerName}
                        >
                          {ownerName}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">Workspace admin</p>
                    </div>
                  </div>

                  <div className="mb-2 mt-5 flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Folders</h3>
                    <span className="text-xs font-medium text-muted-foreground">{filteredFolders.length}</span>
                  </div>

                  <TooltipProvider delayDuration={200}>
                    <div className="flex flex-col gap-2" data-tour="folder-list">
                      {filteredFolders.map((folder) => (
                        <FolderCard
                          key={folder.id}
                          folder={folder}
                          selected={activeFolder?.id === folder.id}
                          createdBy={user?.fullName || 'You'}
                          onClick={() => handleSelectFolder(folder)}
                          onRename={setRenamingFolder}
                          onDelete={handleDeleteFolder}
                        />
                      ))}
                    </div>
                  </TooltipProvider>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <CreateFolderDialog open={createFolderOpen} onOpenChange={setCreateFolderOpen} />

      <RenameFolderDialog
        open={Boolean(renamingFolder)}
        onOpenChange={(next) => { if (!next) setRenamingFolder(null); }}
        folder={renamingFolder}
        onRenamed={handleFolderRenamed}
      />

      <ConfirmDialog
        open={Boolean(deletingFolder)}
        onOpenChange={(next) => { if (!next) setDeletingFolder(null); }}
        title="Delete folder?"
        description={deletingFolder ? `Delete "${deletingFolder.name}"? This can't be undone.` : ''}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        testIdPrefix="delete-folder"
        onConfirm={handleConfirmDeleteFolder}
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultFolderId={activeFolderId} />

      <CopilotSidebar
        activeTabId={activeCopilotId}
        activeTabName={activeCopilotName}
        subtitle={copilotSubtitle}
        placeholder={copilotPlaceholder}
        chatHistories={chatHistories}
        onUpdateHistory={handleUpdateChatHistory}
        workspaceId={selectedWorkspaceId}
        scope={copilotScope}
        historyScope={copilotHistoryScope}
        disabled={!foldersLoading && folders.length === 0}
        documentStatus={activeDocumentStatus}
      />
    </AppShell>
  );
}
