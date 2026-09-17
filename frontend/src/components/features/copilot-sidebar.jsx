import React, { useState } from 'react';
import { Bot, X, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShimmerLoader } from '@/components/ui/shimmer-loader';

export function CopilotSidebar({ open, onOpenChange }) {
  const [messages, setMessages] = useState([
    { text: "Hello! I'm your AI assistant. How can I help you today?", isUser: false }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const newMsg = inputText.trim();
    setMessages(prev => [...prev, { text: newMsg, isUser: true }]);
    setInputText("");
    setIsLoading(true);

    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: newMsg })
      });
    } catch (error) {
      console.error("Failed to send message", error);
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 sm:w-96 bg-card text-card-foreground border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight text-sm">IntelliDoc AI Assistant</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onOpenChange(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl max-w-[85%] text-sm shadow-sm ${msg.isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm self-end"
              : "bg-muted/50 border border-border/50 rounded-tl-sm self-start text-foreground"
              }`}
          >
            {msg.text}
          </div>
        ))}
        {isLoading && <ShimmerLoader />}
      </div>

      <div className="p-4 border-t border-border bg-muted/10">
        <div className="relative flex items-center">
          <Input
            placeholder="Ask Copilot..."
            className="pr-10 rounded-full bg-background shadow-sm"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={handleSend}
            disabled={isLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
