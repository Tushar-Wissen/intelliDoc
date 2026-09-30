import React, { useRef } from 'react';
import { Folder, FileText, Calendar, MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function FolderCard({
  folder,
  selected = false,
  onClick,
  onRename,
  onDelete,
  createdBy = 'You',
}) {
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

  const filesLabel = `${folder.filesCount ?? 0} ${folder.filesCount === 1 ? 'file' : 'files'}`;

  // One row per folder: icon and name on the left, counts, creator, date and actions on the right.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      data-testid={`folder-card-${folder.id}`}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors duration-200 hover:border-wissen-navy/40 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40',
        selected ? 'border-wissen-navy/60 bg-wissen-navy/5 ring-1 ring-wissen-navy/10' : 'border-border'
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10">
        <Folder className="h-4 w-4 text-wissen-navy dark:text-wissen-navy-light" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-card-foreground" title={folder.name}>
          {folder.name}
        </p>
        {/* Narrow screens: the right-hand details collapse into one line under the name. */}
        <p className="truncate text-[11px] text-muted-foreground lg:hidden">
          {filesLabel} · {formatDate(folder.createdAt)}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted-foreground lg:flex">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 font-medium">
          <FileText className="h-3 w-3" />
          {filesLabel}
        </span>

        {/* Only the creator's initials are shown; the full name appears on hover. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`Created by ${createdBy}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-full bg-wissen-navy/10 text-[9px] font-semibold text-wissen-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40 dark:text-wissen-navy-light"
            >
              {initials}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">Created by {createdBy}</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span className="whitespace-nowrap">{formatDate(folder.createdAt)}</span>
        </div>
      </div>

      <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`More actions for ${folder.name}`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wissen-navy/40"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={runMenuAction(() => onClick?.())}>
                <Eye className="h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem
                id="rename-folder-button"
                data-testid="rename-folder-button"
                onClick={runMenuAction(() => onRename?.(folder))}
              >
                <Pencil className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                id="delete-folder-button"
                data-testid="delete-folder-button"
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
  );
}
