import React from 'react';

import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/auth/field-error';

/**
 * Label + control + field-level error, wired together by `id`.
 * The error paragraph rendered here is `${id}-error`, so any control
 * passed as `children` should set `aria-describedby` to that same id.
 */
export function AuthFormField({ id, label, error, action, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
