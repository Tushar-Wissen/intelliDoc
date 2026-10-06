import React from 'react';

import { cn } from '@/lib/utils';
import documindIcon from '@/assets/documind-icon.svg';

// DocuMind lockup: icon mark + "Docu" (Wissen navy) "mind" (logo gradient).
export function BrandLogo({ className, iconClassName, textClassName }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img src={documindIcon} alt="" aria-hidden="true" className={cn('h-9 w-auto shrink-0', iconClassName)} />
      <span className={cn('font-display text-2xl font-extrabold tracking-tight', textClassName)}>
        <span className="text-wissen-navy dark:text-white">Docu</span>
        <span className="bg-gradient-to-r from-[#2563EB] to-[#4F8EF7] bg-clip-text dark:from-[#8DB8FF] dark:to-[#4F8EF7] text-transparent">
          mind
        </span>
      </span>
    </div>
  );
}
