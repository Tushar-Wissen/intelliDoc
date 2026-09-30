import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Password field with a built-in show/hide toggle. Each instance owns
 * its own visibility state, so multiple password fields on one form
 * (e.g. password + confirm password) can be revealed independently.
 */
export const PasswordInput = React.forwardRef(function PasswordInput({ id, error, className, ...inputProps }, ref) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <div className="relative">
      <Input
        id={inputId}
        ref={ref}
        type={visible ? 'text' : 'password'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn('h-12 pr-10 text-base', className)}
        {...inputProps}
      />
      <Button
        id={`${inputId}-toggle-visibility`}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
});
