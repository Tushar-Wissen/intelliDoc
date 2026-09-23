import React, { useState } from 'react';
import { ChevronDown, Check, Plus, Settings } from 'lucide-react';

import { useWorkspace } from '@/context/workspace-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateWorkspaceDialog } from '@/components/features/create-workspace-dialog';

function getInitials(name) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function WorkspaceSelector() {
  const { workspaces, selectedWorkspace, loading, error, selectWorkspace, refreshWorkspaces } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);

  const triggerLabel = selectedWorkspace?.name ?? (loading ? 'Loading...' : 'No workspace');

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="workspace-selector-trigger"
            variant="ghost"
            className="max-w-[10rem] gap-2 px-2 hover:bg-wissen-navy/10 hover:text-wissen-navy data-[state=open]:bg-wissen-navy/10 data-[state=open]:text-wissen-navy dark:hover:bg-wissen-navy-light/15 dark:hover:text-wissen-navy-light dark:data-[state=open]:bg-wissen-navy-light/15 dark:data-[state=open]:text-wissen-navy-light sm:max-w-[16rem]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10 text-[11px] font-semibold text-wissen-navy dark:text-wissen-navy-light">
              {getInitials(selectedWorkspace?.name)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Workspaces returned by the API; scrolls once the list gets long. */}
          <div
            id="workspace-list"
            data-testid="workspace-list"
            role="group"
            className="max-h-64 overflow-y-auto"
          >
            {workspaces.map((workspace) => {
              const isSelected = workspace.id === selectedWorkspace?.id;
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  id={`workspace-item-${workspace.id}`}
                  data-testid={`workspace-item-${workspace.id}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className="justify-between focus:bg-wissen-navy/10 focus:text-wissen-navy dark:focus:bg-wissen-navy-light/15 dark:focus:text-wissen-navy-light"
                  onSelect={() => selectWorkspace(workspace.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10 text-[10px] font-semibold text-wissen-navy dark:text-wissen-navy-light">
                      {getInitials(workspace.name)}
                    </span>
                    <span className="truncate">{workspace.name}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />}
                </DropdownMenuItem>
              );
            })}

            {workspaces.length === 0 && loading && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading workspaces...</p>
            )}
            {workspaces.length === 0 && !loading && !error && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No workspaces yet</p>
            )}
            {workspaces.length === 0 && !loading && error && (
              <div className="px-2 py-1.5 text-sm">
                <p className="text-destructive">{error.message}</p>
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-wissen-navy underline-offset-4 hover:underline dark:text-wissen-navy-light"
                  onClick={() => refreshWorkspaces().catch(() => {})}
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            id="workspace-create-button"
            data-testid="workspace-create-button"
            className="focus:bg-wissen-navy/10 focus:text-wissen-navy dark:focus:bg-wissen-navy-light/15 dark:focus:text-wissen-navy-light"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create Workspace
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="h-4 w-4" />
            Manage Workspaces
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Soon
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selection of the new workspace is handled by the workspace context on success. */}
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
