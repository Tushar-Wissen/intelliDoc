# API Specification — Pod 3: Document Extractor + Chatbot

> Core API is owned by the Spring Boot service. The AI service (FastAPI) is called internally by the Core API and is not exposed to the frontend directly — this keeps auth, tenancy, and access control in one place.

---

## 1. Conventions

- Base URL (POC): `https://<host>/api/v1`
- Format: JSON in, JSON out (except file upload: `multipart/form-data`; chat responses: Server-Sent Events)
- Auth: `Authorization: Bearer <token>` (simple internal login for the POC — see BRD §5.2, SSO is out of scope)
- All list endpoints support `?page=` and `?pageSize=`
- Timestamps: ISO 8601 UTC
- IDs: UUID v4

### Standard error format

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "No document found with the given ID.",
    "requestId": "a1b2c3d4"
  }
}
```

| HTTP status | Meaning |
|---|---|
| 400 | Validation error (bad input) |
| 401 | Not authenticated |
| 403 | Not authorized for this workspace/document |
| 404 | Resource not found |
| 413 | File too large |
| 415 | Unsupported file type |
| 422 | Valid request, but cannot be processed (e.g. corrupt file) |
| 500 | Server error |

---

## 2. Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create an account and return a bearer token |
| POST | `/auth/login` | Exchange credentials for a bearer token |
| POST | `/auth/logout` | Invalidate current token |
| GET | `/auth/me` | Get current user profile |

**POST `/auth/signup`**
```json
// Request
{ "email": "user@company.com", "password": "...", "displayName": "Jane Doe" }
// Response  (200)
{ "token": "eyJ...", "user": { "id": "uuid", "displayName": "Jane Doe", "role": "member" } }
// Response  (409) — email already registered
{ "error": { "code": "AUTH_EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists.", "requestId": "..." } }
```

**POST `/auth/login`**
```json
// Request
{ "email": "user@company.com", "password": "..." }
// Response
{ "token": "eyJ...", "user": { "id": "uuid", "displayName": "Jane Doe", "role": "member" } }
```

---

## 3. Workspaces

| Method | Path | Purpose |
|---|---|---|
| POST | `/workspaces` | Create a workspace |
| GET | `/workspaces` | List workspaces the user can access |
| GET | `/workspaces/{workspaceId}` | Get workspace details |
| PATCH | `/workspaces/{workspaceId}` | Rename / update status |
| DELETE | `/workspaces/{workspaceId}` | Archive a workspace and delete all modules and documents inside it |

**POST `/workspaces`**
```json
// Request
{ "name": "Q3 Vendor Contracts Review" }
// Response  (201)
{ "id": "uuid", "name": "Q3 Vendor Contracts Review", "status": "ACTIVE", "createdAt": "2026-09-14T10:00:00Z" }
```

---

## 4. Modules (Document Groups)

> A module represents a folder-level grouping within a single workspace — e.g. mirroring a subfolder from a multi-file upload. **Module names are only unique within their own workspace** (`(workspaceId, name)`, not globally) — "Finance" and "Governance" workspaces can each have a module called "Contracts"; they are unrelated rows with unrelated documents, and nothing about the name ever links them.

| Method | Path | Purpose |
|---|---|---|
| POST | `/workspaces/{workspaceId}/modules` | Create a module |
| GET | `/workspaces/{workspaceId}/modules` | List modules in a workspace |
| PATCH | `/modules/{moduleId}` | Rename a module |
| DELETE | `/modules/{moduleId}` | Delete a module and archive all documents inside it |

**POST `/workspaces/{workspaceId}/modules`**
```json
// Request
{ "name": "Vendor Contracts" }
// Response (201)
{ "id": "uuid", "workspaceId": "uuid", "name": "Vendor Contracts", "createdAt": "2026-09-14T10:00:00Z" }
```

A request to create a module with a name that already exists **in that same workspace** returns `409 MODULE_NAME_TAKEN`. The same name in a different workspace succeeds — modules never cross workspace boundaries.

**GET `/workspaces/{workspaceId}/modules`**
```json
// Response (200)
[
  {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "Security Reviews Folder",
    "createdAt": "2026-09-23T17:53:20.085249Z",
    "totalFiles": 2,
    "files": [
      {
        "id": "uuid",
        "name": "Security_Review_2026.pdf",
        "type": "PDF",
        "size": 204800,
        "createdAt": "2026-09-23T17:53:30.085249Z"
      },
      {
        "id": "uuid",
        "name": "Vulnerability_Assessment.docx",
        "type": "DOCX",
        "size": 102400,
        "createdAt": "2026-09-23T17:53:40.085249Z"
      }
    ]
  },
  {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "Technical Research",
    "createdAt": "2026-09-23T17:52:26.085035Z",
    "totalFiles": 0,
    "files": []
  }
]
```

`type` is the file extension in uppercase (`PDF`, `DOCX`). Archived documents are excluded from `files` and `totalFiles`.

---

## 5. Documents

| Method | Path | Purpose |
|---|---|---|
| POST | `/workspaces/{workspaceId}/documents` | Upload one or more documents, optionally into a module |
| POST | `/modules/{moduleId}/documents` | Upload one or more documents directly into an existing module |
| GET | `/workspaces/{workspaceId}/documents?moduleId=` | List documents in a workspace, optionally filtered to one module |
| GET | `/documents/{documentId}` | Get document detail (overview, summary, status) |
| GET | `/documents/{documentId}/file` | Stream the original uploaded file as-is (PDF/DOCX) for the UI viewer |
| GET | `/documents/{documentId}/pages/{pageNumber}` | Get raw page text (for source viewer) |
| PATCH | `/documents/{documentId}/module` | Reassign a document to a different module (or unassign) |
| POST | `/documents/{documentId}/retry` | Retry a failed processing job |
| DELETE | `/documents/{documentId}` | Archive/delete a document |

**POST `/workspaces/{workspaceId}/documents`** (`multipart/form-data`, field `files[]`, optional field `relativePaths[]`)

If the user selects a whole folder in the browser (`webkitdirectory`), each file's relative path (e.g. `Finance/Contracts/ServiceAgreement.pdf`) is sent alongside it. The top-level subfolder name becomes a module — created automatically if it doesn't already exist in this workspace, reused if it does.

```json
// Response (202 Accepted)
{
  "documents": [
    { "id": "uuid", "fileName": "ServiceAgreement.pdf", "moduleId": "uuid", "moduleName": "Contracts", "processingStatus": "UPLOADED" },
    { "id": "uuid", "fileName": "Q2Report.docx", "moduleId": null, "moduleName": null, "processingStatus": "UPLOADED" }
  ]
}
```

**POST `/modules/{moduleId}/documents`** (`multipart/form-data`, field `files[]`)

Uploads one or more PDF/DOCX files into an existing module. Every accepted file is stored with that `moduleId`. The module must exist (`404 MODULE_NOT_FOUND`) and the caller must be a member of the module's workspace (`403 WORKSPACE_ACCESS_DENIED`). Per-file type and size checks match the workspace upload: a bad file is listed in `rejections` and does not reject the rest of the batch. Response shape is the same `202` body as the workspace upload, with `moduleId` and `moduleName` set on each accepted document.

**PATCH `/documents/{documentId}/module`**
```json
// Request
{ "moduleId": "uuid" }   // or { "moduleId": null } to unassign
```
`moduleId` must belong to the **same workspace** as the document — cross-workspace assignment returns `400 INVALID_MODULE_SCOPE`.

**GET `/documents/{documentId}`**
```json
{
  "id": "uuid",
  "fileName": "ServiceAgreement.pdf",
  "documentType": "contract",
  "classificationConfidence": 0.93,
  "processingStatus": "READY",
  "overview": "A 12-month service agreement between Acme Corp and Beta Ltd...",
  "summary": "Covers scope of services, payment terms, and termination conditions...",
  "pageCount": 18,
  "createdAt": "2026-09-14T10:05:00Z"
}
```

**GET `/documents/{documentId}/file`**

Streams the original bytes stored in MinIO (`workspace/{workspaceId}/document/{documentId}/original.{ext}`). Available as soon as upload succeeds (`UPLOADED`); does not wait for overview/summary. Authz: workspace member.

Response: `200` with `Content-Type` of the original file (`application/pdf` or DOCX MIME type), `Content-Disposition: inline; filename="<originalFileName>"`, body = original file bytes. Errors: `404 DOCUMENT_NOT_FOUND`, `403 WORKSPACE_ACCESS_DENIED`, `500 STORAGE_READ_FAILED`.

---

## 6. Extracted Fields

| Method | Path | Purpose |
|---|---|---|
| GET | `/documents/{documentId}/fields` | List extracted fields for a document |
| PATCH | `/fields/{fieldId}` | Correct a field's value |
| DELETE | `/fields/{fieldId}` | Remove an incorrect field |
| GET | `/documents/{documentId}/fields/export` | Export fields as CSV/JSON |

**GET `/documents/{documentId}/fields`**
```json
{
  "fields": [
    {
      "id": "uuid",
      "fieldName": "Effective Date",
      "fieldCategory": "universal",
      "fieldValue": "2026-01-01",
      "confidence": 0.97,
      "sourcePage": 1,
      "status": "AI_GENERATED"
    },
    {
      "id": "uuid",
      "fieldName": "Termination Notice Period",
      "fieldCategory": "contract_specific",
      "fieldValue": "30 days",
      "confidence": 0.81,
      "sourcePage": 12,
      "status": "AI_GENERATED"
    }
  ]
}
```

**PATCH `/fields/{fieldId}`**
```json
// Request
{ "fieldValue": "45 days", "status": "CORRECTED" }
```

---

## 7. Chat

> **Strict scope rule:** every chat session is created for exactly one scope — a single workspace, a single module, or a single document (or an explicit list of documents within one workspace). A session can never span more than one workspace, and once created its scope does not change mid-conversation. The server resolves the scope down to a concrete `documentIds` list at creation time and applies it as a hard filter on every retrieval and graph query for that session — see `03_architecture.md` §3.4/§5 and `06_backend_epics_and_stories.md` Stories 5.4/6.2 for how that filter is enforced inside the graph, not just at the API boundary.

| Method | Path | Purpose |
|---|---|---|
| POST | `/workspaces/{workspaceId}/chat-sessions` | Start a chat session scoped to a workspace, a module, or specific documents |
| GET | `/chat-sessions/{sessionId}` | Get session + message history |
| POST | `/chat-sessions/{sessionId}/messages` | Ask a question (streams the answer back) |
| POST | `/messages/{messageId}/feedback` | Thumbs up/down on an answer |

**POST `/workspaces/{workspaceId}/chat-sessions`**

Exactly one of `scope.type` values below — the server rejects a request that mixes them or references anything outside `{workspaceId}`:

```json
// Scope: whole workspace
{ "scope": { "type": "workspace" }, "title": "Ask about everything in Q3 Vendor Review" }

