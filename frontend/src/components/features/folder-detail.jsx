import React, { useMemo, useState } from 'react';
import {
  Folder,
  FileText,
  Diamond,
  CircleDot,
  Square,
  Circle,
  Hexagon,
  Triangle,
  ChevronDown,
  UploadCloud,
  Search,
  Sparkles,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

// Order/colors mirror folder-panel.jsx's SECTION_ICONS so a section shows the same icon in the sidebar tree and here.
const SECTION_STYLES = [
  { Icon: Diamond, bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
  { Icon: CircleDot, bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  { Icon: Square, bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  { Icon: Circle, bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  { Icon: Hexagon, bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  { Icon: Triangle, bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400' },
];

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

function styleForSection(index) {
  return SECTION_STYLES[index % SECTION_STYLES.length];
}

function SectionCard({ section, index }) {
  const { Icon, bg, fg } = styleForSection(index);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon className={cn('h-4 w-4', fg)} />
      </div>
      <p className="truncate text-sm font-semibold text-card-foreground">{section.name}</p>
      {section.pages && <p className="text-xs text-muted-foreground">pp. {section.pages}</p>}
    </div>
  );
}

function FileGroup({ file, onFileClick }) {
  const tagColor = TAG_COLORS[file.tag] ?? DEFAULT_TAG_COLOR;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4">
      <button
        type="button"
        onClick={() => onFileClick?.(file)}
        className="flex items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-card-foreground hover:underline">{file.name}</p>
              {file.tag && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
                    tagColor.bg,
                    tagColor.fg
                  )}
                >
                  {file.tag}
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">Source: {file.name}</p>
          </div>
        </div>
        <Badge variant="success" className="shrink-0 gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Indexed
        </Badge>
      </button>

      {file.sections?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {file.sections.map((section, idx) => (
            <SectionCard key={section.id} section={section} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileTableRow({ file, updatedAt, onClick }) {
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
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tagColor.bg)}>
            <FileText className={cn('h-4 w-4', tagColor.fg)} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-card-foreground">{file.name}</p>
            <p className="truncate text-xs text-muted-foreground sm:hidden">{file.tag}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 sm:table-cell">
        <span
          className={cn(
            'inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
            tagColor.bg,
            tagColor.fg
          )}
        >
          {file.tag}
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted-foreground md:table-cell">
        {sectionsCount} {sectionsCount === 1 ? 'section' : 'sections'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
        {formatDate(updatedAt)}
      </td>
    </tr>
  );
}

function FolderOverview({ folder, onFileClick, onUploadClick }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const color = colorForFolder(folder);
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-full px-4 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Type</th>
                  <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Sections</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredFiles.map((file) => (
                  <FileTableRow
                    key={file.id}
                    file={file}
                    updatedAt={folder.updatedAt}
                    onClick={() => onFileClick?.({ ...file, folderId: folder.id, folderName: folder.name })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

  const extractionsCount = activeFile.sections?.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{activeFile.name}</h2>
            <p className="text-sm text-muted-foreground">{folder.name}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="shrink-0">
            {extractionsCount} extractions
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <FileGroup
          file={activeFile}
          onFileClick={(f) => onFileClick?.({ ...f, folderId: folder.id, folderName: folder.name })}
        />
      </div>
    </div>
  );
}
