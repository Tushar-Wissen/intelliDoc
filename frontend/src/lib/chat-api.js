import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, authHeaders, toApiError } from '@/lib/api-client';
import { getToken } from '@/lib/auth-api';

const CHAT_ERROR_MESSAGES = {
  [API_ERROR_CODES.NOT_FOUND]: 'This chat session no longer exists.',
  [API_ERROR_CODES.INVALID]: 'The request was not valid.',
};

// Maps an API message object to the shape used by the UI.
function toAppMessage(apiMessage) {
  return {
    id: apiMessage.id,
    role: apiMessage.role, // 'user' | 'assistant'
    content: apiMessage.content ?? apiMessage.text ?? '',
    createdAt: apiMessage.createdAt,
  };
}

// Maps an API chat session object to the shape used by the UI.
function toAppSession(apiSession) {
  return {
    id: apiSession.id,
    title: apiSession.title ?? '',
    scope: apiSession.scope,
    messages: (apiSession.messages ?? []).map(toAppMessage),
    createdAt: apiSession.createdAt,
  };
}

export const chatApi = {
  /**
   * 9.5 — POST /workspaces/{workspaceId}/chat-sessions
   * Creates a new workspace-scoped chat session and returns its id.
   *
   * @param {string} workspaceId
   * @param {string} [title]
   * @returns {Promise<{ id: string, title: string, scope: object }>}
   */
  async createSession(workspaceId, title = 'Chat session') {
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/chat-sessions`,
        { scope: { type: 'workspace' }, title },
        { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
      );
      return { id: data.id, title: data.title ?? title, scope: data.scope };
    } catch (err) {
      console.error('[chat-api] createSession 422 error detail:', err.response?.data);
      throw toApiError(err, CHAT_ERROR_MESSAGES);
    }
  },

  /**
   * 9.6 — POST /chat-sessions/{chatSessionId}/messages  (SSE stream)
   * Sends a question and streams back token events.
   *
   * The caller must pass:
   *   onToken(token: string)  — called for every SSE `event:token` chunk
   *   onDone(messageId?: string) — called when the `event:done` event arrives
   *   onError(err: Error)     — called on network / parse failure
   *
   * Returns an AbortController so the caller can cancel the stream.
   */
  askQuestion(chatSessionId, question, { onToken, onDone, onError } = {}) {
    const controller = new AbortController();
    const token = getToken();

    (async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/chat-sessions/${encodeURIComponent(chatSessionId)}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ question }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events (separated by double newlines)
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop(); // last part may be incomplete

          for (const part of parts) {
            if (!part.trim()) continue;

            // Parse event type and data from the SSE block
            let eventType = 'message';
            let dataLine = '';

            for (const line of part.split(/\r?\n/)) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLine = line.slice(5).trim();
              }
            }

            if (eventType === 'token') {
              try {
                const parsed = JSON.parse(dataLine);
                onToken?.(parsed.token ?? parsed.content ?? dataLine);
              } catch {
                onToken?.(dataLine);
              }
            } else if (eventType === 'done') {
              try {
                const parsed = JSON.parse(dataLine);
                onDone?.(parsed.messageId ?? null);
              } catch {
                onDone?.(null);
              }
            } else if (eventType === 'error') {
              try {
                const parsed = JSON.parse(dataLine);
                onError?.(new Error(parsed.message ?? 'Stream error'));
              } catch {
                onError?.(new Error(dataLine || 'Stream error'));
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          onError?.(err);
        }
      }
    })();

    return controller;
  },

  /**
   * 9.7 — GET /chat-sessions/{chatSessionId}
   * Returns the full session including all messages.
   *
   * @param {string} chatSessionId
   * @returns {Promise<{ id, title, scope, messages: Array }>}
   */
  async getSession(chatSessionId) {
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/chat-sessions/${encodeURIComponent(chatSessionId)}`,
        { headers: authHeaders() }
      );
      return toAppSession(data);
    } catch (err) {
      throw toApiError(err, CHAT_ERROR_MESSAGES);
    }
  },
};
