import axios from 'axios';

import { API_BASE_URL, API_ERROR_CODES, ApiError, authHeaders, toApiError } from '@/lib/api-client';

const CHAT_ERROR_MESSAGES = {
  [API_ERROR_CODES.INVALID]: 'This question could not be sent. Check the selected documents and try again.',
  [API_ERROR_CODES.NOT_FOUND]: 'This conversation no longer exists. Start a new one and try again.',
  [API_ERROR_CODES.SERVER]: 'DocuMind AI could not answer right now. Please try again in a moment.',
};

// Scope types for GET /workspaces/{id}/chat-sessions/latest. The id in the path is the
// workspace, document or folder id that matches the scope type.
export const CHAT_SCOPE_TYPES = {
  WORKSPACE: 'WORKSPACE',
  DOCUMENT: 'DOCUMENT',
  FOLDER: 'FOLDER',
};

// Maps an API message object to the shape used by the UI.
function toAppMessage(apiMessage) {
  return {
    id: apiMessage.id,
    role: apiMessage.role, // 'user' | 'assistant'
    content: apiMessage.content ?? apiMessage.text ?? '',
    isNotFound: Boolean(apiMessage.isNotFound),
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

// Splits a Server-Sent Events buffer into complete events; the unfinished tail is returned
// so the next chunk can complete it.
function parseSseEvents(buffer) {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop();
  const events = blocks
    .map((block) => {
      let name = 'message';
      const dataLines = [];
      block.split(/\r?\n/).forEach((line) => {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      });
      if (dataLines.length === 0) return null;
      const raw = dataLines.join('\n');
      try {
        return { name, data: JSON.parse(raw) };
      } catch {
        return { name, data: raw };
      }
    })
    .filter(Boolean);
  return { events, rest };
}

export const chatApi = {
  // POST /workspaces/{workspaceId}/chat-sessions  { scope: { type, moduleId?, documentIds? }, title? }
  //   -> { id, workspaceId, title, scope, resolvedDocumentIds, createdAt }
  // `scope.type` is WORKSPACE, MODULE (with moduleId) or DOCUMENTS (with documentIds).
  async createSession(workspaceId, { scope, title }) {
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/chat-sessions`,
        { scope, title },
        { headers: authHeaders() }
      );
      return { id: data.id, resolvedDocumentIds: data.resolvedDocumentIds ?? [] };
    } catch (err) {
      throw toApiError(err, CHAT_ERROR_MESSAGES, { preferServerMessage: true });
    }
  },

  // POST /chat-sessions/{sessionId}/messages  { question, provider, model }  (text/event-stream)
  //   event: token     { text }
  //   event: citation  { citationId, documentId, page, section, excerpt }
  //   event: done      { messageId, answerMode, isNotFound, confidence }
  //   event: error     { code, message }
  // Streams the answer through `onToken`/`onCitation` and resolves with the `done` payload.
  // Uses fetch rather than axios because the answer arrives as a stream.
  async sendMessage(sessionId, { question, provider, model }, { onToken, onCitation, signal } = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/chat-sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ question, provider, model }),
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw toApiError(err, CHAT_ERROR_MESSAGES);
    }

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw toApiError({ response: { status: response.status, data } }, CHAT_ERROR_MESSAGES, {
        preferServerMessage: true,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = parseSseEvents(buffer);
      buffer = rest;

      for (const { name, data } of events) {
        if (name === 'token') onToken?.(data?.text ?? '');
        else if (name === 'citation') onCitation?.(data);
        else if (name === 'done') return data;
        else if (name === 'error') {
          throw new ApiError(API_ERROR_CODES.SERVER, data?.message || CHAT_ERROR_MESSAGES[API_ERROR_CODES.SERVER]);
        }
      }
    }

    // The stream closed without a `done` event, so the answer is incomplete.
    throw new ApiError(API_ERROR_CODES.SERVER, CHAT_ERROR_MESSAGES[API_ERROR_CODES.SERVER]);
  },

  // GET /chat-sessions/{sessionId} -> { id, title, scope, messages: [{ id, role, content, createdAt }], createdAt }
  async getSession(sessionId) {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/chat-sessions/${encodeURIComponent(sessionId)}`, {
        headers: authHeaders(),
      });
      return toAppSession(data);
    } catch (err) {
      throw toApiError(err, CHAT_ERROR_MESSAGES);
    }
  },

  // GET /workspaces/{scopeId}/chat-sessions/latest?scopeType={scopeType}
  //   -> same shape as GET /chat-sessions/{sessionId}; 404 when this scope has no chat yet.
  // `scopeId` is the workspace, document or folder id, per `scopeType` (see CHAT_SCOPE_TYPES).
  // Resolves with null when there is no session yet.
  async getLatestSession(scopeId, scopeType, { signal } = {}) {
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/workspaces/${encodeURIComponent(scopeId)}/chat-sessions/latest`,
        { params: { scopeType }, headers: authHeaders(), signal }
      );
      return data ? toAppSession(data) : null;
    } catch (err) {
      if (axios.isCancel(err)) throw err;
      if (err?.response?.status === 404) return null;
      throw toApiError(err, {
        ...CHAT_ERROR_MESSAGES,
        [API_ERROR_CODES.SERVER]: 'Chat history could not be loaded right now. Please try again.',
      });
    }
  },
};
