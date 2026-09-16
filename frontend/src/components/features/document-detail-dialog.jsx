import React from 'react';
import { Sparkles, MessageSquare, Send, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/features/status-badge';

export function DocumentDetailDialog({
  document,
  open,
  onOpenChange,
  question,
  onQuestionChange,
  qaLoading,
  qaResult,
  onAskQuestion,
}) {
  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {document.title}
              </DialogTitle>
              <DialogDescription>Document ID: {document.id}</DialogDescription>
            </div>
            <StatusBadge value={document.sentiment} />
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Executive AI Summary
              </p>
              <p className="text-sm leading-relaxed">
                {document.summary || 'AI summarization processing in progress...'}
              </p>
              {document.confidenceScore != null && (
                <p className="mt-2 text-xs text-primary">
                  Model confidence: {(document.confidenceScore * 100).toFixed(0)}%
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Extracted Entities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {document.entities?.length > 0 ? (
                    document.entities.map((entity, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                      >
                        {entity}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">None detected</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Key Topics
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {document.keyTopics?.length > 0 ? (
                    document.keyTopics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-600 dark:text-sky-400"
                      >
                        {topic}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">General</span>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" />
                Interactive Smart Q&amp;A
              </p>

              <form onSubmit={onAskQuestion} className="flex gap-2">
                <Input
                  placeholder="Ask a question about this document context..."
                  value={question}
                  onChange={(e) => onQuestionChange(e.target.value)}
                  required
                />
                <Button type="submit" size="icon" disabled={qaLoading} className="shrink-0">
                  {qaLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>

              {qaResult && (
                <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="mb-1 text-xs text-muted-foreground">Q: {qaResult.question}</p>
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold">Answer:</span> {qaResult.answer}
                  </p>
                  <p className="mt-2 text-xs text-primary">
                    Confidence: {(qaResult.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
