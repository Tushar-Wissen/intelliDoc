import React, { useRef, useState } from 'react';
import { Folder, FolderOpen, Check, ChevronDown, Search, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { colorForFolder } from '@/lib/folder-colors';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Optional folder picker. `value` is a folder id, or null for "no folder".
export function FolderSelect({
  id,
  label = 'Folder',
  folders,
  value,
  onChange,
  loading = false,
  error = null,
  disabled = false,
  noneLabel = 'No folder',
}) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);

  const selectedIndex = folders.findIndex((f) => f.id === value);
  const selectedFolder = selectedIndex === -1 ? null : folders[selectedIndex];
  const selectedColor = selectedFolder ? colorForFolder(selectedFolder, selectedIndex) : null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFolders = folders.filter((folder) => folder.name?.toLowerCase().includes(normalizedQuery));

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <DropdownMenu onOpenChange={(next) => { if (!next) setQuery(''); }}>
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            data-testid={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between bg-background font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedFolder ? (
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', selectedColor.bg)}>
                  <Folder className={cn('h-3 w-3', selectedColor.fg)} />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FolderOpen className="h-3 w-3" />
                </span>
              )}
              <span className={cn('truncate', !selectedFolder && 'text-muted-foreground')}>
                {selectedFolder ? selectedFolder.name : noneLabel}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto"
          style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchInputRef.current?.focus();
          }}
        >
          <div className="relative px-2 py-1.5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search folders..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid={`${id}-option-none`}
            className="gap-2"
            onClick={() => onChange(null)}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FolderOpen className="h-3 w-3" />
            </span>
            <span className="flex-1 truncate">{noneLabel}</span>
            {value === null && <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />}
          </DropdownMenuItem>

          {loading ? (
            <p className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading folders...
            </p>
          ) : error && folders.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-destructive">Could not load folders.</p>
          ) : filteredFolders.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {query ? `No folders match "${query}".` : 'No folders yet.'}
            </p>
          ) : (
            filteredFolders.map((folder) => {
              const color = colorForFolder(folder, folders.findIndex((f) => f.id === folder.id));
              return (
                <DropdownMenuItem
                  key={folder.id}
                  data-testid={`${id}-option-${folder.id}`}
                  className="gap-2"
                  onClick={() => onChange(folder.id)}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', color.bg)}>
                    <Folder className={cn('h-3 w-3', color.fg)} />
                  </span>
                  <span className="flex-1 truncate">{folder.name}</span>
                  {value === folder.id && (
                    <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
