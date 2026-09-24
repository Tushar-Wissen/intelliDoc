import React, { useEffect, useMemo, useState } from 'react';
import { Check, Folder, FolderInput, Loader2, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { colorForFolder } from '@/lib/folder-colors';
import { documentsApi } from '@/lib/documents-api';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Takes a list so multi-document move can be added later; today the callers pass exactly one
// document and only the first is moved (the API moves one document per request).
export function MoveToFolderDialog({ open, onOpenChange, documents = [], onMoved }) {
  const { folders, loading: foldersLoading, error: foldersError, refreshFolders } = useFolders();
  const toast = useToast();

  const [movingDocument] = documents;

  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Start with a clean form each time the dialog opens for a document.
  useEffect(() => {
    if (!open) return;
    setSelectedFolderId(null);
    setQuery('');
    setError('');
  }, [open, movingDocument?.id]);

  const filteredFolders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return folders.filter((folder) => !normalized || folder.name?.toLowerCase().includes(normalized));
  }, [folders, query]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;
  const alreadyInFolder = Boolean(selectedFolder && movingDocument?.moduleId === selectedFolder.id);
  const canSubmit = Boolean(movingDocument && selectedFolder && !alreadyInFolder && !submitting);

  const handleOpenChange = (next) => {
    // Don't let the dialog be dismissed mid-request; the outcome would otherwise go unseen.
    if (submitting) return;
    onOpenChange(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');
    try {
      await documentsApi.moveToFolder(movingDocument.id, selectedFolder.id);
      toast.success('Document moved', `"${movingDocument.name}" was moved to "${selectedFolder.name}".`);
      setSubmitting(false);
      onOpenChange(false);
      onMoved?.(movingDocument, selectedFolder);
    } catch (err) {
      // Keep the dialog open with the selection so the user can retry.
      const message = err?.message || 'Something went wrong. Please try again.';
      setError(message);
      toast.error('Could not move document', message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id="move-to-folder-dialog" data-testid="move-to-folder-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription className="break-words">
            {movingDocument ? (
              <>
                Choose a folder for <span className="font-medium text-foreground">{movingDocument.name}</span>.
              </>
            ) : (
              'Choose a folder for this document.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="move-to-folder-search"
              data-testid="move-to-folder-search"
              placeholder="Search folders..."
              className="pl-9"
              value={query}
              disabled={submitting}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div
            id="move-to-folder-list"
            data-testid="move-to-folder-list"
            role="radiogroup"
            aria-label="Folders"
            className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5"
          >
            {foldersLoading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading folders...
              </p>
            ) : foldersError && folders.length === 0 ? (
              <div className="space-y-2 py-6 text-center text-sm">
                <p className="text-destructive">{foldersError.message}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => refreshFolders().catch(() => {})}>
                  Try again
                </Button>
              </div>
            ) : folders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No folders yet. Create a folder first, then move this document into it.
              </p>
            ) : filteredFolders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No folders match &ldquo;{query}&rdquo;.</p>
            ) : (
              filteredFolders.map((folder) => {
                const color = colorForFolder(folder, folders.findIndex((f) => f.id === folder.id));
                const selected = folder.id === selectedFolderId;
                const isCurrent = movingDocument?.moduleId === folder.id;
                return (
                  <button
                    key={folder.id}
                    id={`move-to-folder-option-${folder.id}`}
                    data-testid={`move-to-folder-option-${folder.id}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={submitting}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40 disabled:pointer-events-none disabled:opacity-60',
                      selected ? 'bg-wissen-navy/10' : 'hover:bg-accent/60'
                    )}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', color.bg)}>
                      <Folder className={cn('h-3.5 w-3.5', color.fg)} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{folder.name}</span>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Current
                      </span>
                    )}
                    {selected && <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />}
                  </button>
                );
              })
            )}
          </div>

          {alreadyInFolder && (
            <p className="text-xs text-muted-foreground" data-testid="move-to-folder-already-there">
              This document is already in &ldquo;{selectedFolder.name}&rdquo;. Choose a different folder.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              id="move-to-folder-cancel"
              data-testid="move-to-folder-cancel"
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              id="move-to-folder-submit"
              data-testid="move-to-folder-submit"
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Moving...
                </>
              ) : (
                <>
                  <FolderInput className="h-4 w-4" />
                  Move
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
