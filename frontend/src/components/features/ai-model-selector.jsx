import React from 'react';
import { Check, ChevronDown, Layers } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AI_MODELS } from '@/constants/ai-models';
import { cn } from '@/lib/utils';

function ModelIcon({ model, className }) {
  const Icon = model.icon;
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-xl', model.tint, className)}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function SelectedPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-wissen-navy/20 bg-wissen-navy/5 px-2 py-0.5 text-[11px] font-medium text-wissen-navy dark:border-wissen-navy-light/40 dark:text-wissen-navy-light">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Selected
    </span>
  );
}

// Compact switcher that lives in the chat header, so the assistant can be changed mid-chat.
export function AiModelDropdown({ model, onSelect, disabled }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="ai-model-dropdown-trigger"
        data-testid="ai-model-dropdown-trigger"
        disabled={disabled}
        className="flex max-w-[11rem] items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1 pr-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label={`AI model: ${model.label}. Change model`}
      >
        <ModelIcon model={model} className="h-6 w-6 rounded-full [&_svg]:h-3.5 [&_svg]:w-3.5" />
        <span className="truncate">{model.label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em]">
          <Layers className="h-3.5 w-3.5" />
          Select AI model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AI_MODELS.map((option) => {
          const selected = option.id === model.id;
          return (
            <DropdownMenuItem
              key={option.id}
              data-testid={`ai-model-option-${option.id}`}
              onSelect={() => onSelect(option.id)}
              className={cn('gap-3 rounded-lg px-2 py-2', selected && 'bg-wissen-navy/5')}
            >
              <ModelIcon model={option} className="h-8 w-8" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{option.providerName}</span>
                <span className="truncate text-xs text-muted-foreground">{option.label}</span>
              </div>
              {selected && <Check className="text-wissen-navy dark:text-wissen-navy-light" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Provider cards shown before a conversation starts, so the user picks an assistant first.
export function AiModelCards({ model, onSelect }) {
  return (
    <div id="ai-model-cards" role="radiogroup" aria-label="AI model" className="flex flex-col gap-2">
      {AI_MODELS.map((option) => {
        const selected = option.id === model.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`ai-model-card-${option.id}`}
            onClick={() => onSelect(option.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-wissen-navy shadow-sm ring-1 ring-wissen-navy dark:border-wissen-navy-light dark:ring-wissen-navy-light'
                : 'border-border hover:border-wissen-navy/30 hover:bg-muted/30'
            )}
          >
            <ModelIcon model={option} className="h-9 w-9" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">{option.providerName}</span>
              <span className="truncate text-xs text-muted-foreground">{option.description}</span>
            </div>
            {selected && <SelectedPill />}
          </button>
        );
      })}
    </div>
  );
}

export { ModelIcon };
