import { useCallback, useEffect, useRef, useState } from 'react';

import { chatApi } from '@/lib/chat-api';

export const CHAT_HISTORY_STATUS = {
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
};

// Loads the latest chat session for a scope once, the first time that scope is opened.
// `onLoad(historyKey, session)` receives the session, or null when the scope has no chat yet.
// Results are cached per workspace + chat context, so switching back never refetches (and never
// overwrites a conversation started since); changing workspace starts over.
export function useChatHistory({ workspaceId, scopeType, scopeId, historyKey, enabled, onLoad }) {
  const [statuses, setStatuses] = useState({});
  const requestsRef = useRef(new Map()); // cacheKey -> AbortController for requests in flight
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // Keyed by chat context too, since a folder can be open as a tab or as the active folder.
  const cacheKey = scopeType && scopeId ? `${workspaceId}:${historyKey}:${scopeType}:${scopeId}` : null;
  const entry = cacheKey ? statuses[cacheKey] : undefined;

  const load = useCallback(() => {
    if (!cacheKey || requestsRef.current.has(cacheKey)) return;

    const controller = new AbortController();
    requestsRef.current.set(cacheKey, controller);
    setStatuses((prev) => ({ ...prev, [cacheKey]: { status: CHAT_HISTORY_STATUS.LOADING } }));

    chatApi
      .getLatestSession(scopeId, scopeType, { signal: controller.signal })
      .then((session) => {
        if (controller.signal.aborted) return;
        onLoadRef.current?.(historyKey, session);
        setStatuses((prev) => ({ ...prev, [cacheKey]: { status: CHAT_HISTORY_STATUS.LOADED } }));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setStatuses((prev) => ({
          ...prev,
          [cacheKey]: { status: CHAT_HISTORY_STATUS.ERROR, error: err?.message || 'Chat history could not be loaded.' },
        }));
      })
      .finally(() => {
        if (requestsRef.current.get(cacheKey) === controller) requestsRef.current.delete(cacheKey);
      });
  }, [cacheKey, scopeId, scopeType, historyKey]);

  useEffect(() => {
    if (enabled && cacheKey && !entry) load();
  }, [enabled, cacheKey, entry, load]);

  // Histories belong to a workspace: drop them, and anything still loading, when it changes.
  useEffect(() => {
    const requests = requestsRef.current;
    return () => {
      requests.forEach((controller) => controller.abort());
      requests.clear();
      setStatuses({});
    };
  }, [workspaceId]);

  return {
    status: entry?.status ?? (enabled && cacheKey ? CHAT_HISTORY_STATUS.LOADING : CHAT_HISTORY_STATUS.LOADED),
    error: entry?.error ?? null,
    retry: load,
  };
}
