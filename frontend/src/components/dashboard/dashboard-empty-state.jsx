import React from 'react';
import { FileText, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Stacked-document illustration: a tilted sheet behind a front sheet with text lines.
function DocumentsIllustration() {
  return (
    <div className="relative h-20 w-20">
      <div className="absolute left-1 top-2 h-16 w-12 -rotate-12 rounded-lg border border-border bg-card shadow-sm transition-transform duration-300 group-hover:-rotate-[16deg]" />
      <div className="absolute left-5 top-0 flex h-[4.5rem] w-14 flex-col gap-1.5 rounded-lg border border-wissen-navy/15 bg-card p-2.5 shadow-md transition-transform duration-300 group-hover:-translate-y-1">
        <FileText className="h-4 w-4 text-wissen-navy dark:text-wissen-navy-light" />
        <span className="h-1 w-full rounded-full bg-wissen-navy/15" />
        <span className="h-1 w-4/5 rounded-full bg-wissen-navy/10" />
        <span className="h-1 w-3/5 rounded-full bg-wissen-navy/10" />
      </div>
      <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm ring-4 ring-card">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

export function DashboardEmptyState({ title, description, actionLabel, actionIcon: ActionIcon, onAction, className }) {
  return (
    <div
      className={cn(
        'group flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors',
        'hover:border-wissen-navy/30 hover:bg-wissen-navy/[0.03] dark:hover:border-wissen-navy-light/40',
        className
      )}
    >
      <DocumentsIllustration />
      <div className="flex max-w-sm flex-col gap-1.5">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-wissen-navy/20 text-wissen-navy hover:bg-wissen-navy hover:text-white dark:text-wissen-navy-light"
          onClick={onAction}
        >
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
