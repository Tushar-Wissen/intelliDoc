import React, { useMemo, useRef, useState } from 'react';
import {
  Folder,
  FileText,
  ChevronDown,
  UploadCloud,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { useFolders } from '@/context/folder-context';
import { useToast } from '@/context/toast-context';
import { DocumentView } from '@/components/features/document-view';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
        <p ref={ref} className="truncate text-sm font-medium text-card-foreground">
          {name}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-sm break-all">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}

function FileTableRow({ file, updatedAt, onClick, onDelete }) {
  const tagColor = TAG_COLORS[file.tag] ?? DEFAULT_TAG_COLOR;
  const sectionsCount = file.sections?.length ?? 0;

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
    >
      <td className="px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tagColor.bg)}>
            <FileText className={cn('h-4 w-4', tagColor.fg)} />
          </span>
          <div className="min-w-0 flex-1">
            <TruncatedName name={file.name} />
            <p className="truncate text-xs text-muted-foreground sm:hidden">{file.tag}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 align-middle sm:table-cell">
        <span
          className={cn(
            'inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            tagColor.bg,
            tagColor.fg
          )}
        >
          {file.tag}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right align-middle text-xs tabular-nums text-muted-foreground">
        {formatDate(updatedAt)}
      </td>
      <td className="py-3 pl-1 pr-3 text-right align-middle">
        {/* The row itself opens the file, so keep clicks and keys on this button from reaching it. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${file.name}`}
          title="Delete document"
          data-testid={`folder-file-delete-${file.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(file);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function FolderOverview({ folder, onFileClick, onUploadClick }) {
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
          <Button
            type="button"
            onClick={onUploadClick}
            className="gap-2 bg-wissen-navy text-white hover:bg-wissen-navy/90"
          >
            <UploadCloud className="h-4 w-4" />
            Upload
          </Button>
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
              Upload your first document to start organizing it here and asking IntelliDoc AI questions about it.
            </p>
          </div>

          <Button
            type="button"
            onClick={onUploadClick}
            className="gap-2 bg-wissen-navy px-5 text-white hover:bg-wissen-navy/90"
          >
            <UploadCloud className="h-4 w-4" />
            Upload document
          </Button>

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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Fixed layout: the side columns get set widths and Name takes the rest, so long
                file names truncate instead of widening the table. */}
            <TooltipProvider delayDuration={300}>
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="hidden w-28 px-4 py-2.5 font-semibold sm:table-cell">Type</th>
                  <th className="w-32 px-4 py-2.5 text-right font-semibold">Updated</th>
                  <th className="w-14 py-2.5 pl-1 pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredFiles.map((file) => (
                  <FileTableRow
                    key={file.id}
                    file={file}
                    updatedAt={file.updatedAt ?? folder.updatedAt}
                    onClick={() => onFileClick?.({ ...file, folderId: folder.id, folderName: folder.name })}
                    onDelete={setDeletingFile}
                  />
                ))}
              </tbody>
            </table>
            </TooltipProvider>
          </div>
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

export function FolderDetail({ folder, onFileClick, activeFileId, onUploadClick }) {
  const allFiles = folder.files ?? [];
  const activeFile = activeFileId ? allFiles.find((f) => f.id === activeFileId) : null;

  if (!activeFile) {
    return (
      <FolderOverview
        folder={folder}
        onFileClick={onFileClick}
        onUploadClick={onUploadClick}
      />
    );
  }

  return <DocumentView file={activeFile} />;
}
