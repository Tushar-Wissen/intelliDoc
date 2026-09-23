import React, { useRef } from 'react';
import { Folder, FileText, Layers, Calendar, MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { colorForFolder } from '@/lib/folder-colors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function FolderCard({
  folder,
  index = 0,
  selected = false,
  onClick,
  onEdit,
  onDelete,
  createdBy = 'You',
}) {
  const color = colorForFolder(folder, index);
  const initials = (createdBy || 'You')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'Y';

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  // Radix's dropdown unmounts as soon as an item is selected, and the browser's trailing
  // "click" event can then land on whatever card element is now revealed underneath at that
  // same position — this flag makes the card ignore that one stray click.
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      data-testid={`folder-card-${folder.id}`}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col items-stretch gap-3.5 overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-wissen-navy/40 hover:bg-accent/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40',
        selected ? 'border-wissen-navy/60 bg-wissen-navy/5 ring-1 ring-wissen-navy/10' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 transition-transform duration-200 group-hover:scale-105',
            color.bg
          )}
        >
          <Folder className={cn('h-5 w-5', color.fg)} />
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`More actions for ${folder.name}`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={runMenuAction(() => onClick?.())}>
                <Eye className="h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={runMenuAction(() => onEdit?.(folder))}>
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={runMenuAction(() => onDelete?.(folder))}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="line-clamp-1 text-base font-semibold leading-snug text-card-foreground">
          {folder.name}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            {folder.filesCount} {folder.filesCount === 1 ? 'file' : 'files'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Layers className="h-3 w-3" />
            {folder.sectionsCount} {folder.sectionsCount === 1 ? 'section' : 'sections'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {initials}
          </span>
          <span className="truncate">Created by {createdBy}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDate(folder.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
