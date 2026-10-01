# List workspace chat sessions API

Returns every chat session in a workspace, newest first, including full message history for each session.

## Endpoint

| Method | Path |
|--------|------|
| `GET` | `/workspaces/{workspaceId}/chat-sessions` |
| `GET` | `/api/v1/workspaces/{workspaceId}/chat-sessions` |

## Auth

`Authorization: Bearer <JWT>` — caller must be a member of the workspace.

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

Sessions are ordered by `createdAt` descending (newest first). Messages within each session are ordered oldest first.

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
- `GET /chat-sessions/{sessionId}` — fetch one session (same shape as each item in `sessions[]`)
