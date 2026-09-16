import React from 'react';
import { BrainCircuit, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from '@/constants/nav';

function NavLink({ item, active, onNavigate }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      onClick={(e) => {
        e.preventDefault();
        if (item.comingSoon) return;
        onNavigate?.(item.view ?? item.key);
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.comingSoon && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Soon
        </span>
      )}
    </a>
  );
}

function SidebarBody({ onUploadClick, activeView, onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm">
          <BrainCircuit className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">IntelliDoc</p>
          <p className="text-xs text-muted-foreground">AI Document Platform</p>
        </div>
      </div>

      <div className="px-3">
        <Button className="w-full justify-center gap-2" onClick={onUploadClick}>
          <Plus className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <Separator className="my-4 bg-sidebar-border" />

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={!item.comingSoon && (item.view ?? item.key) === activeView}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="space-y-1 px-3 pb-4">
        {NAV_FOOTER_ITEMS.map((item) => (
          <NavLink key={item.key} item={item} active={false} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function Sidebar({ onUploadClick, activeView, onNavigate }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
      <div className="sticky top-0 h-screen">
        <SidebarBody onUploadClick={onUploadClick} activeView={activeView} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onOpenChange, onUploadClick, activeView, onNavigate }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative h-full w-64 border-r border-sidebar-border shadow-xl animate-in slide-in-from-left duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        <SidebarBody
          onUploadClick={() => {
            onOpenChange(false);
            onUploadClick?.();
          }}
          activeView={activeView}
          onNavigate={(view) => {
            onOpenChange(false);
            onNavigate?.(view);
          }}
        />
      </div>
    </div>
  );
}
