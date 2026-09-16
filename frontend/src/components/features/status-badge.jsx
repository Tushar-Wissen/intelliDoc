import React from 'react';

import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS = {
  POSITIVE: 'success',
  COMPLETED: 'success',
  NEUTRAL: 'secondary',
  PROCESSING: 'secondary',
  NEGATIVE: 'destructive',
  FAILED: 'destructive',
};

export function StatusBadge({ value, className }) {
  if (!value) return null;
  return (
    <Badge variant={STATUS_VARIANTS[value] || 'secondary'} className={`lowercase ${className || ''}`}>
      {value.toLowerCase()}
    </Badge>
  );
}
