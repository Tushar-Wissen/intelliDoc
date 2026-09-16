import React from 'react';
import { Bot, X, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CopilotSidebar({ open, onOpenChange }) {
  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 sm:w-96 bg-card text-card-foreground border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight text-sm">Copilot</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        <div className="bg-muted/50 border border-border/50 p-3 rounded-xl rounded-tl-sm max-w-[85%] text-sm self-start text-foreground shadow-sm">
          Hello! I'm your AI assistant. How can I help you today?
        </div>
      </div>
      
      <div className="p-4 border-t border-border bg-muted/10">
        <div className="relative flex items-center">
          <Input placeholder="Ask Copilot..." className="pr-10 rounded-full bg-background shadow-sm" />
          <Button variant="ghost" size="icon" className="absolute right-1 h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
