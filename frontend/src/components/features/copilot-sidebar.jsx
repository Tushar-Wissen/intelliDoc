import React from 'react';
import { Bot, X, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CopilotSidebar({ open, onOpenChange }) {
  if (!open) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-80 sm:w-96 bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">Copilot</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        <div className="bg-muted p-3 rounded-lg rounded-tl-none max-w-[85%] text-sm self-start">
          Hello! I'm your AI assistant. How can I help you today?
        </div>
      </div>
      
      <div className="p-4 border-t border-border bg-background">
        <div className="relative">
          <Input placeholder="Type a message..." className="pr-10" />
          <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
