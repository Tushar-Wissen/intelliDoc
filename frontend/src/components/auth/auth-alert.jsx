import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Inline form-level feedback. `tone="error"` announces as an alert,
 * `tone="success"` announces politely via role="status".
 */
const TONE_CLASSES = {
  error: 'text-destructive',
  success: 'text-success',
  info: 'text-muted-foreground',
};

export function AuthAlert({ id, message, tone = 'error' }) {
  if (!message) return null;
  return (
    <p id={id} role={tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', TONE_CLASSES[tone])}>
      {message}
    </p>
  );
}
