import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, X, Folder, Loader2, LogOut, ChevronRight, ChevronDown, Plus, FolderOpen } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NAV_ITEMS, WORKSPACE_UTILITY_ITEMS } from '@/constants/nav';
import { useFolders } from '@/context/folder-context';
import { CreateFolderDialog } from '@/components/features/create-folder-dialog';

function isNavItemActive(item, location) {
  if (item.comingSoon) return false;
  const [path, query] = item.to.split('?');
  if (location.pathname !== path) return false;
  if (path !== '/workspace') return true;
  const expectedView = new URLSearchParams(query).get('view');
  const currentView = new URLSearchParams(location.search).get('view');
  return currentView === expectedView;
}

function getInitials(user) {
  const name = user?.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return (user?.email?.[0] || '?').toUpperCase();
}

function NavLink({ item, onNavigate }) {
  const location = useLocation();
  const active = isNavItemActive(item, location);
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      id={item.testId}
      data-testid={item.testId}
      // "My Workspace" always resets any active folder view, even when clicked from
      // inside a folder (same /workspace path, so a plain Link wouldn't reset local state).
      state={item.key === 'workspace' ? { clearFolder: true } : undefined}
      onClick={(e) => {
        if (item.comingSoon) {
          e.preventDefault();
          return;
        }
        onNavigate?.();
      }}
      aria-current={active ? 'page' : undefined}
      aria-disabled={item.comingSoon || undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        item.comingSoon && 'cursor-default opacity-50',
        active
          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
          : !item.comingSoon && 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        item.comingSoon && 'text-sidebar-foreground/80'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.comingSoon && (
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/70">
          Soon
        </span>
      )}
    </Link>
  );
}

function FileRow({ file, folder, selected, onNavigate }) {
  const navigate = useNavigate();
  const sectionsCount = file.sections?.length ?? 0;

  return (
    <button
      type="button"
      data-testid={`file-item-${file.id}`}
      onClick={() => {
        navigate('/workspace', { state: { folderId: folder.id, fileId: file.id } });
        onNavigate?.();
      }}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-left transition-colors',
        selected ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50'
      )}
    >
      <FileText className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-current' : 'text-sidebar-foreground/50')} />
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12.5px]',
              selected ? 'font-medium text-current' : 'text-sidebar-foreground/75'
            )}
          >
            {file.name}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{file.name}</TooltipContent>
      </Tooltip>
      {sectionsCount > 0 && (
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-sidebar-foreground/60">
          {sectionsCount}
        </span>
      )}
    </button>
  );
}

