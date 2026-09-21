import React from 'react';
import { Folder, FileText, Layers } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/features/status-badge';

const FOLDER_COLORS = [
  { bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400' },
];

function colorForFolder(folder, index) {
  const key = folder?.id ?? String(index);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

export function FolderCard({ folder, index = 0, selected = false, showStatus = true, onClick }) {
  const color = colorForFolder(folder, index);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-stretch gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color.bg)}>
          <Folder className={cn('h-5 w-5', color.fg)} />
        </div>
        {showStatus && folder.status && <StatusBadge value={folder.status} />}
      </div>

      <p className="line-clamp-1 text-sm font-semibold leading-snug text-card-foreground">
        {folder.name}
      </p>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {folder.filesCount} {folder.filesCount === 1 ? 'file' : 'files'}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          {folder.sectionsCount} {folder.sectionsCount === 1 ? 'section' : 'sections'}
        </span>
      </div>

      <div className="flex items-center border-t border-border pt-3 text-xs text-muted-foreground">
        <span>Created {formatDate(folder.createdAt)}</span>
      </div>
    </button>
  );
}
