import React from 'react';
import {
  ChevronRight,
  Clock,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes, formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DashboardEmptyState } from '@/components/dashboard/dashboard-empty-state';

const MOCK_FILES = [
  {
    id: 1,
    name: 'Q3 Client Onboarding Guide.pdf',
    type: 'PDF',
    folder: 'Operations',
    time: '2 hours ago',
    iconBg: 'bg-wissen-navy/10',
    iconFg: 'text-wissen-navy',
    typeBg: 'bg-wissen-navy/10 text-wissen-navy',
  },
  {
    id: 2,
    name: 'Vendor Contract - Renewal.docx',
    type: 'DOCX',
    folder: 'Legal',
    time: 'Yesterday',
    iconBg: 'bg-blue-500/10',
    iconFg: 'text-blue-600',
    typeBg: 'bg-blue-500/10 text-blue-700',
  },
  {
    id: 3,
    name: 'Sprint Capacity Plan.xlsx',
    type: 'XLSX',
    folder: 'Engineering',
    time: 'Yesterday',
    iconBg: 'bg-orange-500/10',
    iconFg: 'text-orange-600',
    typeBg: 'bg-orange-500/10 text-orange-700',
  },
  {
    id: 4,
    name: 'Security Policy v4.pdf',
    type: 'PDF',
    folder: 'Compliance',
    time: 'Sep 21',
    iconBg: 'bg-wissen-navy/10',
    iconFg: 'text-wissen-navy',
    typeBg: 'bg-wissen-navy/10 text-wissen-navy',
  },
];

// Name | Folder | Updated | Actions on md+; name and actions only on small screens.
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]';

function getFileIcon(type) {
  const upperType = (type || '').toUpperCase();
  if (upperType.includes('XLS') || upperType.includes('CSV')) return FileSpreadsheet;
  if (upperType.includes('PDF') || upperType.includes('DOC')) return FileText;
  return File;
}

function DocumentRow({ file, onOpenFile, onOpenFolder }) {
  const Icon = getFileIcon(file.type);
  const size = typeof file.size === 'number' ? formatBytes(file.size) : null;
  const fullDate = file.updatedAt || file.createdAt ? formatDateTime(file.updatedAt || file.createdAt) : undefined;

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onOpenFile?.(file)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenFile?.(file);
        }
      }}
      className={cn(
        ROW_GRID,
        'group cursor-pointer rounded-xl border border-transparent px-3 py-3 transition-all',
        'hover:border-border hover:bg-accent/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {/* Name + type + meta */}
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', file.iconBg)}>
          <Icon className={cn('h-5 w-5', file.iconFg)} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground group-hover:text-wissen-navy dark:group-hover:text-wissen-navy-light">
              {file.name}
            </p>
            {file.type && (
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider', file.typeBg)}>
                {file.type}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {/* Folder and time move into the meta line on small screens. */}
            <span className="md:hidden">
              {file.folder}
              {file.time && <> &middot; {file.time}</>}
            </span>
            <span className="hidden md:inline">{size || '—'}</span>
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground md:flex">
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="truncate">{file.folder}</span>
      </div>

      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex" title={fullDate}>
        <Clock className="h-4 w-4 shrink-0" />
        <span className="truncate">{file.time || '—'}</span>
      </div>

      {/* Quick actions */}
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={`Open ${file.name}`}
          onClick={() => onOpenFile?.(file)}
          className="hidden rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 sm:inline-flex"
        >
          <Eye className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${file.name}`}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpenFile?.(file)}>
              <Eye className="mr-2 h-4 w-4" /> Open document
            </DropdownMenuItem>
            {onOpenFolder && (
              <DropdownMenuItem onSelect={() => onOpenFolder(file)}>
                <FolderOpen className="mr-2 h-4 w-4" /> Show in folder
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function LoadingRows() {
  return (
    <ul className="flex flex-col gap-1" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className={cn(ROW_GRID, 'px-3 py-3')}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="hidden h-3 w-2/3 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-3 w-1/2 animate-pulse rounded bg-muted md:block" />
          <div className="h-6 w-6 animate-pulse rounded-md bg-muted" />
        </li>
      ))}
    </ul>
  );
}

export function RecentDocumentsTable({ files = MOCK_FILES, loading = false, onOpenFile, onOpenFolder, onViewAll }) {
  const isEmpty = !loading && files.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Recent documents</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Recently added or updated in this workspace</p>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center text-xs font-medium text-wissen-navy hover:underline dark:text-wissen-navy-light"
          >
            View all <ChevronRight className="ml-1 h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <LoadingRows />
        ) : isEmpty ? (
          <DashboardEmptyState
            title="No Recent Documents"
            description="Documents you upload or update will show up here for quick access."
            actionLabel={onViewAll ? 'Go to My Workspace' : undefined}
            actionIcon={FolderOpen}
            onAction={onViewAll}
          />
        ) : (
          <>
            <div className={cn(ROW_GRID, 'hidden border-b border-border px-3 pb-2 md:grid')}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Name</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Folder</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Updated</span>
              <span className="w-[3.75rem]" />
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {files.map((file) => (
                <DocumentRow key={file.id} file={file} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
