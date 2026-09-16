import React from 'react';
import { Folder, FileText, Layers, CalendarPlus, CalendarClock, ArrowLeft } from 'lucide-react';

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

function colorForFolder(folder) {
  const key = folder?.id ?? '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function FolderDetail({ folder, showStatus, onBack }) {
  const color = colorForFolder(folder);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All folders
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', color.bg)}>
            <Folder className={cn('h-6 w-6', color.fg)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{folder.name}</h2>
              {showStatus && folder.status && <StatusBadge value={folder.status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {folder.filesCount} {folder.filesCount === 1 ? 'file' : 'files'} &middot; {folder.sectionsCount}{' '}
              sections
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FileText} label="Files" value={folder.filesCount} />
        <StatTile icon={Layers} label="Sections" value={folder.sectionsCount} />
        <StatTile icon={CalendarPlus} label="Created" value={formatDate(folder.createdAt)} />
        <StatTile icon={CalendarClock} label="Updated" value={formatDate(folder.updatedAt)} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium text-muted-foreground">Pick a file to preview</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Browse this folder&apos;s files and sections from the panel on the left. Full document preview is
          coming soon.
        </p>
      </div>
    </div>
  );
}
