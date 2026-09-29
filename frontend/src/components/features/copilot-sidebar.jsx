import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Send, AlertCircle, FolderOpen } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShimmerLoader } from '@/components/ui/shimmer-loader';
import { chatApi } from '@/lib/chat-api';

const DEFAULT_GREETING = (tabName) =>
  `Hello! I'm your AI assistant${tabName ? ` for **${tabName}**` : ''}. How can I help you today?`;

export function CopilotSidebar({
  activeTabId,
  activeTabName,
  subtitle,
  placeholder,
  chatHistories,
  onUpdateHistory,
  workspaceId,
  // disabled=true hides the chat UI and shows an empty-state prompt instead
  disabled = false,
}) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const messagesEndRef = useRef(null);

  const currentKey = activeTabId || 'general';

  // Messages for the current tab, or the greeting if none yet
  const messages = chatHistories[currentKey] ?? [
    { text: DEFAULT_GREETING(activeTabName), isUser: false },
  ];

  // chatSessionId for the current context key, stored in a ref-map so it persists
  // across re-renders without triggering effects.
  const sessionIds = useRef({});

  // AbortController for any in-flight SSE stream.
  const streamController = useRef(null);

  // Clear input + session states whenever we switch tabs
  useEffect(() => {
    setInputText('');
    setSessionLoading(false);
    setSessionError(null);
  }, [activeTabId]);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  /**
   * 9.5 — Create chat session as soon as the sidebar opens for a context.
   * Runs once per (workspaceId + currentKey) pair; re-runs if the workspace changes.
   * Skipped when the sidebar is disabled (no folders yet).
   */
  useEffect(() => {
    if (!workspaceId || disabled) return;

    // Already have a session for this context, nothing to do.
    if (sessionIds.current[currentKey]) return;

    setSessionError(null);
    setSessionLoading(true);

    const label = activeTabName
      ? `Chat \u2013 ${activeTabName}`
      : 'Workspace chat';

    chatApi
      .createSession(workspaceId, label)
      .then((session) => {
        sessionIds.current[currentKey] = session.id;
      })
      .catch((err) => {
        console.error('[CopilotSidebar] Failed to create chat session:', err);
        setSessionError(err.message || 'Could not start a chat session.');
      })
      .finally(() => {
        setSessionLoading(false);
      });
  }, [workspaceId, currentKey, activeTabName, disabled]);

  // Cancel any ongoing stream when switching context.
  useEffect(() => {
    return () => {
      streamController.current?.abort();
    };
  }, [currentKey]);

  /**
   * 9.6 — Ask a question via SSE stream.
   * Appends user message immediately, then streams assistant tokens into a growing
   * assistant bubble, and finally calls 9.7 to sync the persisted session.
   */
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isLoading || sessionLoading || disabled) return;

    const sessionId = sessionIds.current[currentKey];
    // Guard: session must exist before sending (input is disabled while loading,
    // but defend in case of a race)
    if (!sessionId) return;

    const question = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setSessionError(null);

    // Append the user's message immediately
    const withUser = [...messages, { text: question, isUser: true }];
    onUpdateHistory(currentKey, withUser);

    // Placeholder for the streaming assistant reply
    let assistantText = '';

    const appendAssistant = (next) => {
      onUpdateHistory(currentKey, [
        ...withUser,
        { text: next, isUser: false },
      ]);
    };

    // Cancel any previous stream
    streamController.current?.abort();

    streamController.current = chatApi.askQuestion(sessionId, question, {
      // 9.6 SSE — token event
      onToken: (token) => {
        assistantText += token;
        appendAssistant(assistantText);
      },

      // 9.6 SSE — done event
      onDone: async (_messageId) => {
        // Finalize loading state
        setIsLoading(false);

        // 9.7 — GET /chat-sessions/{id} to confirm persisted session
        try {
          await chatApi.getSession(sessionId);
          // Session verified; messages are already showing from the stream.
        } catch (err) {
          console.warn('[CopilotSidebar] Could not verify session after message:', err);
        }
      },

      // 9.6 SSE — error event
      onError: (err) => {
        console.error('[CopilotSidebar] Stream error:', err);
        if (!assistantText) {
          // Nothing was streamed — show an error bubble
          appendAssistant('Sorry, something went wrong. Please try again.');
        }
        setIsLoading(false);
        setSessionError(err.message || 'The AI response could not be received.');
      },
    });
  }, [inputText, isLoading, sessionLoading, currentKey, messages, onUpdateHistory, disabled]);

  return (
    <div
      id="copilot-sidebar-panel"
      className="absolute top-0 right-0 h-full w-80 sm:w-96 bg-card text-card-foreground border-l border-border shadow-xl z-50 flex flex-col"
    >
      <div
        id="copilot-sidebar-header"
        className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-wissen-navy/5 via-card to-primary/5 px-4 py-3.5"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="font-display font-semibold tracking-tight text-sm text-foreground">
            IntelliDoc AI
          </span>
          {subtitle && (
            <span
              id="copilot-sidebar-subtitle"
              className="truncate text-[11px] text-muted-foreground"
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* ── Disabled / empty-workspace state ── */}
      {disabled ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <FolderOpen className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a folder and upload documents to start chatting with IntelliDoc AI.
            </p>
          </div>
        </div>
      ) : (
        <div
          id="copilot-sidebar-messages"
          className="flex-1 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-3"
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl max-w-[85%] text-sm leading-relaxed shadow-sm ${
                msg.isUser
                  ? 'bg-wissen-navy text-white rounded-tr-sm self-end'
                  : 'bg-muted/50 border border-border/50 rounded-tl-sm self-start text-foreground'
              }`}
            >
              {msg.text}
            </div>
          ))}
          {isLoading && <ShimmerLoader />}
          {sessionError && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive self-start max-w-[90%]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{sessionError}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={`p-3.5 border-t border-border bg-muted/10 transition-opacity${disabled ? ' opacity-40 pointer-events-none select-none' : ''}`}>
        <div className="relative flex items-center">
          <Input
            id="copilot-sidebar-input"
            placeholder={sessionLoading ? 'Connecting to AI\u2026' : (placeholder || 'Ask IntelliDoc AI...')}
            className="pr-10 rounded-full bg-background shadow-sm text-sm"
            value={inputText}
            disabled={sessionLoading}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
          />
          <Button
            id="copilot-sidebar-send-button"
            variant="ghost"
            size="icon"
            className="absolute right-1 h-7 w-7 rounded-full text-muted-foreground hover:text-wissen-navy hover:bg-wissen-navy/10 dark:hover:text-wissen-navy-light"
            onClick={handleSend}
            disabled={isLoading || sessionLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
