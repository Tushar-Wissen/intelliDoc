import React, { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

// Indicative stages shown while waiting for the first token. The API doesn't report real
// progress, so they advance on a timer and the last one holds until the answer starts.
const STAGES = [
  { label: 'Understanding your question', at: 0 },
  { label: 'Searching relevant sections', at: 1.2 },
  { label: 'Composing the answer', at: 3.5 },
];

const SHIMMER_LINE =
  'h-2 rounded-full bg-[linear-gradient(90deg,hsl(var(--muted))_0%,rgba(29,48,90,0.18)_50%,hsl(var(--muted))_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none';

export function ShimmerLoader({ modelLabel }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => clearInterval(id);
  }, []);

  const activeIndex = STAGES.reduce((acc, stage, idx) => (elapsed >= stage.at ? idx : acc), 0);

  return (
    <div className="flex max-w-[85%] items-start gap-2.5 self-start animate-fade-in" role="status" aria-live="polite">
      {/* Avatar with a soft "breathing" ring while the model works. */}
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-wissen-navy/20 motion-reduce:animate-none" />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      </span>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="w-60 rounded-xl rounded-tl-sm border border-border/60 bg-card p-3.5 shadow-sm">
          <ol className="flex flex-col gap-2">
            {STAGES.map((stage, idx) => {
              const done = idx < activeIndex;
              const active = idx === activeIndex;
              return (
                <li
                  key={stage.label}
                  className={cn(
                    'flex items-center gap-2 text-xs transition-colors duration-300',
                    done && 'text-muted-foreground',
                    active && 'font-medium text-foreground',
                    !done && !active && 'text-muted-foreground/50'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                      done && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                      active && 'text-wissen-navy dark:text-wissen-navy-light',
                      !done && !active && 'border border-border'
                    )}
                  >
                    {done ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                  </span>
                  {stage.label}
                  {active && (
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-current" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-3.5 flex flex-col gap-2 border-t border-border/60 pt-3.5" aria-hidden="true">
            <div className={cn(SHIMMER_LINE, 'w-full')} />
            <div className={cn(SHIMMER_LINE, 'w-4/5 [animation-delay:0.15s]')} />
            <div className={cn(SHIMMER_LINE, 'w-3/5 [animation-delay:0.3s]')} />
          </div>
        </div>

        <p className="pl-1 text-[11px] tabular-nums text-muted-foreground">
          {modelLabel ? `${modelLabel} is thinking` : 'Thinking'}
          {elapsed >= 2 && <> &middot; {Math.floor(elapsed)}s</>}
        </p>
      </div>
    </div>
  );
}
