import React from 'react';
import { FolderInput, MoreHorizontal, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { getFileTypeMeta } from '@/lib/file-types';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/features/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OrphanedFileRow({ file, selected, onToggleSelect, onMoveToFolder, onDelete }) {
  const { Icon, label, className: typeClassName } = getFileTypeMeta(file.name);

  return (
    <tr
      id={`orphaned-file-card-${file.id}`}
      data-testid={`orphaned-file-card-${file.id}`}
      className={cn('transition-colors hover:bg-accent/40', selected && 'bg-wissen-navy/5')}
    >
      <td className="w-10 py-3 pl-4 pr-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(file.id)}
          aria-label={`Select ${file.name}`}
          className="h-4 w-4 cursor-pointer rounded border-input accent-wissen-navy"
        />
      </td>

      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', typeClassName)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-card-foreground">{file.name}</p>
            <p className="truncate text-xs text-muted-foreground sm:hidden">{label}</p>
          </div>
        </div>
      </td>

      <td className="hidden px-3 py-3 sm:table-cell">
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', typeClassName)}>
          {label}
        </span>
      </td>

      <td className="hidden px-3 py-3 md:table-cell">
        <StatusBadge value={file.status} />
      </td>

      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-muted-foreground lg:table-cell">
        {formatDateTime(file.createdAt)}
      </td>

      <td className="py-3 pl-3 pr-4">
        <div className="flex items-center justify-end gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label={`More actions for ${file.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMoveToFolder([file.id])}>
                <FolderInput className="h-4 w-4" />
                Move to folder
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={() => onDelete(file)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
