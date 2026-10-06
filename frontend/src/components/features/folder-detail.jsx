import React, { useMemo, useRef, useState } from 'react';
import {
  Folder,
  FileText,
  ChevronDown,
  UploadCloud,
  Search,
  Sparkles,
  Trash2,
  Calendar,
  Eye,
  HardDrive,
  MoreVertical,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes, formatDate } from '@/lib/format';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { DocumentView } from '@/components/features/document-view';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WorkspaceRequiredAction } from '@/components/features/workspace-required-action';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Formats accepted by the upload dialog, shown as hints in the empty state.
const EMPTY_STATE_FORMATS = ['PDF', 'DOCX'];

const FOLDER_COLORS = [
  { bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400' },
];

const TAG_COLORS = {
  finance: { bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  technical: { bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  compliance: { bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  governance: { bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  legal: { bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
  product: { bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400' },
  security: { bg: 'bg-orange-500/10', fg: 'text-orange-600 dark:text-orange-400' },
  operations: { bg: 'bg-slate-500/10', fg: 'text-slate-600 dark:text-slate-400' },
};
const DEFAULT_TAG_COLOR = { bg: 'bg-muted', fg: 'text-muted-foreground' };

function hashKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForFolder(folder) {
  const key = folder?.id ?? '';
  return FOLDER_COLORS[hashKey(key) % FOLDER_COLORS.length];
}

// File name that truncates to its cell and shows the full name in a tooltip, but only when
// the name is actually cut off.
function TruncatedName({ name }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next) => {
    const el = ref.current;
    setOpen(next && Boolean(el) && el.scrollWidth > el.clientWidth);
  };

  return (
    <Tooltip open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <p ref={ref} className="truncate text-[13px] font-semibold text-card-foreground">
          {name}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-sm break-all">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}

function FileCard({ file, updatedAt, onClick, onDelete }) {
  const tagColor = TAG_COLORS[file.tag] ?? DEFAULT_TAG_COLOR;
  const size = typeof file.size === 'number' ? formatBytes(file.size) : null;

  // Radix's dropdown unmounts as soon as an item is selected, and the browser's trailing
  // "click" event can then land on the card underneath — skip that one stray click.
  const suppressNextClickRef = useRef(false);
  const runMenuAction = (action) => () => {
    suppressNextClickRef.current = true;
    action();
  };
  const handleCardClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onClick?.();
  };

  // One row per file, matching the folder cards: icon and name on the left, type, size,
  // date and actions on the right.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      data-testid={`folder-file-${file.id}`}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-sm transition-colors duration-200 hover:border-wissen-navy/40 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40"
    >
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', tagColor.bg)}>
        <FileText className={cn('h-4 w-4', tagColor.fg)} />
      </div>

      <div className="min-w-0 flex-1">
        <TruncatedName name={file.name} />
        {/* Narrow screens: the right-hand details collapse into one line under the name. */}
        <p className="truncate text-[11px] text-muted-foreground lg:hidden">
          {file.tag}
          {size && <> &middot; {size}</>} &middot; {formatDate(updatedAt)}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted-foreground lg:flex">
        {file.tag && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium uppercase', tagColor.bg, tagColor.fg)}>
            <FileText className="h-3 w-3" />
            {file.tag}
          </span>
        )}

        {size && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 font-medium">
            <HardDrive className="h-3 w-3" />
            {size}
          </span>
        )}

        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span className="whitespace-nowrap">{formatDate(updatedAt)}</span>
        </div>
      </div>

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`More actions for ${file.name}`}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={runMenuAction(() => onClick?.())}>
              <Eye className="h-4 w-4" />
              Open
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid={`folder-file-delete-${file.id}`}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={runMenuAction(() => onDelete?.(file))}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FolderOverview({ folder, onFileClick, onUploadClick, uploadDisabled }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deletingFile, setDeletingFile] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { deleteDocument } = useFolders();
  const toast = useToast();
  const color = colorForFolder(folder);

  const handleConfirmDelete = async () => {
    if (!deletingFile || deleting) return;

    setDeleting(true);
    try {
      await deleteDocument(deletingFile.id);
      toast.success('Document deleted', `"${deletingFile.name}" was deleted.`);
      setDeletingFile(null);
    } catch (err) {
      toast.error('Could not delete document', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  };
  const allFiles = folder.files ?? [];

  const availableTags = useMemo(
    () => Array.from(new Set(allFiles.map((f) => f.tag).filter(Boolean))),
    [allFiles]
  );

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allFiles.filter((file) => {
      if (typeFilter !== 'all' && file.tag !== typeFilter) return false;
      if (query && !file.name?.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [allFiles, search, typeFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', color.bg)}>
            <Folder className={cn('h-5 w-5', color.fg)} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{folder.name}</h2>
            <p className="text-sm text-muted-foreground">
              {allFiles.length} {allFiles.length === 1 ? 'document' : 'documents'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <WorkspaceRequiredAction disabled={uploadDisabled}>
            <Button
              type="button"
              disabled={uploadDisabled}
              onClick={onUploadClick}
              className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
            >
              <UploadCloud className="h-4 w-4" />
              Upload
            </Button>
          </WorkspaceRequiredAction>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between gap-2 capitalize sm:w-40">
              <span className="truncate">{typeFilter === 'all' ? 'All types' : typeFilter}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTypeFilter('all')}>All types</DropdownMenuItem>
            {availableTags.map((tag) => (
              <DropdownMenuItem key={tag} className="capitalize" onClick={() => setTypeFilter(tag)}>
                {tag}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {allFiles.length === 0 ? (
        <div
          data-testid="folder-empty-state"
          className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border bg-gradient-to-b from-wissen-navy/[0.03] to-transparent px-6 py-14 text-center"
        >
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-wissen-navy/10">
              <FileText className="h-9 w-9 text-wissen-navy dark:text-wissen-navy-light" />
            </div>
            <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
              No files in this folder yet
            </h3>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
              Upload your first document to start organizing it here and asking DocuMind AI questions about it.
            </p>
          </div>

          <WorkspaceRequiredAction disabled={uploadDisabled}>
            <Button
              type="button"
              disabled={uploadDisabled}
              onClick={onUploadClick}
              className="gap-2 bg-wissen-navy px-5 text-white hover:bg-wissen-navy/90"
            >
              <UploadCloud className="h-4 w-4" />
              Upload document
            </Button>
          </WorkspaceRequiredAction>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {EMPTY_STATE_FORMATS.map((format) => (
              <span
                key={format}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {format}
              </span>
            ))}
          </div>
        </div>
      ) : filteredFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No documents match your search.
        </p>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Documents</h3>
            <span className="text-xs font-medium text-muted-foreground">{filteredFiles.length}</span>
          </div>
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-col gap-2">
              {filteredFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  updatedAt={file.updatedAt ?? folder.updatedAt}
                  onClick={() => onFileClick?.({ ...file, folderId: folder.id, folderName: folder.name })}
                  onDelete={setDeletingFile}
                />
              ))}
            </div>
          </TooltipProvider>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingFile)}
        onOpenChange={(open) => !deleting && !open && setDeletingFile(null)}
        title="Delete document?"
        description={
          deletingFile ? (
            <span className="break-words">
              &ldquo;{deletingFile.name}&rdquo; will be permanently deleted. This can&rsquo;t be undone.
            </span>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        testIdPrefix="delete-document"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export function FolderDetail({ folder, onFileClick, activeFileId, onUploadClick, uploadDisabled }) {
  const allFiles = folder.files ?? [];
  const activeFile = activeFileId ? allFiles.find((f) => f.id === activeFileId) : null;

  if (!activeFile) {
    return (
      <FolderOverview
        folder={folder}
        onFileClick={onFileClick}
        onUploadClick={onUploadClick}
        uploadDisabled={uploadDisabled}
      />
    );
  }

  return <DocumentView file={activeFile} />;
}