// Scope: one module
{ "scope": { "type": "module", "moduleId": "uuid" }, "title": "Ask about the Contracts module" }

// Scope: specific document(s)
{ "scope": { "type": "documents", "documentIds": ["uuid-1", "uuid-2"] }, "title": "Compare vendor contracts" }
```
```json
// Response — the server always resolves the scope down to a concrete document list
{
  "id": "uuid",
  "scope": { "type": "module", "moduleId": "uuid" },
  "resolvedDocumentIds": ["uuid-1", "uuid-2", "uuid-3"],
  "createdAt": "2026-09-14T10:10:00Z"
}
```

A `moduleId` or any `documentId` that doesn't belong to `{workspaceId}` returns `400 SCOPE_OUTSIDE_WORKSPACE` — this is enforced before a session is ever created, not left to the retrieval layer to catch.

**POST `/chat-sessions/{sessionId}/messages`**
```json
// Request
{ "content": "What's different between the termination clauses in these two contracts?" }
```

Response is streamed as **Server-Sent Events** (`Content-Type: text/event-stream`):

```
event: token
data: {"text": "Agreement A allows termination "}

event: token
data: {"text": "for convenience with 30 days' notice..."}

event: citation
data: {"documentId": "uuid-1", "page": 12, "section": "8.2", "excerpt": "Either party may terminate..."}

