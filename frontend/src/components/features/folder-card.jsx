import React from 'react';
import { Folder, FileText, Layers } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { colorForFolder } from '@/lib/folder-colors';
import { StatusBadge } from '@/components/features/status-badge';

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
