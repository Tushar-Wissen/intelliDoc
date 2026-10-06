# List workspace chat sessions API

Returns chat sessions **created by the authenticated user** in a workspace, most recently active first, including full message history for each session.

## Endpoint

| Method | Path |
|--------|------|
| `GET` | `/workspaces/{workspaceId}/chat-sessions` |
| `GET` | `/api/v1/workspaces/{workspaceId}/chat-sessions` |

## Auth

`Authorization: Bearer <JWT>` — caller must be a member of the workspace. Only sessions where `created_by` equals the caller are returned.

## Request

No query parameters or body.

### Sample request

```http
GET /api/v1/workspaces/3fa85f64-5717-4562-b3fc-2c963f66afa6/chat-sessions
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

PowerShell:

```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8080/workspaces/$workspaceId/chat-sessions" -Headers $headers
```

## Response `200 OK`

```json
{
  "workspaceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sessions": [
    {
      "id": "b2c3d4e5-f6a7-4890-b123-456789abcdef",
      "workspaceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "title": "Newer chat",
      "scope": {
        "type": "WORKSPACE",
        "moduleId": null,
        "documentIds": null
      },
      "resolvedDocumentIds": [
        "a1b2c3d4-e5f6-4789-a012-3456789abcde"
      ],
      "messages": [],
      "createdAt": "2026-09-30T09:15:00Z"
    },
    {
      "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      "workspaceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "title": "Older chat",
      "scope": {
        "type": "DOCUMENTS",
        "moduleId": null,
        "documentIds": [
          "d0c1b2a3-4567-4890-abcd-ef1234567890"
        ]
      },
      "resolvedDocumentIds": [
        "d0c1b2a3-4567-4890-abcd-ef1234567890"
      ],
      "messages": [
        {
          "id": "f1e2d3c4-b5a6-4789-9012-abcdef123456",
          "role": "USER",
          "content": "What is the notice period?",
          "answerMode": null,
          "confidence": null,
          "isNotFound": false,
          "createdAt": "2026-09-30T09:10:01Z"
        },
        {
          "id": "e2d3c4b5-a697-4890-8123-fedcba654321",
          "role": "ASSISTANT",
          "content": "Thirty days written notice is required.",
          "answerMode": "retrieval_plus_graph",
          "confidence": 0.91,
          "isNotFound": false,
          "createdAt": "2026-09-30T09:10:05Z"
        }
      ],
      "createdAt": "2026-09-30T09:10:00Z"
    }
  ]
}
```

Sessions are ordered by **last activity** descending (`last_activity_at`, then `created_at`). Messages within each session are ordered oldest first.

Empty workspace (no sessions yet):

```json
{
  "workspaceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sessions": []
}
```

## Errors

| Status | When |
|--------|------|
| `401` | Missing or invalid JWT |
| `403` | `WORKSPACE_ACCESS_DENIED` — user is not a workspace member |
| `404` | Unknown workspace (if applicable via membership check) |

## Related endpoints (unchanged)

- `POST /workspaces/{workspaceId}/chat-sessions` — create a session
- `GET /workspaces/{workspaceId}/chat-sessions/latest` — latest session for a scope (see below)
- `GET /chat-sessions/{sessionId}` — fetch one session (same shape as each item in `sessions[]`); only the session creator can read it (`404 SESSION_NOT_FOUND` otherwise)

---

# Latest chat session for scope (UI resume after refresh)

Returns the caller’s most recently **active** session for a fixed scope, with full message history. Use this when reopening the copilot on a workspace, module, or single document.

## Endpoint

| Method | Path |
|--------|------|
| `GET` | `/workspaces/{workspaceId}/chat-sessions/latest` |
| `GET` | `/api/v1/workspaces/{workspaceId}/chat-sessions/latest` |

## Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `scopeType` | Yes | `WORKSPACE`, `MODULE`, or `DOCUMENTS` |
| `moduleId` | When `scopeType=MODULE` | Module (`document_group`) UUID |
| `documentId` | When `scopeType=DOCUMENTS` | Single document UUID (matches sessions scoped to exactly that one document) |

Do not pass `moduleId` / `documentId` for `WORKSPACE` scope.

### Sample requests

```http
GET /api/v1/workspaces/{workspaceId}/chat-sessions/latest?scopeType=WORKSPACE
Authorization: Bearer …
```

```http
GET /api/v1/workspaces/{workspaceId}/chat-sessions/latest?scopeType=MODULE&moduleId={moduleId}
Authorization: Bearer …
```

```http
GET /api/v1/workspaces/{workspaceId}/chat-sessions/latest?scopeType=DOCUMENTS&documentId={documentId}
Authorization: Bearer …
```

## Response

- `200 OK` — body matches [`GET /chat-sessions/{sessionId}`](#related-endpoints-unchanged) (`ChatSessionDetailResponseDto`).
- `404 SESSION_NOT_FOUND` — no session for this user and scope (UI should `POST` create a session on first question).

## UI integration flow

1. On copilot open or scope change: `GET .../chat-sessions/latest?...`
2. If `404`: `POST .../chat-sessions` with the same scope shape as create API
3. Render `messages[]` from the response
4. Send new questions: `POST /chat-sessions/{sessionId}/messages` (SSE) — unchanged