event: citation
data: {"documentId": "uuid-2", "page": 9, "section": "6.1", "excerpt": "Termination is permitted only..."}

event: done
data: {"messageId": "uuid", "answerMode": "retrieval_plus_graph", "confidence": 0.88, "isNotFound": false}
```

If evidence is insufficient:
```
event: done
data: {"messageId": "uuid", "answerMode": "retrieval_plus_graph", "confidence": null, "isNotFound": true, "reason": "No supporting evidence found in the selected documents."}
```

**POST `/messages/{messageId}/feedback`**
```json
// Request
{ "rating": "down", "comment": "Missed the second contradiction." }
```

---

## 8. Citations

| Method | Path | Purpose |
|---|---|---|
| GET | `/messages/{messageId}/citations` | List citations for an answer |
| GET | `/citations/{citationId}/source` | Get the highlighted source passage |

**GET `/messages/{messageId}/citations`**
```json
{
  "citations": [
    { "id": "uuid", "documentId": "uuid-1", "page": 12, "section": "8.2", "excerpt": "Either party may terminate for convenience with 30 days' notice." }
  ]
}
```

---

## 9. Evaluation (internal / QA use)

| Method | Path | Purpose |
|---|---|---|
| POST | `/evaluation/runs` | Start a new evaluation run against the fixed test set |
| GET | `/evaluation/runs/{runId}` | Get run status and results |
| GET | `/evaluation/runs/{runId}/report` | Get the retrieval-only vs. retrieval+graph comparison report |

**GET `/evaluation/runs/{runId}/report`**
```json
{
  "runId": "uuid",
  "totalQuestions": 25,
  "retrievalOnly": { "correct": 16, "citationCorrect": 15, "hallucinated": 6 },
  "retrievalPlusGraph": { "correct": 22, "citationCorrect": 21, "hallucinated": 1 },
  "improvement": { "correctnessDelta": "+24%", "hallucinationDelta": "-83%" }
}
```

---

## 10. Internal AI Service contract (Core API → AI Service, not public)

For reference — this is the contract the Spring Boot Core API uses to call the Python AI Service internally. Not exposed to the frontend.

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/ai/documents/process` | Kick off parsing/classification/extraction/graph-build for a document |
| POST | `/internal/ai/chat/answer` | Given a question + workspace + document IDs + mode, return a grounded answer with citations |
| POST | `/internal/ai/evaluation/run` | Execute the fixed test set in both modes |