function FolderNode({ folder, index, expanded, selected, selectedFileId, onToggle, onNavigate }) {
  const navigate = useNavigate();
  const hasFiles = folder.files?.length > 0;

  return (
    <div id={`folder-item-${folder.id}`} data-testid={`folder-item-${folder.id}`}>
      {/* The hover/selected background sits on the whole row (chevron slot included) so it lines up with the nav items. */}
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-lg pl-1 transition-colors hover:bg-sidebar-accent/60',
          selected && 'bg-sidebar-accent/60'
        )}
      >
        <button
          type="button"
          onClick={() => hasFiles && onToggle()}
          aria-label={hasFiles ? (expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`) : undefined}
          tabIndex={hasFiles ? 0 : -1}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/35 transition-colors',
            hasFiles ? 'hover:text-sidebar-foreground' : 'invisible'
          )}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            navigate('/workspace', { state: { folderId: folder.id } });
            onNavigate?.();
          }}
          aria-current={selected ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
        >
          <Folder className="h-4 w-4 shrink-0 text-sidebar-foreground/80" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-foreground/90">
                {folder.name}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{folder.name}</TooltipContent>
          </Tooltip>
          {!expanded && folder.filesCount > 0 && (
            <span className="shrink-0 text-[11px] tabular-nums text-sidebar-foreground/35">{folder.filesCount}</span>
          )}
        </button>
      </div>

      {expanded && hasFiles && (
        <div className="ml-[27px] flex flex-col gap-0.5 border-l border-sidebar-border pb-1 pl-2">
          {folder.files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              folder={folder}
              selected={file.id === selectedFileId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FoldersSection({ onNavigate }) {
  const { folders, loading, error, selectedFolderId, selectedFileId, refreshFolders } = useFolders();
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const total = folders.length;

  // Expand the selected folder (e.g. one that was just created) when it has files to show.
  useEffect(() => {
    const selected = folders.find((f) => f.id === selectedFolderId);
    if (!selected?.files?.length) return;
    setExpandedFolderIds((prev) => (prev.has(selected.id) ? prev : new Set(prev).add(selected.id)));
  }, [folders, selectedFolderId]);

  const toggleFolder = (folderId) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">Folders</h2>
            {total > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold tabular-nums text-sidebar-foreground/70">
                {total}
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            id="sidebar-create-folder-button"
            data-testid="sidebar-create-folder-button"
            aria-label="Create folder"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div
          id="folder-list"
          data-testid="folder-list"
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2 scrollbar-thin"
        >
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-sidebar-foreground/30" />
            </div>
          ) : error && folders.length === 0 ? (
            <div className="px-2 py-3 text-center text-[12px]">
              <p className="text-red-300">{error.message}</p>
              <button
                type="button"
                className="mt-1 font-medium text-indigo-300 underline-offset-4 hover:text-indigo-200 hover:underline"
                onClick={() => refreshFolders().catch(() => {})}
              >
                Try again
              </button>
            </div>
          ) : folders.length === 0 ? (
            <div className="mt-1 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-4 text-center">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-white/10 text-sidebar-foreground">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm">
                  <Plus className="h-3 w-3" />
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-[0.92rem] font-bold leading-none tracking-[-0.03em] text-sidebar-foreground">
                  No folders yet
                </h3>
                <p className="max-w-[210px] text-[0.72rem] leading-[1.3] text-sidebar-foreground/65">
                  Create your first folder to keep related documents organized and ready for AI-powered review.
                </p>
              </div>

              <Button
                type="button"
                className="w-full gap-2 bg-white text-xs font-semibold text-wissen-navy hover:bg-white/90"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Create Folder
              </Button>
            </div>
          ) : (
            folders.map((folder, idx) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                index={idx}
                expanded={expandedFolderIds.has(folder.id)}
                selected={folder.id === selectedFolderId}
                selectedFileId={selectedFileId}
                onToggle={() => toggleFolder(folder.id)}
                onNavigate={onNavigate}
              />
            ))
          )}

          {!loading && folders.length > 0 && (
            <Link
              to="/workspace"
              // Same as the "My Workspace" nav link: land on the workspace overview, not an open folder.
              state={{ clearFolder: true }}
              onClick={() => onNavigate?.()}
              className="mt-1 flex items-center gap-1 rounded-lg px-2.5 py-1.5 pl-8 text-xs font-semibold text-indigo-300 hover:bg-sidebar-accent/60 hover:text-indigo-200"
            >
              View all folders
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function SidebarBody({ onNavigate, scrollContainerRef }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-sm font-bold tracking-tight">IntelliDoc</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">AI Document Platform</p>
          </div>
        </div>

        <nav className="space-y-1 px-3 pt-4">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.key} item={item} onNavigate={onNavigate} />
          ))}
        </nav>

        <Separator className="my-4 bg-sidebar-border" />

        <FoldersSection onNavigate={onNavigate} />

        <div className="space-y-1 border-t border-sidebar-border px-3 py-2">
          {WORKSPACE_UTILITY_ITEMS.map((item) => (
            <NavLink key={item.key} item={item} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-3 py-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-indigo-500 text-xs font-semibold text-white">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">{user?.fullName || 'My account'}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">{user?.email}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function Sidebar() {
  const sidebarScrollRef = useRef(null);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
      <div className="sticky top-0 h-screen">
        <SidebarBody scrollContainerRef={sidebarScrollRef} />
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onOpenChange }) {
  const sidebarScrollRef = useRef(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative h-full w-64 border-r border-sidebar-border shadow-xl animate-in slide-in-from-left duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        <SidebarBody onNavigate={() => onOpenChange(false)} scrollContainerRef={sidebarScrollRef} />
      </div>
    </div>
  );
}
