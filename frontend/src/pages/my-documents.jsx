import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, Plus, FolderOpen, BadgeCheck, Loader2, Sparkles } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { FolderPanel } from '@/components/layout/folder-panel';
import { TabsBar } from '@/components/layout/tabs-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderCard } from '@/components/features/folder-card';
import { FolderDetail } from '@/components/features/folder-detail';
import { UploadDialog } from '@/components/features/upload-dialog';
import { ToastNotification } from '@/components/ui/toast-notification';
import { CopilotSidebar } from '@/components/features/copilot-sidebar';

import { fetchDocumentFolders, invalidateDocumentFoldersCache } from '@/lib/documents-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useHealthStatus } from '@/hooks/use-health-status';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const FOLDERS_PAGE_SIZE = 12;

const VIEWS = {
  all: {
    title: 'My Documents',
    subtitle: 'Browse folders and analyze documents with AI',
  },
  evaluated: {
    title: 'Evaluated Docs',
    subtitle: 'Folders containing documents with completed AI evaluation',
  },
};

export function MyDocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const healthStatus = useHealthStatus();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');

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
      pageSize: FOLDERS_PAGE_SIZE,
      evaluatedOnly: view === 'evaluated',
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

  const loadMoreFolders = useCallback(async () => {
    const requestView = view;
    setFoldersLoading(true);
    const nextPage = foldersPage + 1;
    try {
      const { items, hasMore } = await fetchDocumentFolders({
        apiBaseUrl: API_BASE_URL,
        page: nextPage,
        pageSize: FOLDERS_PAGE_SIZE,
        evaluatedOnly: requestView === 'evaluated',
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
        pageSize: FOLDERS_PAGE_SIZE,
        evaluatedOnly: requestView === 'evaluated',
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
  const panelSentinelRef = useInfiniteScroll({
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

  const handleNavigate = (nextView) => {
    setActiveFolder(null);
    setActiveFileId(null);
    setView(nextView);
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

  const panelFolders = useMemo(() => {
    const query = panelSearch.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter((folder) => folder.name?.toLowerCase().includes(query));
  }, [folders, panelSearch]);

  const showStatus = view !== 'evaluated';

  const panelEmptyMessage = useMemo(() => {
    if (panelSearch.trim()) return `No folders match "${panelSearch}".`;
    return view === 'evaluated' ? 'No evaluated folders yet.' : 'No folders yet.';
  }, [panelSearch, view]);

  const { title, subtitle } = VIEWS[view];

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      healthStatus={healthStatus}
      onUploadClick={() => setUploadOpen(true)}
      activeView={view}
      onNavigate={handleNavigate}
      activeFolder={activeFolder}
      secondaryPanel={
        activeFolder && (
          <FolderPanel
            heading={title}
            search={panelSearch}
            onSearchChange={setPanelSearch}
            folders={panelFolders}
            activeFolderId={activeFolder?.id}
            onSelectFolder={handleSelectFolder}
            showStatus={showStatus}
            loading={foldersLoading}
            hasMore={foldersHasMore}
            sentinelRef={panelSentinelRef}
            emptyMessage={panelEmptyMessage}
            onFileClick={handleFileClick}
          />
        )
      }
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
        {!activeFolder && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className={`flex items-center transition-all duration-300 gap-4 ${copilotOpen ? 'mr-80 sm:mr-96' : ''}`}>
              {view !== 'evaluated' && (
                <Button id="upload-document-button" className="gap-2" onClick={() => setUploadOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Upload
                </Button>
              )}
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
            <div className={`px-1 pb-1 transition-all duration-300 ${copilotOpen ? 'mr-80 sm:mr-96' : ''}`}>
              <FolderDetail
                folder={activeFolder}
                showStatus={showStatus}
                onFileClick={handleFileClick}
                activeFileId={activeFileId}
              />
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="-mx-1 min-h-0 flex-1">
            <div className={`px-1 pb-1 transition-all duration-300 ${copilotOpen ? 'mr-80 sm:mr-96' : ''}`}>
              {foldersLoading && folders.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
                  {view === 'evaluated' ? (
                    <>
                      <BadgeCheck className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium text-muted-foreground">No evaluated folders yet</p>
                      <p className="max-w-xs text-sm text-muted-foreground">
                        Folders show up here once their documents&apos; AI evaluation finishes successfully.
                      </p>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-10 w-10 text-muted-foreground" />
                      <p className="font-medium text-muted-foreground">No folders yet</p>
                      <p className="max-w-xs text-sm text-muted-foreground">
                        Upload a document to get instant AI summaries, entities and Q&amp;A.
                      </p>
                      <Button id="empty-state-upload-button" className="mt-2 gap-2" onClick={() => setUploadOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Upload Document
                      </Button>
                    </>
                  )}
                </div>
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
                        showStatus={showStatus}
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
        open={copilotOpen}
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