```json
// POST /internal/ai/chat/answer — request
{
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "question": "What's different between the termination clauses?",
  "resolvedDocumentIds": ["uuid-1", "uuid-2"],
  "scopeType": "documents",
  "mode": "retrieval_plus_graph",
  "requestId": "optional-correlation-id"
}
```

```json
// POST /internal/ai/chat/answer — response (200)
{
  "sessionId": "uuid",
  "question": "...",
  "answerMode": "retrieval_plus_graph",
  "answerText": "Grounded answer assembled from verified evidence.",
  "confidence": 0.88,
  "isNotFound": false,
  "reason": null,
  "citations": [
    {
      "chunkId": "uuid",
      "documentId": "uuid-1",
      "documentName": "contract-a.pdf",
      "pageNumber": 12,
      "sectionHeading": "8.2",
      "sourceExcerpt": "Either party may terminate for convenience with 30 days' notice."
    }
  ],
  "claims": [],
  "diagnostics": {}
}
```

When evidence is insufficient, `isNotFound` is `true`, `confidence` is `null`, `citations` is `[]`, and `answerText` carries the not-found message.
`workspaceId` is passed explicitly and re-validated by the AI service on every call — every retrieval and Cypher query is bounded by it, as defense-in-depth on top of the Core API's own scope check.
