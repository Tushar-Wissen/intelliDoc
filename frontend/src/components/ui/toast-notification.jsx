import React, { useEffect } from 'react';
import { Sparkles, X, Clock, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// `processing` is the original look; `success`, `warning` and `error` are for plain outcome
// messages and drop the "Processing" badge.
const VARIANTS = {
  processing: {
    icon: Sparkles,
    iconClassName: 'animate-pulse',
    border: 'border-primary/20',
    iconBox: 'bg-primary/10 text-primary',
    role: 'status',
  },
  success: {
    icon: CheckCircle2,
    border: 'border-success/30',
    iconBox: 'bg-success/10 text-success',
    role: 'status',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-amber-500/30',
    iconBox: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    role: 'status',
  },
  error: {
    icon: AlertCircle,
    border: 'border-destructive/30',
    iconBox: 'bg-destructive/10 text-destructive',
    role: 'alert',
  },
};

export function ToastNotification({
  open,
  onClose,
  variant = 'processing',
  title = 'All set!',
  message = 'We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.',
  duration = 6000,
  testId,
}) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;

  const config = VARIANTS[variant] || VARIANTS.processing;
  const Icon = config.icon;

  return (
    <div
      role={config.role}
      data-testid={testId}
      className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border bg-background/95 p-4 shadow-2xl backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10',
          config.border
        )}
      >
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', config.iconBox)}>
          <Icon className={cn('h-5 w-5', config.iconClassName)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            {variant === 'processing' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
                <Clock className="h-3 w-3" /> Processing
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
