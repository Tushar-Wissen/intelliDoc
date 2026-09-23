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
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function WorkspaceSelector() {
  const { workspaceName, setWorkspaceName } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);

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
              {getInitials(workspaceName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{workspaceName}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="justify-between focus:bg-wissen-navy/10 focus:text-wissen-navy dark:focus:bg-wissen-navy-light/15 dark:focus:text-wissen-navy-light"
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-wissen-navy/10 text-[10px] font-semibold text-wissen-navy dark:text-wissen-navy-light">
                {getInitials(workspaceName)}
              </span>
              <span className="truncate">{workspaceName}</span>
            </span>
            <Check className="h-4 w-4 shrink-0 text-wissen-navy dark:text-wissen-navy-light" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            id="create-workspace-menu-item"
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

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(workspace) => setWorkspaceName(workspace.name)}
      />
    </>
  );
}
