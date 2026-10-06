import React from 'react';

import { cn } from '@/lib/utils';

function statusStyles(value) {
  const normalized = String(value || '').toUpperCase();

  if (['READY', 'COMPLETED', 'POSITIVE'].includes(normalized)) {
    return 'bg-success/10 text-success';
  }

  if (['FAILED', 'NEGATIVE'].includes(normalized)) {
    return 'bg-destructive/10 text-destructive';
  }

  if (['PARSING', 'PROCESSING', 'EXTRACTING', 'INDEXING', 'ACTIVE'].includes(normalized)) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }

  if (normalized === 'NEUTRAL') {
    return 'bg-secondary text-secondary-foreground';
  }

  if (normalized === 'ARCHIVED') {
    return 'bg-muted text-muted-foreground';
  }

  return 'bg-secondary text-secondary-foreground';
}

export function StatusBadge({ value, className }) {
  if (value == null || value === '') return null;

  const label = String(value).toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize leading-none',
        statusStyles(value),
        className
      )}
    >
      {label}
    </span>
  );
}
