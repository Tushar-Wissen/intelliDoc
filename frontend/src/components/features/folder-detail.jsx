import React from 'react';
import { Folder, FileText, Diamond, CircleDot, Square, Circle, Hexagon, Triangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/features/status-badge';
import { Badge } from '@/components/ui/badge';

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

const SECTION_STYLES = [
  { Icon: Diamond, bg: 'bg-violet-500/10', fg: 'text-violet-600 dark:text-violet-400' },
  { Icon: Hexagon, bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400' },
  { Icon: CircleDot, bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  { Icon: Square, bg: 'bg-blue-500/10', fg: 'text-blue-600 dark:text-blue-400' },
  { Icon: Circle, bg: 'bg-rose-500/10', fg: 'text-rose-600 dark:text-rose-400' },
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

function styleForSection(section) {
  const key = section?.name ?? '';
  return SECTION_STYLES[hashKey(key) % SECTION_STYLES.length];
}

function SectionCard({ section }) {
  const { Icon, bg, fg } = styleForSection(section);
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
          {file.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderDetail({ folder, showStatus, onFileClick, activeFileId }) {
  const color = colorForFolder(folder);
  const allFiles = folder.files ?? [];
  const activeFile = activeFileId ? allFiles.find((f) => f.id === activeFileId) : null;
  const visibleFiles = activeFile ? [activeFile] : allFiles;
  const hasFiles = visibleFiles.length > 0;
  const extractionsCount = activeFile ? activeFile.sections?.length ?? 0 : folder.sectionsCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', color.bg)}>
            <Folder className={cn('h-5 w-5', color.fg)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {activeFile ? activeFile.name : folder.name}
              </h2>
              {showStatus && !activeFile && folder.status && <StatusBadge value={folder.status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {activeFile
                ? folder.name
                : `${folder.filesCount} ${folder.filesCount === 1 ? 'document' : 'documents'} · AI smart folder`}
            </p>
          </div>
        </div>

        <Badge variant="outline" className="shrink-0">
          {extractionsCount} extractions
        </Badge>
      </div>

      {hasFiles ? (
        <div className="flex flex-col gap-4">
          {visibleFiles.map((file) => (
            <FileGroup
              key={file.id}
              file={file}
              onFileClick={(f) => onFileClick?.({ ...f, folderId: folder.id, folderName: folder.name })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-muted-foreground">No files in this folder yet</p>
        </div>
      )}
    </div>
  );
}
