# E2E Upload → Chat — manual test guide

This guide walks through the **full backend path**: upload a document, wait until it is `READY`, create a chat session, ask a question, and receive a **grounded answer** from the AI service (not the Core API stub).

Use **Postman** with the `IntelliDoc Local` environment, or paste the PowerShell commands below.

Prerequisites: complete [`INGESTION_PIPELINE_MANUAL_TEST.md`](INGESTION_PIPELINE_MANUAL_TEST.md) setup (Docker stack, seed user, health checks).

---

## Configuration for real answers

In `.env` or `docker-compose.yml`, Core API must call the AI service for chat:

```bash
CHAT_ANSWER_GENERATOR_MODE=http
```

Default AI provider for POC (no external API key):

```bash
LLM_PROVIDER=rules
```

Restart after changing env:

```bash
docker compose up --build -d
```

---

## What success looks like

| Step | Expected |
|------|----------|
| Upload | `202 Accepted`, `processingStatus=UPLOADED` |
| Poll document | Status progresses to `READY` (may take several minutes on first run) |
| Create chat session | `201`, `resolvedDocumentIds` lists your document |
| POST message (SSE) | `token` events with answer text from your doc; `citation` events; `done` with `messageId` |
| GET session | Assistant `content` matches streamed answer |
| GET citations | At least one citation when `isNotFound=false` |

Ask **"What is this document about?"** — the answer should reference your uploaded content, **not** the stub phrase "30 days written notice".

---

## Postman happy path

Import:

- Collection: `postman/IntelliDoc-Epic01-DMS.postman_collection.json`
- Environment: `postman/IntelliDoc-local.postman_environment.json`

Run folder **9. E2E Upload → Chat** in order.

---

## PowerShell walkthrough

### 1. Login

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"jane.doe@company.com","password":"password"}'
$token = $login.token
$headers = @{ Authorization = "Bearer $token" }
```

### 2. Create workspace

```powershell
$ws = Invoke-RestMethod -Method Post -Uri http://localhost:8080/workspaces `
  -Headers $headers -ContentType "application/json" `
  -Body '{"name":"E2E Chat Test"}'
$workspaceId = $ws.id
```

### 3. Upload a document

Use `curl.exe` for multipart upload (PowerShell `curl` alias is not curl):

```powershell
curl.exe -X POST "http://localhost:8080/workspaces/$workspaceId/documents" `
  -H "Authorization: Bearer $token" `
  -F "files=@C:\path\to\your\document.pdf"
```

Save `$docId` from the response `documents[0].id`.

### 4. Poll until READY

```powershell
do {
  Start-Sleep -Seconds 10
  $doc = Invoke-RestMethod -Uri "http://localhost:8080/documents/$docId" -Headers $headers
  Write-Host "Status: $($doc.processingStatus)"
} while ($doc.processingStatus -notin @("READY", "FAILED"))

if ($doc.processingStatus -eq "FAILED") {
  throw "Document processing failed. Check ai-service and Celery logs."
}
```

### 5. Create chat session

```powershell
$session = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/workspaces/$workspaceId/chat-sessions" `
  -Headers $headers -ContentType "application/json" `
  -Body '{"scope":{"type":"workspace"},"title":"E2E test"}'
$sessionId = $session.id
```

If you get `422 EMPTY_SCOPE`, the document is not `READY` yet or was excluded from scope.

### 6. Ask a question (SSE)

Postman is easiest for SSE. With curl:

```powershell
curl.exe -N -X POST "http://localhost:8080/chat-sessions/$sessionId/messages" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -H "Accept: text/event-stream" `
  -d "{\"question\":\"What is this document about?\"}"
```

### 7. Verify persisted answer

```powershell
$detail = Invoke-RestMethod -Uri "http://localhost:8080/chat-sessions/$sessionId" -Headers $headers
$detail.messages
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Document stuck `UPLOADED` | AI trigger or Celery failed | Core API logs: `PROCESSING_TRIGGER_FAILED`; `docker compose logs ai-service` |
| Document `FAILED` at graph stage | Neo4j unreachable from ai-service | `NEO4J_URI=bolt://neo4j:7687` in ai-service container |
| `422 EMPTY_SCOPE` on session create | No `READY` docs in scope | Wait for processing; only indexed docs are chat-eligible |
| Stub answer ("30 days notice") | `CHAT_ANSWER_GENERATOR_MODE=stub` | Set `http` and restart core-api |
| `UPSTREAM_FAILURE` in SSE | ai-service down or timeout | Check `http://localhost:8000/health`; increase `CHAT_UPSTREAM_TIMEOUT_MS` |
| Slow first upload | BGE-M3 model download | Normal; subsequent runs are faster |

---

## Related docs

- Ingestion only: [`INGESTION_PIPELINE_MANUAL_TEST.md`](INGESTION_PIPELINE_MANUAL_TEST.md)
- Implementation plan: [`docs/Implementation/10_E2E_UPLOAD_TO_CHAT_IMPLEMENTATION_PLAN.md`](../Implementation/10_E2E_UPLOAD_TO_CHAT_IMPLEMENTATION_PLAN.md)
