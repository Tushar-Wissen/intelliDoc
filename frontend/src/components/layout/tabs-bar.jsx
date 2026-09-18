import React, { useRef, useEffect } from 'react';
import { X, FileText, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import copilotIcon from '@/assets/copilot-icon.png';

const TAG_ICON_COLORS = {
  finance: 'text-blue-500',
  technical: 'text-emerald-500',
  compliance: 'text-amber-500',
  governance: 'text-violet-500',
  legal: 'text-rose-500',
  product: 'text-sky-500',
  security: 'text-orange-500',
  operations: 'text-slate-500',
};

export function TabsBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onUploadClick,
  onCopilotClick,
  copilotOpen,
}) {
  const activeTabRef = useRef(null);

  /* Auto-scroll the active tab into view when it changes */
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId]);

  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="relative flex items-stretch justify-between border-b border-border bg-muted/30">
      <div
        className="scrollbar-none flex flex-1 items-stretch overflow-x-auto min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const iconColor = TAG_ICON_COLORS[tab.tag] || 'text-muted-foreground';

          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              className={cn(
                'group relative flex shrink-0 items-center gap-2 border-r border-border/40 px-3 py-2 text-[13px] font-medium transition-all select-none',
                isActive
                  ? 'bg-background text-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground/80',
              )}
            >
              {/* Active top accent line */}
              {isActive && (
                <span className="absolute inset-x-0 top-0 h-[2px] rounded-b-sm bg-primary" />
              )}
              {/* Erase the parent bottom border so active tab "connects" to content */}
              {isActive && (
                <span className="absolute inset-x-0 bottom-[-1px] h-px bg-background" />
              )}

              <FileText className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />

              <span className="max-w-[140px] truncate">{tab.name}</span>

              {/* Unsaved/update dot */}
              {tab.hasUpdates && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              )}

              {/* Close button – always visible on active tab, hover-only on inactive */}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={cn(
                  'ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors',
                  isActive
                    ? 'text-muted-foreground/60 hover:bg-foreground/10 hover:text-foreground'
                    : 'text-transparent group-hover:text-muted-foreground/60 group-hover:hover:bg-foreground/10 group-hover:hover:text-foreground',
                )}
                aria-label={`Close ${tab.name}`}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Actions at the end of the tabs row */}
      {(onUploadClick || onCopilotClick) && (
        <div className="flex shrink-0 items-center gap-2 border-l border-border/40 px-2.5 py-1">
          {onUploadClick && (
            <Button
              size="sm"
              onClick={onUploadClick}
              className="h-7 gap-1.5 px-2.5 text-xs font-medium shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Upload</span>
            </Button>
          )}

          {onCopilotClick && (
            <button
              type="button"
              onClick={onCopilotClick}
              title={copilotOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer',
                copilotOpen
                  ? 'bg-primary/20 ring-1 ring-primary/40 shadow-sm'
                  : 'bg-primary/10 hover:bg-primary/20'
              )}
              aria-label="Toggle AI Assistant"
            >
              <img src={copilotIcon} alt="AI Assistant" className="h-4.5 w-4.5 object-contain" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
