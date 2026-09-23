import React from 'react';
import { Sparkles, FileText, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const DEFAULT_FEATURES = [
  { icon: FileText, label: 'Organize your documents' },
  { icon: Sparkles, label: 'Get AI-powered insights' },
  { icon: Users, label: 'Collaborate with your team' },
];

export function EmptyWorkspaceState({
  icon: Icon,
  heading,
  description,
  ctaLabel,
  ctaIcon: CtaIcon,
  onCtaClick,
  ctaTestId,
  features = DEFAULT_FEATURES,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center gap-8 text-center', className)}>
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-wissen-navy/10">
          <Icon className="h-11 w-11 text-wissen-navy dark:text-wissen-navy-light" />
        </div>
        <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-wissen-navy text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">{heading}</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>

      <Button
        data-testid={ctaTestId}
        size="lg"
        className="gap-2 bg-wissen-navy px-6 text-white hover:bg-wissen-navy/90"
        onClick={onCtaClick}
      >
        <CtaIcon className="h-4 w-4" />
        {ctaLabel}
      </Button>

      <div className="grid w-full max-w-lg grid-cols-1 gap-6 pt-4 sm:grid-cols-3">
        {features.map(({ icon: FeatureIcon, label }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <FeatureIcon className="h-4 w-4 text-muted-foreground" />
            </span>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
