import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, Plus, UploadCloud, FileWarning, FileText, Loader2, FolderKanban, FolderOpen } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { FolderCard } from '@/components/features/folder-card';
import { FolderDetail } from '@/components/features/folder-detail';
import { UploadDialog } from '@/components/features/upload-dialog';
import { ToastNotification } from '@/components/ui/toast-notification';
import { CopilotSidebar } from '@/components/features/copilot-sidebar';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';
import { CreateFolderDialog } from '@/components/features/create-folder-dialog';
import { RecentDocumentsCard } from '@/components/features/recent-documents-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import {
  fetchDocumentFolders,
  invalidateDocumentFoldersCache,
  addFileToCachedDocument,
  updateCachedDocumentTitle,
  removeCachedDocument,
} from '@/lib/documents-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useHealthStatus } from '@/hooks/use-health-status';
import { useAuth } from '@/context/auth-context';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const FOLDERS_PAGE_SIZE = 12;
// Orphaned Files scans every file for zero-section ones, so it fetches a much larger page
// than the card grid ever needs.
const ORPHANED_SCAN_PAGE_SIZE = 200;

const VIEWS = {
  all: {
    title: 'My Workspace',
    subtitle: 'Browse folders and analyze documents with AI',
  },
  orphaned: {
    title: 'Orphaned Files',
    subtitle: "Files that haven't been indexed into any section yet",
  },
};

