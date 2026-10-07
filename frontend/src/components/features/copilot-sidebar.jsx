import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import {
  Sparkles,
  Send,
  Square,
  RotateCcw,
  FileText,
  AlertCircle,
  Maximize2,
  Minimize2,
  Loader2,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShimmerLoader } from '@/components/ui/shimmer-loader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AiModelDropdown, ModelIcon } from '@/components/features/ai-model-selector';
import { DocumentProcessingState, NoDocumentsState } from '@/components/features/copilot-empty-state';
import { getAiModel } from '@/constants/ai-models';
import { useAiModel } from '@/hooks/use-ai-model';
import { CHAT_HISTORY_STATUS, useChatHistory } from '@/hooks/use-chat-history';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { DOCUMENT_STATUS } from '@/hooks/use-document-processing-status';
import { chatApi } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

let messageSeq = 0;
const nextMessageId = () => `msg-${Date.now()}-${(messageSeq += 1)}`;

const NOT_FOUND_TEXT = "I couldn't find an answer to that in these documents.";

// Messages revealed per step when scrolling up through a loaded chat history.
const MESSAGE_PAGE_SIZE = 20;

// Maps a message from a saved chat session to the shape the chat renders.
function toChatMessage(message) {
  return {
    id: message.id,
    role: message.role?.toLowerCase() === 'user' ? 'user' : 'assistant',
    text: message.content || (message.isNotFound ? NOT_FOUND_TEXT : ''),
    citations: [],
    status: 'done',
  };
}

function ChatHistoryLoader() {
  return (
    <div
      id="copilot-history-loader"
      className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 animate-spin text-wissen-navy dark:text-wissen-navy-light" aria-hidden="true" />
      Loading chat history&hellip;
    </div>
  );
}

function ChatHistoryError({ message, onRetry }) {
  return (
    <div
      id="copilot-history-error"
      className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive"
      role="alert"
    >
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <p>{message}</p>
      <Button id="copilot-history-retry-button" variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function CitationChips({ citations, tooltipBoundary }) {
  if (!citations?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((citation, idx) => (
        <Tooltip key={citation.citationId ?? idx}>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <FileText className="h-3 w-3" />
              {`[${idx + 1}] p. ${citation.page ?? 1}`}
            </span>
          </TooltipTrigger>
          {(citation.section || citation.excerpt) && (
            <TooltipContent
              side="top"
              collisionBoundary={tooltipBoundary}
              collisionPadding={12}
              className="max-w-xs break-words"
            >
              {citation.section && <p className="font-semibold text-foreground">{citation.section}</p>}
              {citation.excerpt && <p className="mt-1 line-clamp-4 text-muted-foreground">{citation.excerpt}</p>}
            </TooltipContent>
          )}
        </Tooltip>
      ))}
    </div>
  );
}

function ChatMessage({ message, tooltipBoundary }) {
  if (message.role === 'notice') {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {message.text}
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl rounded-tr-sm bg-wissen-navy p-3 text-sm leading-relaxed text-white shadow-sm">
        {message.text}
      </div>
    );
  }

  // Assistant: shimmer until the first token arrives.
  const model = getAiModel(message.modelId);
  if (message.status === 'streaming' && !message.text) return <ShimmerLoader modelLabel={model?.label} />;

  const isError = message.status === 'error';
  return (
    <div className="flex max-w-[85%] flex-col gap-1 self-start">
      <div
        className={cn(
          'whitespace-pre-wrap rounded-xl rounded-tl-sm border p-3 text-sm leading-relaxed shadow-sm',
          isError
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : 'border-border/50 bg-muted/50 text-foreground'
        )}
      >
        {isError && <AlertCircle className="mb-1 h-4 w-4" />}
        {message.text}
        <CitationChips citations={message.citations} tooltipBoundary={tooltipBoundary} />
      </div>
      {/* Saved history doesn't record which model answered, so only label answers from this session. */}
      {message.modelId && (
        <div className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
          <ModelIcon model={model} className="h-4 w-4 rounded-full [&_svg]:h-2.5 [&_svg]:w-2.5" />
          {model.label}
        </div>
      )}
    </div>
  );
}

