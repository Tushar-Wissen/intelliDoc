import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileText,
  FolderInput,
  MoreHorizontal,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { AppShell } from '@/components/layout/app-shell';
import { OrphanedFileRow } from '@/components/features/orphaned-file-row';
import { UploadDialog } from '@/components/features/upload-dialog';
import { MoveToFolderDialog } from '@/components/features/move-to-folder-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { documentsApi } from '@/lib/documents-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useHealthStatus } from '@/hooks/use-health-status';
import { useWorkspace } from '@/context/workspace-context';

// The API returns every document at once, so infinite scroll reveals them in slices.
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 250;
// Phase 1 moves one document at a time; raise this (the dialog already takes a list) for multi-move.
const MAX_MOVE_DOCUMENTS = 1;

// Documents that already belong to a folder are no longer orphaned.
const keepUnassigned = (documents) => documents.filter((doc) => !doc.moduleId);

const COLUMNS = [
  { label: 'Name', className: 'px-3' },
  { label: 'Type', className: 'hidden px-3 sm:table-cell' },
  { label: 'Status', className: 'hidden px-3 md:table-cell' },
  { label: 'Created', className: 'hidden px-3 lg:table-cell' },
];

export function OrphanedFilesPage() {
  const healthStatus = useHealthStatus();
  const { selectedWorkspaceId, loading: workspaceLoading } = useWorkspace();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [bannerOpen, setBannerOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingDocuments, setMovingDocuments] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [files, setFiles] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const scrollRef = useRef(null);

  // Debounce typing so each keystroke doesn't re-filter the list.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load the selected workspace's documents (and again on retry).
  useEffect(() => {
    if (workspaceLoading) return;

    setSelectedIds(new Set());
    setError(null);

    if (!selectedWorkspaceId) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    documentsApi
      .list(selectedWorkspaceId)
      .then((documents) => {
        if (!cancelled) setFiles(keepUnassigned(documents));
      })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId, workspaceLoading, reloadKey]);

  // Newest first, narrowed by the search text.
  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return files
      .filter((file) => !query || file.name?.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [files, search]);

  // Start from the first slice whenever the list or search changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
  }, [filteredFiles]);

  const items = useMemo(() => filteredFiles.slice(0, visibleCount), [filteredFiles, visibleCount]);
  const total = filteredFiles.length;
  const totalCount = files.length;
  const hasMore = visibleCount < total;

  const loadMore = useCallback(() => setVisibleCount((count) => count + PAGE_SIZE), []);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading,
    onLoadMore: loadMore,
    root: scrollRef,
  });

  const toggleSelect = useCallback((fileId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const allSelected = items.length > 0 && items.every((f) => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((f) => f.id)));
  };

  // Quietly re-sync with the server; on failure keep what is already on screen.
  const refreshFiles = useCallback(() => {
    if (!selectedWorkspaceId) return;
    documentsApi
      .list(selectedWorkspaceId)
      .then((documents) => setFiles(keepUnassigned(documents)))
      .catch(() => {});
  }, [selectedWorkspaceId]);

  // Show freshly uploaded documents straight away, then re-sync.
  const handleUploaded = useCallback(
    (uploaded) => {
      setFiles((prev) => [...uploaded, ...prev.filter((f) => !uploaded.some((u) => u.id === f.id))]);
      refreshFiles();
    },
    [refreshFiles]
  );

  // Opens the move dialog for the given document ids (one at a time for now).
  const handleMoveToFolder = useCallback(
    (fileIds) => {
      const documents = files.filter((f) => fileIds.includes(f.id)).slice(0, MAX_MOVE_DOCUMENTS);
      if (documents.length === 0) return;
      setMovingDocuments(documents);
      setMoveOpen(true);
    },
    [files]
  );

  // A moved document is no longer orphaned: drop it right away, then re-sync.
  const handleMoved = useCallback(
    (movedDocument) => {
      setFiles((prev) => prev.filter((f) => f.id !== movedDocument.id));
      setSelectedIds(new Set());
      refreshFiles();
    },
    [refreshFiles]
  );

  const isEmpty = !loading && !error && totalCount === 0;
  const hasNoMatches = !loading && !error && totalCount > 0 && items.length === 0;

  return (
    <AppShell
      title="Orphaned Files"
      badge={!loading && !error ? `${totalCount} ${totalCount === 1 ? 'file' : 'files'}` : undefined}
      subtitle="Files that are not assigned to any folder/module within this workspace."
      headerTestId="orphaned-files-header"
      healthStatus={healthStatus}
    >
        <div
          id="orphaned-files-page"
          data-testid="orphaned-files-page"
          className="flex min-h-0 flex-1 flex-col gap-5"
        >
          {isEmpty ? (
            <div
              id="orphaned-files-empty-state"
              data-testid="orphaned-files-empty-state"
              className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border bg-gradient-to-b from-wissen-navy/[0.03] to-transparent px-6 py-16 text-center"
            >
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-wissen-navy/10">
                  <FileText className="h-11 w-11 text-wissen-navy dark:text-wissen-navy-light" />
                </div>
                <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
                  No Orphaned Files
                </h3>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Files from deleted folders or unassigned uploads will appear here.
                </p>
              </div>
              <Button
                id="document-upload-button"
                data-testid="document-upload-button"
                type="button"
                className="gap-2 bg-wissen-navy px-5 text-white hover:bg-wissen-navy/90"
                onClick={() => setUploadOpen(true)}
              >
                <UploadCloud className="h-4 w-4" />
                Upload document
              </Button>
            </div>
          ) : (
            <>
              {/* Info banner */}
              {bannerOpen && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Keep your workspace organized</p>
                    <p className="text-xs text-muted-foreground">
                      These files are not in any folder. You can leave them here or move them to a relevant folder.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBannerOpen(false)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-amber-500/20 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Search (left) + move actions (right) */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="orphaned-files-search"
                    data-testid="orphaned-files-search"
                    placeholder="Search files..."
                    className="pl-9"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={selectedIds.size !== MAX_MOVE_DOCUMENTS}
                    title={selectedIds.size > MAX_MOVE_DOCUMENTS ? 'Select a single file to move it' : undefined}
                    onClick={() => handleMoveToFolder([...selectedIds])}
                  >
                    <FolderInput className="h-4 w-4" />
                    Move to Folder
                    {selectedIds.size > 0 && (
                      <span className="rounded-full bg-wissen-navy/10 px-1.5 text-[11px] font-semibold text-wissen-navy dark:text-wissen-navy-light">
                        {selectedIds.size}
                      </span>
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={items.length === 0} onClick={toggleSelectAll}>
                        <Check className="h-4 w-4" />
                        {allSelected ? 'Clear selection' : 'Select all loaded files'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* File list */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex flex-col gap-2 p-4" aria-busy="true">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="h-12 animate-pulse rounded-lg bg-muted/60" />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                      <p className="text-sm text-muted-foreground">{error.message}</p>
                      <Button type="button" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                        Try again
                      </Button>
                    </div>
                  ) : hasNoMatches ? (
                    <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                      No files match your search.
                    </p>
                  ) : (
                    <table id="orphaned-files-list" data-testid="orphaned-files-list" className="w-full border-collapse text-left">
                      <thead className="sticky top-0 z-10 bg-muted">
                        <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="w-10 py-2.5 pl-4 pr-2">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected;
                              }}
                              onChange={toggleSelectAll}
                              aria-label="Select all files"
                              className="h-4 w-4 cursor-pointer rounded border-input accent-wissen-navy"
                            />
                          </th>
                          {COLUMNS.map((column) => (
                            <th key={column.label} className={cn('py-2.5 font-semibold', column.className)}>
                              {column.label}
                            </th>
                          ))}
                          <th className="py-2.5 pl-3 pr-4 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((file) => (
                            <OrphanedFileRow
                              key={file.id}
                              file={file}
                              selected={selectedIds.has(file.id)}
                              onToggleSelect={toggleSelect}
                              onMoveToFolder={handleMoveToFolder}
                            />
                        ))}
                      </tbody>
                    </table>
                  )}

                  {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
                </div>
              </div>

              {!loading && !error && total > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing {items.length} of {total} {total === 1 ? 'file' : 'files'}
                </p>
              )}
            </>
          )}
        </div>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={handleUploaded} />
      <MoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        documents={movingDocuments}
        onMoved={handleMoved}
      />
    </AppShell>
  );
}
