import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, Plus, UploadCloud, FileWarning, FileText, Loader2, Sparkles } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { TabsBar } from '@/components/layout/tabs-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderCard } from '@/components/features/folder-card';
import { FolderDetail } from '@/components/features/folder-detail';
import { UploadDialog } from '@/components/features/upload-dialog';
import { ToastNotification } from '@/components/ui/toast-notification';
import { CopilotSidebar } from '@/components/features/copilot-sidebar';
import { EmptyWorkspaceState } from '@/components/features/empty-workspace-state';

import { fetchDocumentFolders, invalidateDocumentFoldersCache } from '@/lib/documents-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useHealthStatus } from '@/hooks/use-health-status';

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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  const [activeFolder, setActiveFolder] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [chatHistories, setChatHistories] = useState({});

  const [folders, setFolders] = useState([]);
  const [foldersPage, setFoldersPage] = useState(1);
  const [foldersHasMore, setFoldersHasMore] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
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
        if (!cancelled) setFoldersHasMore(false);
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
  // when navigating here from the sidebar's quick folder/file list.
  useEffect(() => {
    const pendingFolderId = location.state?.folderId;
    if (!pendingFolderId) return;
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

  const handleSelectTab = useCallback((tabId) => {
    setActiveTabId(tabId);

    const tab = openTabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.type === 'folder') {
      const folderId = tabId.replace(/^folder:/, '');
      setActiveFolder((prev) => (prev?.id === folderId ? prev : folders.find((f) => f.id === folderId) ?? prev));
      setActiveFileId(null);
    } else {
      setActiveFileId(tabId);
      if (tab.folderId) {
        setActiveFolder((prev) => (prev?.id === tab.folderId ? prev : folders.find((f) => f.id === tab.folderId) ?? prev));
      }
    }
  }, [openTabs, folders]);

  const handleCloseTab = useCallback((tabId) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);

      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) return currentActive;
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)].id;
      });

      return next;
    });
    // Clear chat history so re-opening this tab starts a fresh session
    setChatHistories((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  }, []);

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
      tabsBar={
        activeFolder && openTabs.length > 0 && (
          <TabsBar
            tabs={openTabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onUploadClick={() => setUploadOpen(true)}
            onCopilotClick={() => setCopilotOpen((prev) => !prev)}
            copilotOpen={copilotOpen}
          />
        )
      }
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
            <div className={`flex items-center transition-all duration-300 ease-in-out gap-4 ${copilotOpen && (!!activeFolder || !!activeTabId) ? 'mr-80 sm:mr-96' : ''}`}>
              <Button id="upload-document-button" className="gap-2" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
                Upload
              </Button>
              {activeTabId && (
                <div
                  id="copilot-toggle-button"
                  onClick={() => setCopilotOpen(!copilotOpen)}
                  className="cursor-pointer flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
        )}

        {activeFolder ? (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className={`px-1 pb-1 transition-all duration-300 ease-in-out ${copilotOpen && (!!activeFolder || !!activeTabId) ? 'mr-80 sm:mr-96' : ''}`}>
              <FolderDetail
                folder={activeFolder}
                showStatus
                onFileClick={handleFileClick}
                activeFileId={activeFileId}
              />
            </div>
          </ScrollArea>
        ) : view === 'orphaned' ? (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className={`px-1 pb-1 transition-all duration-300 ease-in-out ${copilotOpen ? 'mr-80 sm:mr-96' : ''}`}>
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
            <div className={`px-1 pb-1 transition-all duration-300 ease-in-out ${copilotOpen && (!!activeFolder || !!activeTabId) ? 'mr-80 sm:mr-96' : ''}`}>
              {foldersLoading && folders.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : folders.length === 0 ? (
                <EmptyWorkspaceState
                  className="flex-1 justify-center px-4 py-16"
                  icon={FileText}
                  heading="Upload documents to get started"
                  description="Add documents to a folder, or keep them in Orphaned Files. You can ask questions, get insights and collaborate with your team."
                  ctaLabel="Upload Document"
                  ctaIcon={UploadCloud}
                  onCtaClick={() => setUploadOpen(true)}
                />
              ) : filteredFolders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                  No folders match &ldquo;{search}&rdquo;.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                    {filteredFolders.map((folder, idx) => (
                      <FolderCard
                        key={folder.id}
                        folder={folder}
                        index={idx}
                        selected={activeFolder?.id === folder.id}
                        showStatus
                        onClick={() => handleSelectFolder(folder)}
                      />
                    ))}
                  </div>

                  {!search && foldersHasMore && (
                    <div ref={foldersSentinelRef} className="flex h-10 items-center justify-center">
                      {foldersLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        apiBaseUrl={API_BASE_URL}
        onCreated={handleCreated}
        onShowToast={handleShowToast}
      />

      <CopilotSidebar
        open={copilotOpen && (!!activeFolder || !!activeTabId)}
        onOpenChange={setCopilotOpen}
        activeTabId={activeCopilotId}
        activeTabName={activeCopilotName}
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