export function CopilotSidebar({
  activeTabId,
  activeTabName,
  subtitle,
  placeholder,
  chatHistories,
  onUpdateHistory,
  workspaceId,
  scope,
  // Where to load saved chat history from: { scopeType, scopeId } (see CHAT_SCOPE_TYPES).
  historyScope,
  // disabled=true hides the chat UI and shows an empty-state prompt instead
  disabled = false,
  // Processing status of the open document (document-level chat only); chat stays locked
  // until it is READY. null means workspace/folder chat, or the status is unknown.
  documentStatus = null,
}) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelElement, setPanelElement] = useState(null);
  const [messagesElement, setMessagesElement] = useState(null);
  // Per chat context: how many of the oldest messages are still hidden above the visible ones.
  const [hiddenCounts, setHiddenCounts] = useState({});
  const [isRevealingOlder, startRevealingOlder] = useTransition();
  const messagesEndRef = useRef(null);
  // Scroll metrics captured just before older messages are revealed, to keep the view in place.
  const scrollAnchorRef = useRef(null);
  const lastAutoScrollRef = useRef({ key: null, count: 0 });
  const abortRef = useRef(null);
  // Chat session id per workspace + context, created on the first question.
  const sessionIdsRef = useRef({});
  const { model, selectModel } = useAiModel();

  const currentKey = activeTabId || 'general';
  const sessionKey = `${workspaceId}:${currentKey}`;
  const messages = chatHistories[currentKey] ?? [];
  const hasMessages = messages.length > 0;
  const documentPending = Boolean(documentStatus) && documentStatus !== DOCUMENT_STATUS.READY;

  // Resume the saved conversation for this context and continue it with new questions.
  const handleHistoryLoaded = useCallback(
    (key, session) => {
      if (!session) return;
      const restored = session.messages.map(toChatMessage);
      sessionIdsRef.current[`${workspaceId}:${key}`] = session.id;
      setHiddenCounts((prev) => ({ ...prev, [key]: Math.max(0, restored.length - MESSAGE_PAGE_SIZE) }));
      onUpdateHistory(key, (prev) => (prev.length ? prev : restored));
    },
    [workspaceId, onUpdateHistory]
  );

  const history = useChatHistory({
    workspaceId,
    scopeType: historyScope?.scopeType,
    scopeId: historyScope?.scopeId,
    historyKey: currentKey,
    enabled: Boolean(workspaceId) && !disabled && !documentPending,
    onLoad: handleHistoryLoaded,
  });
  const historyLoading = history.status === CHAT_HISTORY_STATUS.LOADING;
  const historyFailed = history.status === CHAT_HISTORY_STATUS.ERROR;
  // Block sending until history arrives, so a question never starts a second session.
  const locked = disabled || documentPending || historyLoading;

  const hiddenCount = Math.min(hiddenCounts[currentKey] ?? 0, messages.length);
  const visibleMessages = hiddenCount ? messages.slice(hiddenCount) : messages;
  const hasOlderMessages = hiddenCount > 0;

  const handleRevealOlder = useCallback(() => {
    if (!hasOlderMessages || isRevealingOlder) return;
    if (messagesElement) {
      scrollAnchorRef.current = { height: messagesElement.scrollHeight, top: messagesElement.scrollTop };
    }
    startRevealingOlder(() => {
      setHiddenCounts((prev) => ({
        ...prev,
        [currentKey]: Math.max(0, Math.min(prev[currentKey] ?? 0, messages.length) - MESSAGE_PAGE_SIZE),
      }));
    });
  }, [hasOlderMessages, isRevealingOlder, messagesElement, currentKey, messages.length]);

  const scrollRoot = useMemo(() => ({ current: messagesElement }), [messagesElement]);
  const olderSentinelRef = useInfiniteScroll({
    hasMore: hasOlderMessages,
    loading: isRevealingOlder,
    onLoadMore: handleRevealOlder,
    root: scrollRoot,
  });

  // Older messages are inserted above the viewport; shift the scroll by their height so what
  // the user was reading stays put.
  useLayoutEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor || !messagesElement) return;
    scrollAnchorRef.current = null;
    messagesElement.scrollTop = anchor.top + (messagesElement.scrollHeight - anchor.height);
  }, [hiddenCount, messagesElement]);

  // Chat histories are reset per workspace, so their paging positions go with them.
  useEffect(() => {
    setHiddenCounts({});
  }, [workspaceId]);

  // Clear input whenever we switch tabs
  useEffect(() => {
    setInputText('');
  }, [activeTabId]);

  // Auto-scroll to the latest message: jump straight there when a conversation is opened or its
  // history arrives, and glide for messages added while chatting.
  useLayoutEffect(() => {
    const last = lastAutoScrollRef.current;
    const jump = last.key !== currentKey || last.count === 0;
    lastAutoScrollRef.current = { key: currentKey, count: messages.length };
    messagesEndRef.current?.scrollIntoView({ behavior: jump ? 'auto' : 'smooth', block: 'end' });
  }, [currentKey, messages]);

  // Stop any in-flight answer when the panel goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSelectModel = (id) => {
    if (id === model.id) return;
    selectModel(id);
    // Mark the switch in an ongoing conversation so it is clear which model answered what.
    if (hasMessages) {
      onUpdateHistory(currentKey, (prev) => [
        ...prev,
        { id: nextMessageId(), role: 'notice', text: `Switched to ${getAiModel(id).label}` },
      ]);
    }
  };

  const handleNewChat = () => {
    delete sessionIdsRef.current[sessionKey];
    setHiddenCounts((prev) => ({ ...prev, [currentKey]: 0 }));
    onUpdateHistory(currentKey, []);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleSend = async () => {
    const question = inputText.trim();
    if (!question || isLoading || locked || !workspaceId) return;

    // Capture everything now; the user may switch context or model while the answer streams.
    const key = currentKey;
    const sKey = sessionKey;
    const chatModel = model;
    const assistantId = nextMessageId();
    const updateAssistant = (patch) =>
      onUpdateHistory(key, (prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch(m) } : m)));

    onUpdateHistory(key, (prev) => [
      ...prev,
      { id: nextMessageId(), role: 'user', text: question },
      { id: assistantId, role: 'assistant', text: '', modelId: chatModel.id, citations: [], status: 'streaming' },
    ]);
    setInputText('');
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let sessionId = sessionIdsRef.current[sKey];
      if (!sessionId) {
        const session = await chatApi.createSession(workspaceId, { scope, title: question.slice(0, 80) });
        sessionId = session.id;
        sessionIdsRef.current[sKey] = sessionId;
      }

      const result = await chatApi.sendMessage(
        sessionId,
        { question, provider: chatModel.provider, model: chatModel.id },
        {
          signal: controller.signal,
          onToken: (text) => updateAssistant((m) => ({ text: m.text + text })),
          onCitation: (citation) => updateAssistant((m) => ({ citations: [...m.citations, citation] })),
        }
      );

      updateAssistant((m) => ({
        status: 'done',
        text: m.text || (result?.isNotFound ? NOT_FOUND_TEXT : m.text),
      }));
    } catch (err) {
      if (err?.name === 'AbortError') {
        updateAssistant((m) => ({ status: 'done', text: m.text || 'Response stopped.' }));
      } else {
        updateAssistant(() => ({
          status: 'error',
          text: err?.message || 'Something went wrong. Please try again.',
        }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        id="copilot-sidebar-panel"
        ref={setPanelElement}
        className={cn(
          'absolute top-0 right-0 z-50 flex h-full flex-col border-l border-border bg-card text-card-foreground shadow-xl transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
          isExpanded ? 'w-[min(42rem,calc(100vw-1rem))]' : 'w-80 sm:w-96'
        )}
      >
        <div
          id="copilot-sidebar-header"
          className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-wissen-navy/5 via-card to-primary/5 px-4 py-3.5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-wissen-navy/10 text-wissen-navy dark:text-wissen-navy-light">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-display font-semibold tracking-tight text-sm text-foreground">
              DocuMind AI
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
          {hasMessages && !locked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id="copilot-new-chat-button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-wissen-navy hover:bg-wissen-navy/10 dark:hover:text-wissen-navy-light"
                  onClick={handleNewChat}
                  disabled={isLoading}
                  aria-label="New chat"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          )}
          <AiModelDropdown model={model} onSelect={handleSelectModel} disabled={isLoading || locked} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="copilot-resize-button"
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-wissen-navy/10 hover:text-wissen-navy dark:hover:text-wissen-navy-light"
                onClick={() => setIsExpanded((expanded) => !expanded)}
                aria-label={isExpanded ? 'Restore chat size' : 'Expand chat'}
                aria-pressed={isExpanded}
              >
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isExpanded ? 'Restore chat size' : 'Expand chat'}</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Locked states: empty workspace, or the open document isn't ready for AI yet ── */}
        {disabled ? (
          <NoDocumentsState />
        ) : documentPending ? (
          <DocumentProcessingState status={documentStatus} documentName={activeTabName} />
        ) : (
          <div
            id="copilot-sidebar-messages"
            ref={setMessagesElement}
            className="flex-1 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-3 [overflow-anchor:none]"
            aria-busy={historyLoading || isRevealingOlder}
          >
            {hasMessages ? (
              <>
                {hasOlderMessages && (
                  // Fixed height so showing the spinner never shifts the messages below it.
                  <div ref={olderSentinelRef} className="flex h-6 shrink-0 items-center justify-center">
                    {isRevealingOlder && (
                      <span role="status" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        <span className="sr-only">Loading earlier messages</span>
                      </span>
                    )}
                  </div>
                )}
                {visibleMessages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} tooltipBoundary={panelElement} />
                ))}
              </>
            ) : historyLoading ? (
              <ChatHistoryLoader />
            ) : historyFailed ? (
              <ChatHistoryError message={history.error} onRetry={history.retry} />
            ) : (
              <div id="copilot-empty-state" className="flex flex-col gap-4 animate-fade-in">
                <div className="rounded-xl border border-border/50 bg-muted/50 p-3 text-sm leading-relaxed text-foreground shadow-sm">
                  Hello! I&apos;m your AI assistant
                  {activeTabName ? (
                    <>
                      {' '}for{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-full truncate font-semibold" title={activeTabName}>
                            {activeTabName}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-sm break-all">
                          {activeTabName}
                        </TooltipContent>
                      </Tooltip>
                    </>
                  ) : null}
                  . Ask me anything about your documents.
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        <div
          className={cn(
            'p-3.5 border-t border-border bg-muted/10 transition-opacity',
            locked && 'opacity-60 pointer-events-none select-none'
          )}
        >
          <div className="relative flex items-center">
            <Input
              id="copilot-sidebar-input"
              placeholder={
                documentPending
                  ? 'AI chat unlocks once processing finishes'
                  : historyLoading
                    ? 'Loading chat history…'
                    : placeholder || 'Ask DocuMind AI...'
              }
              className="pr-10 rounded-full bg-background shadow-sm text-sm"
              value={inputText}
              disabled={locked}
              aria-disabled={locked}
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
              onClick={isLoading ? handleStop : handleSend}
              disabled={locked || (!isLoading && !inputText.trim())}
              aria-label={isLoading ? 'Stop response' : 'Send message'}
            >
              {isLoading ? <Square className="h-3 w-3 fill-current" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
            Answering with <span className="font-medium text-foreground">{model.label}</span>
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
