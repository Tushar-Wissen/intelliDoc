import React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function WorkspaceRequiredAction({ disabled, children }) {
  if (!disabled) return children;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={children.props.className?.split(/\s+/).includes('w-full') ? 'flex w-full' : 'inline-flex'}
            tabIndex={0}
          >
            {React.cloneElement(children, { disabled: true })}
          </span>
        </TooltipTrigger>
        <TooltipContent>You need to create a workspace first.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}