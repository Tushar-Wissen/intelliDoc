import React, { useEffect } from 'react';
import { Sparkles, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToastNotification({
  open,
  onClose,
  title = 'All set!',
  message = 'We’ve got your files and are working on them right now. Sit tight—the details will appear shortly.',
  duration = 6000,
}) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-background/95 p-4 shadow-2xl backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
              <Clock className="h-3 w-3" /> Processing
            </span>
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
