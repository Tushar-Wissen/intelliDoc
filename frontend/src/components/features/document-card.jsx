import React from 'react';
import { Folder, FileText, CalendarDays, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes, formatDate, estimatePageCount } from '@/lib/format';

const FOLDER_COLORS = [
  { bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400' },
];

const STATUS_DOT = {
  COMPLETED: 'bg-success',
  PROCESSING: 'bg-amber-500 animate-pulse',
  FAILED: 'bg-destructive',
};

function colorForDoc(doc, index) {
  const key = doc?.id ?? String(index);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

export function DocumentCard({ document, index = 0, selected = false, onClick }) {
  const isFolder = document.type === 'folder';
  const color = colorForDoc(document, index);
  const statusDot = STATUS_DOT[document.status];

  const fileCount = isFolder ? document.files?.length || 0 : 1;
  const totalBytes = isFolder
    ? document.files?.reduce((acc, f) => {
        if (typeof f.size === 'number') return acc + f.size;
        if (f.content) return acc + new Blob([f.content]).size;
        return acc;
      }, 0) || 0
    : null;
  const pages = !isFolder ? estimatePageCount(document.content) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        isFolder && 'border-primary/30 bg-card/80'
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="relative">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color.bg)}>
            {isFolder ? (
              <Folder className={cn('h-5 w-5', color.fg)} />
            ) : (
              <FileText className={cn('h-5 w-5', color.fg)} />
            )}
          </div>
          {statusDot && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                statusDot
              )}
              title={document.status}
            />
          )}
        </div>

        {isFolder && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </span>
        )}
      </div>

      <div className="min-w-0 w-full">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-card-foreground">
          {document.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isFolder ? (
            <>
              Folder &middot; {totalBytes ? formatBytes(totalBytes) : `${fileCount} items`}
            </>
          ) : (
            <>
              {pages} {pages === 1 ? 'page' : 'pages'} &middot; {formatBytes(document.content)}
            </>
          )}
        </p>
      </div>

      <div className="mt-1 flex w-full items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {formatDate(document.createdAt)}
        </span>
        {isFolder ? (
          <span className="flex items-center gap-0.5 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open <ChevronRight className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

