import React, { useEffect, useState } from 'react';
import {
  Search,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Diamond,
  CircleDot,
  Square,
  Circle,
  Loader2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/features/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

const SECTION_ICONS = [
  { Icon: Diamond, color: 'text-rose-500' },
  { Icon: CircleDot, color: 'text-emerald-500' },
  { Icon: Square, color: 'text-blue-500' },
  { Icon: Circle, color: 'text-amber-500' },
];

function colorForFolder(folder, index) {
  const key = folder?.id ?? String(index);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

function SectionRow({ section, index }) {
  const { Icon, color } = SECTION_ICONS[index % SECTION_ICONS.length];
  return (
    <div className="flex items-center gap-2 py-1 pl-2 pr-2">
      <Icon className={cn('h-2.5 w-2.5 shrink-0', color)} />
      <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/60">{section.name}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-sidebar-foreground/35">{section.metric}</span>
    </div>
  );
}

function FileRow({ file, expanded, onToggle, onFileClick }) {
  const tagColor = TAG_COLORS[file.tag] ?? DEFAULT_TAG_COLOR;
  const hasSections = file.sections?.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => { onToggle(); onFileClick?.(); }}
        className="flex w-full items-center gap-2 rounded-md py-1.5 pl-1.5 pr-2 text-left transition-colors hover:bg-sidebar-accent/50"
      >
        {hasSections ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-sidebar-foreground/35" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-sidebar-foreground/35" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FileText className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/45" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-[13px] text-sidebar-foreground/90">{file.name}</span>
          </TooltipTrigger>
          <TooltipContent side="right">{file.name}</TooltipContent>
        </Tooltip>
        {file.hasUpdates && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
            tagColor.bg,
            tagColor.fg
          )}
        >
          {file.tag}
        </span>
      </button>

      {expanded && hasSections && (
        <div className="ml-[13px] flex flex-col border-l border-sidebar-border/70 pl-3">
          {file.sections.map((section, idx) => (
            <SectionRow key={section.id} section={section} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderNode({ folder, index, active, treeOpen, showStatus, expandedFileIds, onToggleFile, onSelect, onToggleTree, onFileClick }) {
  const color = colorForFolder(folder, index);
  const hasFiles = folder.files?.length > 0;
  const showTree = active && treeOpen && hasFiles;

  const rowBody = (
    <>
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', color.bg)}>
        <Folder className={cn('h-4 w-4', color.fg)} />
      </div>
      <div className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className={cn('truncate text-sm leading-tight', active ? 'font-semibold' : 'font-medium')}>
              {folder.name}
            </p>
          </TooltipTrigger>
          <TooltipContent side="right">{folder.name}</TooltipContent>
        </Tooltip>
        <p className="truncate text-xs text-sidebar-foreground/50">
          {folder.filesCount} {folder.filesCount === 1 ? 'file' : 'files'} &middot; {folder.sectionsCount}{' '}
          sections
        </p>
      </div>
      {showStatus && folder.status && <StatusBadge value={folder.status} className="shrink-0" />}
    </>
  );

  return (
    <div className={cn('rounded-lg', active && 'bg-sidebar-accent/40')}>
      {hasFiles ? (
        <div className="flex items-center gap-0.5 pr-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (active) {
                onToggleTree();
              } else {
                onSelect();
              }
            }}
            aria-label={showTree ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="shrink-0 rounded-md p-2 text-sidebar-foreground/40 transition-colors hover:text-sidebar-foreground"
          >
            {showTree ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 text-left transition-colors',
              active ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/40'
            )}
          >
            {rowBody}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
            active ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/40'
          )}
        >
          <span className="w-3.5 shrink-0" />
          {rowBody}
        </button>
      )}

      {showTree && (
        <div className="ml-[19px] flex flex-col gap-0.5 border-l border-sidebar-border pb-2 pl-3">
          {folder.files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              expanded={expandedFileIds.has(file.id)}
              onToggle={() => onToggleFile(file.id)}
              onFileClick={() => onFileClick?.({ ...file, folderId: folder.id, folderName: folder.name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderPanel({
  heading,
  search,
  onSearchChange,
  folders,
  activeFolderId,
  onSelectFolder,
  showStatus,
  loading,
  hasMore,
  sentinelRef,
  emptyMessage,
  onFileClick,
}) {
  const [expandedFileIds, setExpandedFileIds] = useState(() => new Set());
  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    setTreeOpen(true);
    const folder = folders.find((f) => f.id === activeFolderId);
    if (folder?.files?.length) {
      setExpandedFileIds(new Set([folder.files[0].id]));
    } else {
      setExpandedFileIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  const toggleFile = (fileId) => {
    setExpandedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="hidden w-80 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex flex-col gap-3 border-b border-sidebar-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search folders..."
            className="h-8 border-sidebar-border bg-background pl-8 text-sm"
          />
        </div>
        <h2 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
          {heading}
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-3">
          {folders.length === 0 && !loading ? (
            <p className="px-2.5 py-6 text-center text-xs text-sidebar-foreground/50">{emptyMessage}</p>
          ) : (
            folders.map((folder, idx) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                index={idx}
                active={folder.id === activeFolderId}
                treeOpen={treeOpen}
                showStatus={showStatus}
                expandedFileIds={expandedFileIds}
                onToggleFile={toggleFile}
                onSelect={() => onSelectFolder(folder)}
                onToggleTree={() => setTreeOpen((prev) => !prev)}
                onFileClick={onFileClick}
              />
            ))
          )}

          {hasMore && (
            <div ref={sentinelRef} className="flex h-8 items-center justify-center">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-sidebar-foreground/40" />}
            </div>
          )}
        </div>
      </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