export function WorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') === 'orphaned' ? 'orphaned' : 'all';

  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const healthStatus = useHealthStatus();
  const { user } = useAuth();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadLockedFolderId, setUploadLockedFolderId] = useState(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);

  const [activeFolder, setActiveFolder] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [chatHistories, setChatHistories] = useState({});

  const [folders, setFolders] = useState([]);
  const [foldersPage, setFoldersPage] = useState(1);
  const [foldersHasMore, setFoldersHasMore] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState(null);
  const foldersViewRef = useRef(view);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(
    'We’ve got your file(s) and are working on them right now. Sit tight—the details will appear shortly.'
  );

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    let cancelled = false;
    foldersViewRef.current = view;
    setFolders([]);
    setFoldersPage(1);
    setFoldersHasMore(true);
    setFoldersLoading(true);
    setFoldersError(null);

    fetchDocumentFolders({
      apiBaseUrl: API_BASE_URL,
      page: 1,
      pageSize: view === 'orphaned' ? ORPHANED_SCAN_PAGE_SIZE : FOLDERS_PAGE_SIZE,
    })
      .then(({ items, hasMore }) => {
        if (cancelled) return;
        setFolders(items);
        setFoldersHasMore(hasMore);
      })
      .catch((err) => {
        console.error('Failed to fetch document folders', err);
        if (!cancelled) {
          setFoldersHasMore(false);
          setFoldersError(err?.message || 'We could not load your folders right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    setActiveFolder(null);
    setActiveFileId(null);
  }, [view]);

  const loadMoreFolders = useCallback(async () => {
    const requestView = view;
    setFoldersLoading(true);
    const nextPage = foldersPage + 1;
    try {
      const { items, hasMore } = await fetchDocumentFolders({
        apiBaseUrl: API_BASE_URL,
        page: nextPage,
        pageSize: requestView === 'orphaned' ? ORPHANED_SCAN_PAGE_SIZE : FOLDERS_PAGE_SIZE,
      });
      if (foldersViewRef.current !== requestView) return;
      setFolders((prev) => [...prev, ...items]);
      setFoldersPage(nextPage);
      setFoldersHasMore(hasMore);
    } catch (err) {
      console.error('Failed to fetch document folders', err);
      if (foldersViewRef.current === requestView) setFoldersHasMore(false);
    } finally {
      if (foldersViewRef.current === requestView) setFoldersLoading(false);
    }
  }, [foldersPage, view]);

  const refreshFolders = useCallback(async () => {
    const requestView = view;
    invalidateDocumentFoldersCache();
    setFoldersLoading(true);
    try {
      const { items, hasMore } = await fetchDocumentFolders({
        apiBaseUrl: API_BASE_URL,
        page: 1,
        pageSize: requestView === 'orphaned' ? ORPHANED_SCAN_PAGE_SIZE : FOLDERS_PAGE_SIZE,
      });
      if (foldersViewRef.current !== requestView) return;
      setFolders(items);
      setFoldersPage(1);
      setFoldersHasMore(hasMore);
    } catch (err) {
      console.error('Failed to refresh document folders', err);
    } finally {
      if (foldersViewRef.current === requestView) setFoldersLoading(false);
    }
  }, [view]);

  const foldersSentinelRef = useInfiniteScroll({
    hasMore: foldersHasMore,
    loading: foldersLoading,
    onLoadMore: loadMoreFolders,
  });

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/documents`);
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  const handleShowToast = (msg) => {
    setToastMessage(msg || 'We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.');
    setToastOpen(true);
  };

  const handleCreated = (newItems) => {
    const items = Array.isArray(newItems) ? newItems : [newItems];
    setDocuments((prev) => [...items, ...prev]);
    refreshFolders();
  };

  const handleFolderSaved = (folder, isEdit) => {
    if (!folder?.name) return;

    if (isEdit) {
      updateCachedDocumentTitle(folder.id, folder.name);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, ...folder } : f)));
      setActiveFolder((prev) => (prev?.id === folder.id ? { ...prev, ...folder } : prev));
      return;
    }

    setFolders((prev) => [
      {
        ...folder,
        files: folder.files || [],
        filesCount: Number(folder.filesCount || 0),
      },
      ...prev,
    ]);
    setFoldersHasMore(true);
  };

  const handleEditFolder = (folder) => {
    setEditingFolder(folder);
    setCreateFolderOpen(true);
  };

  const handleDeleteFolder = (folder) => {
    setDeletingFolder(folder);
  };

  const handleConfirmDeleteFolder = () => {
    if (!deletingFolder) return;
    const folderId = deletingFolder.id;

    removeCachedDocument(folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setActiveFolder((prev) => (prev?.id === folderId ? null : prev));
    setOpenTabs((prev) => prev.filter((t) => t.id !== `folder:${folderId}`));
    setDeletingFolder(null);
  };

  const handleFileAddedToFolder = (folderId, file) => {
    addFileToCachedDocument(folderId, file.name);
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId
          ? { ...folder, files: [...(folder.files || []), file], filesCount: (folder.filesCount || 0) + 1 }
          : folder
      )
    );
    setActiveFolder((prev) =>
      prev?.id === folderId
        ? { ...prev, files: [...(prev.files || []), file], filesCount: (prev.filesCount || 0) + 1 }
        : prev
    );
  };

  const handleSelectFolder = (folder) => {
    setActiveFolder(folder);
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
      setActiveFolder(null);
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
      setActiveFolder((prev) => {
        if (prev?.id === fileData.folderId) return prev;
        return folders.find((f) => f.id === fileData.folderId) ?? prev;
      });
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

  const handleUpdateChatHistory = useCallback((key, messages) => {
    setChatHistories((prev) => ({ ...prev, [key]: messages }));
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
        icon: FolderKanban,
      },
      {
        label: 'Files',
        value: String(totalFilesCount),
        detail: 'Across all folders',
        icon: FileText,
      },
      {
        label: 'Owner',
        value: user?.fullName || 'You',
        detail: 'Workspace admin',
        icon: FolderOpen,
      },
    ],
    [folders, totalFilesCount, user]
  );

  // IntelliDoc AI's chat panel is always visible; its subtitle/placeholder switch between
  // workspace-wide and single-folder context depending on whether a folder is open.
  const copilotSubtitle = activeFolder
    ? 'Searching across documents in this folder'
    : `Searching across ${totalFilesCount} ${totalFilesCount === 1 ? 'document' : 'documents'}`;
  const copilotPlaceholder = activeFolder
    ? 'Ask IntelliDoc AI about your folder...'
    : 'Ask IntelliDoc AI about your workspace...';

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

  // Files that uploaded successfully but have no extracted sections yet.
  const orphanedFiles = useMemo(() => {
    if (view !== 'orphaned') return [];
    const flattened = [];
    folders.forEach((folder) => {
      (folder.files || []).forEach((file) => {
        if (!file.sections || file.sections.length === 0) {
          flattened.push({ ...file, folderId: folder.id, folderName: folder.name });
        }
      });
    });
    return flattened;
  }, [folders, view]);

  const { title, subtitle } = VIEWS[view];

  return (
    <AppShell
      title={activeFolder ? activeFolder.name : title}
      subtitle={activeFolder ? undefined : subtitle}
      healthStatus={healthStatus}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        {!activeFolder && !(view === 'all' && !foldersLoading && folders.length === 0) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {view === 'all' ? (
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="folder-search-input"
                  placeholder="Filter folders..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3 mr-80 sm:mr-96">
              <Button
                id="create-folder-button"
                data-testid="create-folder-button"
                variant="default"
                className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
                onClick={() => setCreateFolderOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Create Folder
              </Button>
              <Button
                id="upload-document-button"
                data-testid="upload-document-button"
                className="gap-2"
                onClick={() => {
                  setUploadLockedFolderId(null);
                  setUploadOpen(true);
                }}
              >
                <UploadCloud className="h-4 w-4" />
                Upload
              </Button>
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
                onUploadClick={() => {
                  setUploadLockedFolderId(activeFolder.id);
                  setUploadOpen(true);
                }}
              />
            </div>
          </ScrollArea>
        ) : view === 'orphaned' ? (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className="px-1 pb-1 mr-80 sm:mr-96">
              {foldersLoading && folders.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : orphanedFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
                  <FileWarning className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium text-muted-foreground">No orphaned files</p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Every uploaded file has been indexed into at least one section.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                  {orphanedFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => handleFileClick(file)}
                      className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                        <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-card-foreground">{file.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{file.folderName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Not indexed
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className="px-1 pb-1 mr-80 sm:mr-96">
              {foldersLoading && folders.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
                  ))}
                </div>
              ) : foldersError && folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-foreground">Unable to load folders</p>
                    <p className="max-w-md text-sm text-muted-foreground">{foldersError}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => refreshFolders()}
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
                  onCtaClick={() => setCreateFolderOpen(true)}
                />
              ) : filteredFolders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                  No folders match &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <>
                  <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border bg-gradient-to-r from-wissen-navy/5 via-card to-primary/5 p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Workspace Overview
                      </p>
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground">My Workspace</h2>
                    </div>

                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                      {workspaceSummary.map(({ label, value, detail, icon: Icon }) => (
                        <Card key={label} className="border-border bg-muted/20 shadow-none">
                          <CardContent className="flex items-center justify-between gap-3 p-4">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                {label}
                              </p>
                              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
                              <Icon className="h-4 w-4" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {!search && <RecentDocumentsCard loading={false} files={recentFiles} onOpenFile={handleFileClick} />}

                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredFolders.map((folder, idx) => (
                      <FolderCard
                        key={folder.id}
                        folder={folder}
                        index={idx}
                        selected={activeFolder?.id === folder.id}
                        createdBy={user?.fullName || 'You'}
                        onClick={() => handleSelectFolder(folder)}
                        onEdit={handleEditFolder}
                        onDelete={handleDeleteFolder}
                      />
                    ))}
                  </div>

                  {!search && foldersHasMore && (
                    <div ref={foldersSentinelRef} className="flex h-12 items-center justify-center">
                      {foldersLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={(next) => {
          setCreateFolderOpen(next);
          if (!next) setEditingFolder(null);
        }}
        folder={editingFolder}
        onCreated={handleFolderSaved}
      />

      <ConfirmDialog
        open={Boolean(deletingFolder)}
        onOpenChange={(next) => { if (!next) setDeletingFolder(null); }}
        title="Delete folder?"
        description={deletingFolder ? `Delete "${deletingFolder.name}"? This can't be undone.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDeleteFolder}
      />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        apiBaseUrl={API_BASE_URL}
        folders={folders}
        onCreated={handleCreated}
        onAddToFolder={handleFileAddedToFolder}
        onShowToast={handleShowToast}
        lockedFolderId={uploadLockedFolderId}
      />

      <CopilotSidebar
        activeTabId={activeCopilotId}
        activeTabName={activeCopilotName}
        subtitle={copilotSubtitle}
        placeholder={copilotPlaceholder}
        chatHistories={chatHistories}
        onUpdateHistory={handleUpdateChatHistory}
      />

      <ToastNotification
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        message={toastMessage}
      />
    </AppShell>
  );
}
