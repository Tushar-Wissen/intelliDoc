import React from 'react';

export function ShimmerLoader() {
  return (
    <div className="bg-muted/50 border border-border/50 p-3.5 rounded-xl rounded-tl-sm max-w-[85%] w-48 text-sm self-start shadow-sm flex flex-col gap-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-muted-foreground animate-pulse">Analyzing...</span>
      </div>
      <div className="h-2 w-full bg-primary/20 rounded-full animate-pulse"></div>
      <div className="h-2 w-4/5 bg-primary/20 rounded-full animate-pulse delay-75"></div>
      <div className="h-2 w-3/5 bg-primary/20 rounded-full animate-pulse delay-150"></div>
    </div>
  );
}
