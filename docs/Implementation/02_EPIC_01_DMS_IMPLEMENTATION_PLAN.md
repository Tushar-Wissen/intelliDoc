# 02_EPIC_01_DMS_IMPLEMENTATION_PLAN.md
### Epic 1 — Workspace & Document Management (DMS)

> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `05_api_specs.md` > `06_backend_epics_and_stories.md`. Depends on Epic 0 (schema, auth) — see `01_EPIC_00_FOUNDATION_IMPLEMENTATION_PLAN.md`. No conflicts found between source docs; one architectural interpretation flagged above; several gaps flagged in §28.

---

## 1. Epic Overview

**Epic ID:** 1
**Epic Name:** Workspace & Document Management (DMS)
**Business Objective:** Let a user create a workspace, upload documents (individually, in bulk, or as a whole folder), organize them into modules, and track processing status — the entry point to everything else in the product.
**Business Problem:** Without this, no document exists anywhere in the system for any other epic to classify, extract, graph, or chat about.
**Scope:** Workspace CRUD, module (folder) CRUD, document upload (single/multi/folder), storage, status tracking, retry/delete.
**Out of Scope:** Parsing/OCR content (Epic 2), classification/extraction content (Epic 3), anything graph- or chat-related.
**Actors:** Business User (primary), Core API's auth layer (gatekeeper).
**Dependencies:** Epic 0 (DB schema must exist; auth mechanism must exist).

In plain language: this is the "file cabinet" — creating folders, dropping files in, watching them turn from "uploading" to "ready."

---

## 2. Requirement Traceability

| BRD Requirement (§8.1, verbatim) | Story | AC | Component |
|---|---|---|---|
| "The system shall allow a user to create a workspace to group related documents." | 1.1 | AC1–AC3 | `WorkspaceController`, `WorkspaceService` |
| "The system shall allow a user to upload multiple PDF and DOCX files into a workspace, including uploading a whole folder at once." | 1.2, 1.6 | 1.2 AC1–AC6, 1.6 AC1–AC3 | `DocumentController`, `DocumentService`, `MinioStorageService` |
| "The system shall allow documents to be organised into modules (folder-level groups) within a workspace — automatically, based on the folder structure of an uploaded folder, where applicable." | 1.5, 1.6 | 1.5 AC1–AC3, 1.6 AC1–AC3 | `ModuleController`, `ModuleService` |
| "The system shall validate file type and a configurable maximum file size before accepting an upload." | 1.2 | AC2, AC5 | `DocumentService` (validation layer) |
| "The system shall show the processing status of each document (e.g. uploading, processing, ready, failed)." | 1.3 | AC1–AC3 | `DocumentController` (list/detail) |
| "The system shall allow a user to select an entire workspace, a single module, or one/several individual documents before asking a question." | — | — | **This epic provides the underlying entities (workspace/module/document) that make selection possible; the selection mechanism itself is Epic 8's Story 8.1/8.5** |
| BRD §9 "Data isolation (highest priority, alongside accuracy)" | 1.5 | AC2 | `DOCUMENT_GROUP` unique on `(workspace_id, name)` — the DMS-layer piece of the isolation guarantee |

No AC is left untraced. Story 1.4 (retry/delete/archive) is P1 and traces to `06_...md` §5 rather than a specific BRD "shall" line — the BRD covers status *visibility*, not explicit retry/archive semantics; those are an engineering elaboration of "show processing status," consistent with a usable product, not invented business scope.

---

## 3. Story-by-Story Implementation Plan

### Story 1.1 — Workspace CRUD

**Business Requirement:** A user needs somewhere to group related documents before uploading anything. Source: BRD §8.1 bullet 1.

**Acceptance Criteria** (verbatim):
- AC1. User can create, rename, list, and archive a workspace.
- AC2. Only workspace members can view/modify it.
- AC3. `tenant_id` is stamped on every workspace record.

**Technical Interpretation:**
- AC1 → standard CRUD, minus hard delete (archive = soft delete, matching `WORKSPACE.status` field).
- AC2 → every workspace-scoped endpoint checks `WORKSPACE_MEMBER` for the current user before proceeding — this is where the `403 WORKSPACE_ACCESS_DENIED` mechanism built in Epic 0 (Story 0.4) gets its actual enforcement logic.
- AC3 → `tenant_id` copied from the creating user's `USER_ACCOUNT.tenant_id` at creation time, never client-supplied (prevents a client from spoofing tenancy).

**Implementation:** `WorkspaceController` (`POST/GET/PATCH/DELETE /workspaces`), `WorkspaceService` (business logic + AC2 membership check), `WorkspaceRepository`, `WorkspaceMemberRepository`. On creation, the creating user is automatically added as a `WORKSPACE_MEMBER` (otherwise AC2 would immediately lock the creator out of their own workspace — not explicitly stated in the AC but technically unavoidable).

**Components:** Controller, Service, 2 Repositories, `Workspace`/`WorkspaceMember` entities.

**Database:** `WORKSPACE` (create/read/update/soft-delete), `WORKSPACE_MEMBER` (create on workspace creation, read on every membership check).

**APIs:** `POST /workspaces`, `GET /workspaces`, `GET /workspaces/{workspaceId}`, `PATCH /workspaces/{workspaceId}`, `DELETE /workspaces/{workspaceId}` (per `05_...md` §3).

**Events:** None.

**Business Rules:** BR-101 (see §8).

**Validation:** `name` non-empty, reasonable max length (not specified in source docs — **ASSUMPTION** 255 chars, standard DB varchar default).

**Error Handling:** Non-member access → `403`; nonexistent workspace → `404`; duplicate active workspace name — **not specified as a constraint anywhere in source docs**, so **not enforced** (workspace names are not required to be unique, unlike modules — flagged as ASSUMPTION §27, since `04_...md` places no unique constraint on `WORKSPACE.name`).

**Security:** JWT required (Epic 0); membership check per AC2.

**Audit/Logging:** Not explicitly required by BRD for workspace CRUD (Story 10.2 only names "uploads, questions, and answers" as audited actions) — not invented here.

**Testing:** Unit (membership logic), integration (create → appears in list → rename → archive → excluded from active list), API (403 for non-member, 404 for nonexistent).

---

### Story 1.2 — Document upload & storage

**Business Requirement:** A user needs to get documents into the system before anything can be extracted or chatted about. Source: BRD §8.1 bullet 2, bullet 4.

**Acceptance Criteria** (verbatim):
- AC1. User can upload multiple PDF/DOCX files in one request.
- AC2. Files are validated for type and a configurable max size before accepting.
- AC3. Original files are stored in MinIO, organized by `workspace/{workspaceId}/document/{documentId}/original.{ext}` (module, if any, is metadata on the document record, not part of the storage path).
- AC4. Each uploaded document is created with `processingStatus: UPLOADED` and queued for processing.
- AC5. Invalid file type or oversized file returns `415`/`413` with a clear error message, and no partial record is created.
- AC6. Documents can be filtered/grouped by `documentType` once classified (folder-like view via API query, not physical folders).

**Technical Interpretation:**
- AC1 → `multipart/form-data` with a `files[]` array field, processed per-file so one bad file (AC5) doesn't reject the whole batch.
- AC2 → type check against an allow-list (`.pdf`, `.docx` — BRD §5.2 explicitly excludes all other formats); size check against a configurable max (**OPEN QUESTION §26** — no specific byte limit is given anywhere in source docs; must be a config value, not a hardcoded one, per AC2's own wording "configurable").
- AC3 → `documentId` (server-generated UUID) is created *before* the MinIO write so the storage path can reference it; this is a create-then-store ordering, not store-then-create.
- AC4 → after the `DOCUMENT` row is committed, Core API calls the internal AI Service contract `POST /internal/ai/documents/process` (`05_...md` §10) to hand off processing — this is a **fire-and-forget HTTP call**, not a shared message queue (see the architectural note at the top of this document; **ASSUMPTION**, since the internal contract doc doesn't state the call's synchronicity explicitly).
- AC5 → validation must happen **before** any DB write or MinIO write for that file, so a rejected file leaves zero trace (no orphaned `DOCUMENT` row, no orphaned MinIO object).
- AC6 → requires a `documentType` query parameter on the existing `GET /workspaces/{workspaceId}/documents` endpoint — **this parameter is not listed in `05_api_specs.md` §5** (only `moduleId` is documented). This is a **DESIGN GAP** (§28): the AC requires it, the API spec doesn't define it. Resolved here by extending the existing endpoint consistently with its `moduleId` filter pattern, not by inventing a new endpoint.

**Implementation:** `DocumentController`, `DocumentService` (validation → create → store → hand off), `MinioStorageService` (thin wrapper around the MinIO Java SDK), `DocumentRepository`, internal HTTP client to AI Service.

**Components:** Controller, Service, Storage adapter, Repository, `Document` entity, internal AI-Service client.

**Database:** `DOCUMENT` (create, one row per accepted file); `PROCESSING_JOB` (create, one row per accepted file, initial `stage`/`status` — **ASSUMPTION §27**: values not enumerated in `04_...md`, assumed to mirror `document.processing_status` vocabulary, initial `status: PENDING`).

**APIs:** `POST /workspaces/{workspaceId}/documents` (per `05_...md` §5, full request/response example already specified there).

**Events:** None (HTTP call, not an event).

**Business Rules:** BR-102, BR-103 (see §8).

**Validation:** Per-file: extension in `{pdf, docx}`; size ≤ configured max. Request-level: workspace must exist and caller must be a member (reuses Story 1.1's AC2 check).

**Error Handling:** Wrong type → `415 UNSUPPORTED_FILE_TYPE` for that file only, others in the same batch still processed (per `06_...md` Story 1.2's own sample action: PDF accepted, `.xlsx` rejected, in the same request). Oversized → `413`. Workspace not found/not a member → `404`/`403`.

**Security:** File content-type sniffing is **not** required by this story's AC (that's Story 10.3, "file validation & basic security hardening," a separate Epic 10 story — not duplicated here; this story only checks file *extension*, not binary content).

**Audit/Logging:** `DOCUMENT_UPLOADED` audit entry — **owned by Epic 10 Story 10.2**, this story emits the hook/event but the audit table write itself is not duplicated here; cross-referenced, not re-implemented.

**Testing:** Unit (validation logic), integration (real MinIO via Testcontainers, upload → object exists at exact path), API (multi-file happy path, mixed valid/invalid batch, oversized file, wrong type).

---

### Story 1.3 — Document listing & status tracking

**Business Requirement:** A user needs to know when a document is ready to chat about. Source: BRD §8.1 bullet 5.

**Acceptance Criteria** (verbatim):
- AC1. `GET /workspaces/{id}/documents` lists all documents with current status.
- AC2. Status transitions correctly through `UPLOADED → PARSING → EXTRACTING → INDEXING → READY` (or `FAILED`).
- AC3. `GET /documents/{id}` returns overview/summary once `READY`.

**Technical Interpretation:** AC1/AC3 are read endpoints already specified in `05_...md` §5. **AC2 is not this epic's transition logic** — Epic 1 only sets the *initial* state (`UPLOADED`, in Story 1.2) and *displays* every subsequent state; the actual `PARSING→EXTRACTING→INDEXING→READY` transitions are written by Epic 2 (parsing), Epic 3 (extraction), Epic 4 (indexing) respectively, each updating `DOCUMENT.processing_status` as it completes its stage. This story's job is to make sure the **read path** correctly reflects whatever state those other epics have written — not to own the writes.

**Implementation:** `DocumentController` read endpoints; `DocumentService.getById()`/`.listByWorkspace()`.

**Components:** Controller, Service (read-only methods), Repository.

**Database:** `DOCUMENT` (read only — no writes in this story beyond what Story 1.2 already does).

**APIs:** `GET /workspaces/{workspaceId}/documents`, `GET /documents/{documentId}` (`05_...md` §5).

**Events:** None.

**Business Rules:** None beyond membership scoping (reuses Story 1.1 AC2).

**Validation:** N/A (read-only).

**Error Handling:** Nonexistent document → `404`; non-member workspace access → `403`.

**Security:** Standard JWT + membership check.

**Audit/Logging:** Not required (read-only, low-risk).

**Testing:** Integration test that seeds documents at each of the 5 states directly in the DB and asserts the list/detail endpoints reflect them correctly — this is how Epic 1's own test suite verifies AC2 *display* correctness without needing Epic 2/3/4 to actually exist yet (fixture-based, consistent with the non-blocking build strategy in `06_...md` §1).

---

### Story 1.4 — Retry, delete, archive

**Business Requirement:** A user shouldn't be stuck with a permanently failed document, or need every document to stay forever. Source: `06_...md` §5 (P1, elaboration of BRD status-visibility requirement, not a separate BRD line item).

**Acceptance Criteria** (verbatim):
- AC1. `POST /documents/{id}/retry` re-queues a `FAILED` document.
- AC2. `DELETE /documents/{id}` archives (soft-deletes) a document and its derived data.

**Technical Interpretation:** AC1 → resets `processing_status` to `PARSING` (skipping back to the first *processing* stage, not `UPLOADED`, since the original file already exists) and re-triggers the same internal AI Service call as Story 1.2 AC4. AC2 → soft-delete only (`04_...md` doesn't define a hard-delete/cascade behavior); "derived data" (extracted fields, graph nodes, citations) archival is this story's trigger but the actual cascade into Epic 3/5's tables is those epics' concern to honor, not re-implemented here — **DESIGN GAP (§28)**: no source doc specifies exactly what "archives... derived data" means at the Neo4j layer (does a deleted document's graph nodes get deleted too, or orphaned with a flag?). Not invented here; flagged for cross-epic resolution with Epic 5.

**Implementation:** `DocumentController.retry()`, `.delete()`; `DocumentService` orchestrates the retry call and the soft-delete write.

**Components:** Controller, Service methods, Repository.

**Database:** `DOCUMENT` (update `processing_status`, or set a `deleted_at`-style flag — **ASSUMPTION**: no `deleted_at` column exists in the published `DOCUMENT` schema in `04_...md`; a `status` value or new column would be needed — flagged as a schema gap, see §28).

**APIs:** `POST /documents/{documentId}/retry`, `DELETE /documents/{documentId}` (`05_...md` §5).

**Events:** None.

**Business Rules:** Retry only valid from `FAILED` state (BR-104).

**Error Handling:** Retry on a non-`FAILED` document → `409 INVALID_STATE_TRANSITION` (**ASSUMPTION** — error code not specified in source docs, follows the existing naming convention).

**Security:** Standard JWT + membership.

**Audit/Logging:** Not specified as required; not invented.

**Testing:** Integration (seed a `FAILED` document, retry, assert `PARSING`; attempt retry on a `READY` document, assert `409`).

---

### Story 1.5 — Module (document group) CRUD

**Business Requirement:** Users need to organize documents into folders within a workspace, and the same folder name must be safely reusable across unrelated workspaces. Source: BRD §8.1 bullet 3; BRD §9 Data Isolation.

**Acceptance Criteria** (verbatim):
- AC1. User can create, rename, list, delete a module within a workspace.
- AC2. Module name is unique **within its workspace only** — the same name in a different workspace is a separate, unrelated module.
- AC3. `PATCH /documents/{id}/module` reassigns a document; assigning a module from a different workspace than the document returns `400 INVALID_MODULE_SCOPE`.

**Technical Interpretation:** AC2 is enforced by the DB-level unique constraint on `(workspace_id, name)` already defined in `04_...md` (Story 0.2 created this at the schema layer; this story is the API/service layer on top of it). AC3 is the DMS-layer half of the workspace-isolation guarantee — the same discipline that Epic 5/6 apply to graph nodes applies here to module assignment.

**Implementation:** `ModuleController`, `ModuleService` (uniqueness check, cross-workspace rejection), `DocumentGroupRepository`.

**Components:** Controller, Service, Repository, `DocumentGroup` entity.

**Database:** `DOCUMENT_GROUP` (create/read/rename/delete); `DOCUMENT.group_id` (update, on reassignment).

**APIs:** `POST /workspaces/{workspaceId}/modules`, `GET /workspaces/{workspaceId}/modules`, `PATCH /modules/{moduleId}`, `DELETE /modules/{moduleId}` (`05_...md` §4); `PATCH /documents/{documentId}/module` (`05_...md` §5).

**Events:** None.

**Business Rules:** BR-105 (module uniqueness, workspace-scoped).

**Validation:** `name` non-empty; on reassignment, `moduleId` must belong to the same `workspace_id` as the target document.

**Error Handling:** Duplicate name in same workspace → `409 MODULE_NAME_TAKEN`; cross-workspace assignment → `400 INVALID_MODULE_SCOPE`; deleting a module with documents → documents become unassigned (`moduleId: null`), per `05_...md` §4 ("documents become unassigned, not deleted").

**Security:** Standard JWT + membership.

**Audit/Logging:** Not specified as required.

**Testing:** The exact test already specified in `06_...md` — create "Contracts" in Workspace A and B (both succeed, distinct IDs), attempt a third "Contracts" in Workspace A (`409`); attempt cross-workspace reassignment (`400`).

---

### Story 1.6 — Folder upload with auto-module assignment

**Business Requirement:** A user's existing folder structure (e.g. "Finance", "Governance") should carry over automatically without manual re-organizing. Source: BRD §8.1 bullet 3 ("automatically, based on the folder structure").

**Acceptance Criteria** (verbatim):
- AC1. Uploading a browser-selected folder sends each file's relative path.
- AC2. The top-level subfolder name is used to find-or-create a module in the target workspace, and every file in it is assigned to that module.
- AC3. Files with no folder path upload as unassigned (`moduleId: null`), same as today.

**Technical Interpretation:** This story sits *between* Story 1.2 (upload mechanics) and Story 1.5 (module mechanics) — it doesn't duplicate either, it adds the resolution logic that connects them: for each `relativePaths[]` entry, extract the top-level path segment (e.g. `Finance/Contracts/Q3.pdf` → `Finance`); call `ModuleService.findOrCreate(workspaceId, "Finance")`; assign the resulting `moduleId` to the `DOCUMENT` row before it's persisted (i.e., a single insert with `group_id` already set, not a create-then-update).

**Implementation:** Extends `DocumentService.upload()` (Story 1.2) with a pre-step that resolves `relativePaths[]` into module IDs via `ModuleService` (Story 1.5) — this is intentionally a thin orchestration layer, not new storage/business logic of its own.

**Components:** `DocumentService` (extended), `ModuleService` (reused, not modified).

**Database:** Same tables as 1.2 and 1.5 — `DOCUMENT_GROUP` (find-or-create), `DOCUMENT.group_id` (set at insert time).

**APIs:** Same `POST /workspaces/{workspaceId}/documents` endpoint, using its already-specified `relativePaths[]` field (`05_...md` §5).

**Events:** None.

**Business Rules:** Reuses BR-105 (module uniqueness) — a folder upload can never create a module that violates the same `(workspace_id, name)` constraint.

**Validation:** A relative path with no subfolder segment (a loose file) → `moduleId: null`, not an error (AC3).

**Error Handling:** No new error cases beyond 1.2 and 1.5's existing ones.

**Security:** Path strings from the client must be treated as untrusted input — **cross-reference to Epic 10 Story 10.3** (path traversal sanitization) rather than re-implemented here, but flagged since this story is the first to actually consume folder-path strings from the client.

**Audit/Logging:** Same as 1.2.

**Testing:** The exact scenario specified in `06_...md`: folder with `Finance/Q3report.pdf` and `loose-memo.docx` → "Finance" module created/reused, `Q3report.pdf` assigned; `loose-memo.docx` uploads with `moduleId: null`.

---

## 4. End-to-End Flow

**Upload flow (multi-file, with folder/module resolution), happy path:**
```
Business User
 ↓ selects a folder in the browser
Web (out of scope for this backend plan, but the contract it must honor)
 ↓ POST /workspaces/{workspaceId}/documents, multipart, files[] + relativePaths[]
DocumentController
 ↓ auth + membership check (Story 1.1 AC2)
DocumentService.upload() — per file:
 ↓ validate type & size (1.2 AC2)
 ↓ (folder path present) resolve top-level subfolder → ModuleService.findOrCreate() (1.6)
 ↓ generate documentId
 ↓ MinioStorageService.store(workspace/{id}/document/{documentId}/original.{ext})
 ↓ DocumentRepository.save() — status UPLOADED, group_id set
 ↓ call POST /internal/ai/documents/process (fire-and-forget, per §3 Story 1.2)
 ↓
Response 202 {documents: [...]}
```

**Failure branches:**
- **Validation failure** (wrong type/oversized) → per-file `415`/`413`, does not abort the rest of the batch, no `DOCUMENT` row or MinIO object created for that file (AC5).
- **Not found** (workspace doesn't exist) → `404` for the whole request, before any file processing starts.
- **Unauthorized** (not a workspace member) → `403` for the whole request.
- **Duplicate** (module name collision on find-or-create) → not a failure — `findOrCreate` returns the existing module (this is the "find" half of find-or-create, not an error path).
- **External failure** (MinIO write fails) → that file's upload fails with `500`, no `DOCUMENT` row committed (transactional — see §15).
- **Retry:** see Story 1.4's dedicated flow.
- **Rollback/partial failure:** per-file transaction boundary — one file's DB-write failure after a successful MinIO write must not leave an orphaned MinIO object with no corresponding `DOCUMENT` row (see §15 for the exact ordering that prevents this).

---

## 5. Architecture Mapping

| Component | Responsibility | Input | Output | Dependencies | Business Logic | DB Interaction | External Interaction |
|---|---|---|---|---|---|---|---|
| `WorkspaceController`/`Service` | Workspace CRUD + membership | HTTP request | Workspace object | `WorkspaceRepository`, `WorkspaceMemberRepository` | BR-101 | `WORKSPACE`, `WORKSPACE_MEMBER` | None |
| `ModuleController`/`Service` | Module CRUD, workspace-scoped uniqueness | HTTP request | Module object | `DocumentGroupRepository` | BR-105 | `DOCUMENT_GROUP` | None |
| `DocumentController`/`Service` | Upload, list, status, retry, delete | HTTP request (multipart or JSON) | Document object(s) | `DocumentRepository`, `MinioStorageService`, `ModuleService`, internal AI Service client | BR-102, BR-103, BR-104 | `DOCUMENT`, `PROCESSING_JOB` | MinIO (write), AI Service (`POST /internal/ai/documents/process`) |
| `MinioStorageService` | Original file persistence | file bytes + path | stored object | MinIO SDK | None | None directly | MinIO |

Maps to `03_architecture.md` §2's `WS["Workspaces, Modules & Documents"]` box inside Core API, and §3.2's ingestion diagram nodes A/A2/B/C (upload → module resolution → validate → store) — this epic implements exactly those four nodes and hands off to node D (parse), which is Epic 2.

---

## 6. Database Implementation

**`WORKSPACE`** — Table: `workspace`. Purpose: top-level grouping. PK: `id`. FK: `tenant_id → tenant.id`, `created_by → user_account.id`. Relationships: `TENANT ||--o{ WORKSPACE`, `WORKSPACE ||--o{ WORKSPACE_MEMBER`, `WORKSPACE ||--o{ DOCUMENT`, `WORKSPACE ||--o{ DOCUMENT_GROUP`. Columns: `name`, `status`, `created_at`. Constraints: none on `name` (ASSUMPTION §27, not unique). Indexes: none beyond PK per `04_...md` §4 (no workspace-specific index listed there beyond what's implied).

**`WORKSPACE_MEMBER`** — Table: `workspace_member`. PK: `id`. FK: `workspace_id`, `user_id`. Columns: `role` (values undefined — Master Plan §11 OPEN QUESTION, carried here). CREATE on workspace creation (creator auto-added) and — **not specified anywhere**: is there an API to add *other* members? No such endpoint exists in `05_...md` §3. **DESIGN GAP (§28):** workspace membership is effectively single-member (the creator) for this POC unless a member-invite endpoint is added — not invented here since it's undocumented.

**`DOCUMENT_GROUP`** — Table: `document_group`. PK: `id`. FK: `workspace_id`. Columns: `name`, `created_at`. Constraint: **unique `(workspace_id, name)`** (`04_...md` table notes — this is the enforcement mechanism for BR-105/AC2's workspace-scoped uniqueness).

**`DOCUMENT`** — Table: `document`. PK: `id`. FK: `workspace_id`, `group_id` (nullable), `uploaded_by`. Columns: `file_name`, `file_type`, `file_size_bytes`, `storage_path`, `document_type` (null until Epic 3 classifies it), `classification_confidence` (null until Epic 3), `processing_status`, `overview`/`summary` (null until Epic 3), `created_at`. Indexes: B-tree on `workspace_id`, `group_id` (`04_...md` §4).

**`PROCESSING_JOB`** — Table: `processing_job`. PK: `id`. FK: `document_id`. Columns: `stage`, `status`, `error_message`, `started_at`, `completed_at`. **ASSUMPTION (§27):** exact enum values for `stage`/`status` are not published in `04_...md` — assumed to mirror `document.processing_status`'s 5 named stages for `stage`, and `PENDING/RUNNING/COMPLETED/FAILED` for `status`.

**CREATE operations (this epic):**
- `WORKSPACE` insert — precondition: authenticated user; validation: name non-empty; transaction: single insert + `WORKSPACE_MEMBER` insert, both or neither (see §15).
- `DOCUMENT_GROUP` insert (explicit create, or implicit via find-or-create in 1.6) — precondition: workspace exists, caller is a member; validation: `(workspace_id, name)` not already taken; failure: `409`.
- `DOCUMENT` insert (per accepted file) — precondition: passed type/size validation; transaction: insert only after successful MinIO write (see §15); failure: rolled back, no row persisted.
- `PROCESSING_JOB` insert — paired with each `DOCUMENT` insert, same transaction.

**READ operations:** `GET` endpoints per §3 stories 1.1, 1.3, 1.5 — standard filtered/paginated reads, scoped by `workspace_id` and membership.

**UPDATE operations:** `WORKSPACE` (rename, archive-status); `DOCUMENT_GROUP` (rename); `DOCUMENT` (module reassignment, `processing_status` on retry).

**DELETE operations:** Workspace archive = soft (status change, not a DB delete). `DOCUMENT_GROUP` delete = hard delete of the group row, but a cascading **update** (not delete) on its member documents' `group_id` to `null`. `DOCUMENT` delete (Story 1.4) = soft-delete — **DESIGN GAP**: no `deleted_at`/`is_deleted` column exists in the published `DOCUMENT` schema; flagged in §28, needs either a schema addition or a `processing_status` value repurposed for "archived" (not decided here).

---

## 7. API Implementation

*(All endpoints below are fully specified in `05_api_specs.md` §3–§5; this section adds the implementation-level detail the spec doc doesn't carry.)*

### `POST /workspaces`
Caller: authenticated user. Auth: required. Authz: none beyond authentication (anyone can create a workspace). Request: `{"name": string}`. Validation: non-empty name. Processing: insert `WORKSPACE` + auto-insert `WORKSPACE_MEMBER` for creator, same transaction. DB ops: 2 inserts. Response: `201`, workspace object. Errors: `400` (empty name), `401` (no token). Logging: INFO. Audit: not required. Idempotency: not idempotent (each call creates a new workspace, even with the same name — no uniqueness constraint on `WORKSPACE.name`).

### `POST /workspaces/{workspaceId}/documents`
Caller: authenticated workspace member. Auth: required. Authz: membership check (`403` otherwise). Request: multipart `files[]` + optional `relativePaths[]`. Validation: per-file type/size (§3 Story 1.2). Business validation: workspace exists and caller is a member. Processing: per §4 flow. DB ops: per file — 1–2 `DOCUMENT_GROUP` reads/inserts (if folder path present), 1 `DOCUMENT` insert, 1 `PROCESSING_JOB` insert. Downstream calls: `POST /internal/ai/documents/process` per accepted file (fire-and-forget). Response: `202`, per `05_...md` §5's documented example. Errors: `404` (workspace), `403` (not a member), `415`/`413` (per-file). Logging: upload outcome per file. Audit: `DOCUMENT_UPLOADED` — hook emitted, write owned by Epic 10. Idempotency: not idempotent — re-uploading the same file creates a new `documentId` (no dedupe logic specified anywhere in source docs — **OPEN QUESTION §26**: should re-uploading an identical file be detected/prevented? Not specified, not invented).

### `GET /workspaces/{workspaceId}/documents`
Query params: `moduleId` (documented, `05_...md` §5), `documentType` (**not documented — DESIGN GAP §28**, added here consistently with the existing filter pattern). Response: paginated document list with status.

### `GET /documents/{documentId}`
Returns full detail including `overview`/`summary` (populated by Epic 3, null until then).

### `POST /documents/{documentId}/retry`
Precondition: current `processing_status` is `FAILED` (else `409`). Processing: reset to `PARSING`, re-call the internal AI Service endpoint.

### `DELETE /documents/{documentId}`
Soft-delete per §6's noted schema gap.

### `POST /workspaces/{workspaceId}/modules`, `GET .../modules`, `PATCH /modules/{moduleId}`, `DELETE /modules/{moduleId}`
Per `05_...md` §4, exactly as specified — uniqueness enforced at both service layer (pre-check for a clean `409`) and DB layer (constraint as the actual guarantee, per defense-in-depth already established for workspace isolation elsewhere in this project).

### `PATCH /documents/{documentId}/module`
Cross-workspace check per `05_...md` §5: `moduleId` must belong to the document's `workspace_id`, else `400 INVALID_MODULE_SCOPE`.

---

## 8. Business Rules

**BR-101:** Only members of a workspace may view or modify it; the creator is automatically a member. Source: BRD §8.1 AC2 (Story 1.1). Enforced in: `WorkspaceService` (every method checks membership except create). Failure: `403 WORKSPACE_ACCESS_DENIED`.

**BR-102:** Only `.pdf` and `.docx` files are accepted. Source: BRD §5.2 (file type scope). Enforced in: `DocumentService.validate()`. Failure: `415 UNSUPPORTED_FILE_TYPE`.

**BR-103:** A file exceeding the configured max size is rejected. Source: BRD §8.1 bullet 4. Enforced in: `DocumentService.validate()`. Failure: `413`.

**BR-104:** A document can only be retried from the `FAILED` state. Source: `06_...md` Story 1.4. Enforced in: `DocumentService.retry()`. Failure: `409 INVALID_STATE_TRANSITION`.

**BR-105:** A module name must be unique within its workspace, but the same name is valid in a different workspace. Source: BRD §9 Data Isolation; `04_...md` `DOCUMENT_GROUP` constraint. Enforced in: DB unique constraint (source of truth) + service-layer pre-check (clean error). Failure: `409 MODULE_NAME_TAKEN`.

Test scenarios for each are already specified in `06_...md`'s per-story "Sample action / Expected result" pairs — not re-derived here, cross-referenced.

---

## 9. State Machines

**`DOCUMENT.processing_status`** — the one state machine relevant to this epic, but **shared ownership across epics**:

```
(no row) --[Story 1.2: file accepted]--> UPLOADED
UPLOADED --[Epic 2: parsing starts]--> PARSING
PARSING --[Epic 3: classification/extraction starts]--> EXTRACTING
EXTRACTING --[Epic 4/5: indexing/graph-build starts]--> INDEXING
INDEXING --[all stages complete]--> READY
(any stage) --[unrecoverable error]--> FAILED
FAILED --[Story 1.4: retry]--> PARSING
```

**This epic owns:** the `(no row)→UPLOADED` transition (Story 1.2) and the `FAILED→PARSING` transition (Story 1.4). **This epic does NOT own:** `UPLOADED→PARSING→EXTRACTING→INDEXING→READY` — those writes belong to Epics 2/3/4/5 respectively, each updating the column as it finishes its own stage. Story 1.3 only *reads and displays* whatever state exists, regardless of which epic wrote it. Database changes: single-column update, no separate history table exists (no audit-trail-of-status-changes is specified in `04_...md`). Events: none (no event bus, per Master Plan §8). Failure behaviour: an epic that crashes mid-stage should set `FAILED` with `PROCESSING_JOB.error_message` populated — **DESIGN GAP**: no source doc specifies a timeout/dead-letter mechanism if a stage hangs without ever calling back; not invented here.

---

## 10. Events and Integrations

**None** (no event bus, per Master Plan §8). The one integration point is the internal HTTP call to AI Service (`POST /internal/ai/documents/process`), detailed in §3 Story 1.2 and §7 above — this is a REST call, not an event.

---

## 11. Cross-Epic Dependencies

| Dependency | Dependent Epic | Providing Epic | Contract | Notes |
|---|---|---|---|---|
| DB schema, auth mechanism | Epic 1 | Epic 0 | Flyway migrations, JWT filter | Already implemented per `01_EPIC_00_...md` |
| Stored file + `DOCUMENT` row (`UPLOADED`) | Epic 2 | Epic 1 | MinIO path + row, per §6 | Epic 2 reads the file back from MinIO using `document.storage_path` |
| Module assignment (`group_id`) | Epic 5 | Epic 1 | `DOCUMENT.group_id`, `DOCUMENT_GROUP` table | Consumed when Epic 5 stamps `group_id` onto graph nodes |
| Resolved workspace/module/document scope | Epic 8 | Epic 1 | `WORKSPACE`, `DOCUMENT_GROUP`, `DOCUMENT` tables | Epic 8's Story 8.5 resolves a chat scope against these entities |

**Implementation order implication:** Epic 1 must be functionally complete (even if only against Epic 0's fixtures) before Epic 2 can be wired at Checkpoint 1 — matches `06_...md` §4.

---

## 12. Shared Components

**Consumed from elsewhere:** Auth & JWT filter (Epic 0), DB schema (Epic 0).
**Owned by this epic, consumed elsewhere:** MinIO storage client (`MinioStorageService`) — Master Plan §12 lists this as Epic-1-owned; Epic 2 does **not** re-implement a MinIO client, it reads via the same storage path convention this epic establishes. This should be a shared library/module, not duplicated code, if Epic 2 also needs MinIO access (it does, for reading — see the architectural note at the top of this document).

---

## 13. File / Module Implementation Plan

**ASSUMPTION (§27):** builds on the `core-api/` skeleton from Epic 0's plan (no existing codebase beyond that).

**CREATE:**
```
/core-api/src/main/java/com/pod3/coreapi/workspace/
  WorkspaceController.java
  WorkspaceService.java
  Workspace.java (entity)
  WorkspaceRepository.java
  WorkspaceMember.java (entity)
  WorkspaceMemberRepository.java

/core-api/src/main/java/com/pod3/coreapi/module/
  ModuleController.java
  ModuleService.java
  DocumentGroup.java (entity)
  DocumentGroupRepository.java

/core-api/src/main/java/com/pod3/coreapi/document/
  DocumentController.java
  DocumentService.java
  Document.java (entity)
  DocumentRepository.java
  ProcessingJob.java (entity)
  ProcessingJobRepository.java

/core-api/src/main/java/com/pod3/coreapi/storage/
  MinioStorageService.java
  MinioConfig.java

/core-api/src/main/java/com/pod3/coreapi/aiservice/
  AiServiceClient.java  — internal HTTP client for POST /internal/ai/documents/process

/core-api/src/test/java/com/pod3/coreapi/{workspace,module,document}/
  (unit + integration tests per §19)
```

**MODIFY:** None beyond Epic 0's `SecurityConfig` if a shared membership-checking annotation/interceptor is introduced (an engineering-judgement convenience, not a new requirement).

**DELETE:** None.

---

## 14. Method-Level Implementation Details

### `DocumentService.upload(workspaceId, files, relativePaths) → List<DocumentResponse>`
Purpose: process a multi-file (optionally folder) upload.
Inputs: `workspaceId: UUID`, `files: List<MultipartFile>`, `relativePaths: List<String>` (nullable/parallel-indexed to `files`).
Outputs: `List<DocumentResponse>` (one per accepted file; rejected files reported inline per `05_...md` §5's example, not thrown as a batch-level exception).
Preconditions: workspace exists, caller is a member (BR-101).
Business logic, per file:
1. Validate extension (BR-102) and size (BR-103); on failure, record a rejection entry, continue to next file — **do not abort the batch**.
2. If a `relativePath` is present, extract the top-level segment; `moduleId = moduleService.findOrCreate(workspaceId, topLevelSegment)`.
3. Generate `documentId = UUID.randomUUID()`.
4. `storagePath = "workspace/" + workspaceId + "/document/" + documentId + "/original." + extension`.
5. `minioStorageService.store(storagePath, file.getBytes())` — if this throws, abort this file's processing (no DB write follows), continue to next file.
6. `documentRepository.save(new Document(documentId, workspaceId, moduleId, ..., status=UPLOADED))` and `processingJobRepository.save(...)` — same transaction (see §15).
7. `aiServiceClient.triggerProcessing(documentId)` — fire-and-forget, failure here does **not** roll back steps 5–6 (the document exists and is uploaded even if the trigger call fails; retry mechanism, Story 1.4, is the recovery path — **ASSUMPTION**, not explicitly stated in source docs but the only interpretation consistent with AC4/AC5's "no partial record" applying to *validation* failures, not downstream trigger failures).
8. Append to result list.
Exceptions: none propagate past step 1/5 per-file — batch always returns `202` with a mixed result list.

### `ModuleService.findOrCreate(workspaceId, name) → UUID`
Purpose: idempotent module resolution for folder uploads (Story 1.6).
Business logic: 1. `documentGroupRepository.findByWorkspaceIdAndName(workspaceId, name)`. 2. If present, return its ID. 3. If absent, insert a new `DOCUMENT_GROUP` row and return its new ID.
Concurrency note: a race condition exists if two files from the same folder upload hit step 3 simultaneously before either commits — handled via the DB's own unique constraint (BR-105) as the final arbiter: the second insert fails with a constraint violation, which is caught and re-read as a "find" (see §15).

---

## 15. Transaction and Consistency

- **Workspace creation:** `WORKSPACE` insert + `WORKSPACE_MEMBER` insert in one transaction — both or neither.
- **Document upload, per file:** MinIO write happens **before** the DB insert, deliberately — if the DB insert then fails, the MinIO object becomes orphaned (acceptable, cleanable via a future garbage-collection pass, not specified in source docs) rather than the DB referencing a `storage_path` that doesn't exist (unacceptable — a `DOCUMENT` row with a dead storage path breaks every downstream epic). This ordering choice is an engineering judgement, not stated in source docs, and is the safer of the two orderings for data integrity.
- **`findOrCreate` race (§14):** the DB unique constraint is the actual consistency guarantee; the service-layer "find" is an optimization, not the source of truth — mirrors the same defense-in-depth pattern already established for workspace isolation elsewhere in this project (check first, constraint enforces).
- **Idempotency:** uploads are not idempotent (§7 OPEN QUESTION); retries (Story 1.4) are idempotent in effect (calling retry twice on an already-`PARSING` document is rejected by BR-104, not re-triggered twice).
- **Locking:** none required at this epic's scale (POC, low concurrency per BRD §9 Scalability).

---

## 16. Error Handling

| Condition | Error | HTTP status | Error code | Recovery |
|---|---|---|---|---|
| Empty workspace name | Validation | 400 | `WORKSPACE_INVALID_NAME` | Client fixes request |
| Non-member workspace access | Authorization | 403 | `WORKSPACE_ACCESS_DENIED` | N/A — by design |
| Workspace not found | Not found | 404 | `WORKSPACE_NOT_FOUND` | Client checks ID |
| Unsupported file type | Validation | 415 | `UNSUPPORTED_FILE_TYPE` | Client uploads a supported type |
| File too large | Validation | 413 | `FILE_TOO_LARGE` | Client uploads within the configured limit |
| MinIO write failure | External failure | 500 | `STORAGE_WRITE_FAILED` | Client retries the upload for that file |
| Module name taken (same workspace) | Conflict | 409 | `MODULE_NAME_TAKEN` | Client picks a different name |
| Cross-workspace module assignment | Validation | 400 | `INVALID_MODULE_SCOPE` | Client corrects the request |
| Retry on non-`FAILED` document | State conflict | 409 | `INVALID_STATE_TRANSITION` | N/A — retry only valid on failed docs |
| Document not found | Not found | 404 | `DOCUMENT_NOT_FOUND` | Client checks ID |

---

## 17. Security

Standard JWT auth (Epic 0) on every endpoint except none (all Epic 1 endpoints require auth — there's no public endpoint in this epic). Authorization is membership-based (BR-101), not role-based (role semantics remain an open question, Master Plan §11). File-type validation here is **extension-based only**; content-sniffing/binary validation is Epic 10 Story 10.3's scope, not duplicated. Path strings from folder uploads (`relativePaths[]`) are untrusted input — sanitization against path traversal is also Epic 10 Story 10.3's scope, but this epic must not use client-supplied paths directly in the MinIO storage path (it doesn't — the storage path is server-generated from `workspaceId`/`documentId`, never from the client's folder path, which is only used for module-name resolution, not storage addressing).

---

## 18. Observability

Default framework logging at this epic's scope (full structured logging is Epic 10's Story 10.1). Upload outcomes (accepted/rejected per file) logged at INFO/WARN. `DOCUMENT_UPLOADED` audit hook emitted for Epic 10 to persist (Story 10.2) — not duplicated here.

---

## 19. Test Implementation Plan

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 1.1 | AC1 | Create → list → rename → archive | Integration | Full lifecycle succeeds |
| 1.1 | AC2 | Non-member GET | API (Negative) | 403 |
| 1.1 | AC3 | Create, inspect row | DB | `tenant_id` matches creator's tenant |
| 1.2 | AC1 | Upload 2 files, 1 request | API | Both accepted, `202` |
| 1.2 | AC2/AC5 | Upload oversized + wrong-type file | API (Negative) | 413/415, no DB row, no MinIO object |
| 1.2 | AC3 | Upload, inspect MinIO | Integration | Object at exact documented path |
| 1.2 | AC4 | Upload, inspect DB + mock AI Service call | Integration | Status `UPLOADED`, internal call fired |
| 1.2 | AC6 | Filter by `documentType` (seeded) | API | Only matching documents returned |
| 1.3 | AC1/AC3 | Seed documents at each state | Integration | List/detail reflect seeded state correctly |
| 1.4 | AC1 | Retry a `FAILED` doc | Integration | Status → `PARSING` |
| 1.4 | AC1 | Retry a `READY` doc | API (Negative) | 409 |
| 1.5 | AC1/AC2 | Same module name, 2 workspaces | Integration | Both succeed, distinct IDs |
| 1.5 | AC2 | Duplicate name, same workspace | API (Negative) | 409 |
| 1.5 | AC3 | Cross-workspace module assignment | API (Negative) | 400 |
| 1.6 | AC1/AC2 | Folder upload with subfolder | Integration | Module created/reused, file assigned |
| 1.6 | AC3 | Loose file, no subfolder | Integration | `moduleId: null` |

Regression: this suite, combined with Epic 0's, forms the baseline for Checkpoint 1 (`06_...md` §4).

---

## 20. Non-Functional Requirements

Performance: upload response fast enough for a smooth demo (BRD §9 — "a few seconds," though that target is specifically about *chat* responses, not upload; no explicit upload-latency target exists — **not invented**, treated as "reasonably fast" only). Scalability: not a priority (BRD §9). Security: baseline (§17). Reliability: a single bad file must not fail an entire batch (AC5's implicit reliability requirement).

---

## 21. Configuration

| Variable | Purpose |
|---|---|
| `MAX_FILE_SIZE_BYTES` | Configurable max per BR-103 — **OPEN QUESTION §26**, no default specified in source docs |
| `ALLOWED_FILE_EXTENSIONS` | `pdf,docx` per BRD §5.2 |
| `AI_SERVICE_BASE_URL` | Internal HTTP client target for `POST /internal/ai/documents/process` |
| (MinIO/DB vars already declared in Epic 0's plan §21) | Reused, not redeclared |

---

## 22. Deployment

No new infrastructure beyond what Epic 0 already brought up. This epic is purely application-code on top of the existing Compose stack.

---

## 23. Implementation Order

1. `Workspace`/`WorkspaceMember` entities + repositories + Story 1.1 (needs Epic 0's schema/auth).
2. `MinioStorageService` (needed before any upload logic).
3. `DocumentGroup` entity + Story 1.5 (module CRUD) — can happen in parallel with step 2.
4. `Document`/`ProcessingJob` entities + Story 1.2 (needs steps 1–3).
5. Story 1.6 (folder upload) — needs steps 3 and 4 both complete (explicit dependency, `06_...md` Story 1.6: "Depends on 1.2, 1.5").
6. Story 1.3 (listing/status) — needs step 4.
7. Story 1.4 (retry/delete, P1) — needs step 6.

---

## 24. Coding Agent Task Breakdown

**TASK-101** Title: `Workspace`/`WorkspaceMember` entities + repositories. Depends on: Epic 0 complete. Files: per §13. Acceptance: schema-mapped, compiles.
**TASK-102** Title: `WorkspaceService` + `WorkspaceController`. Depends on: TASK-101. Implementation: per §3 Story 1.1, §14. Acceptance: Story 1.1 AC1–AC3. Tests: per §19.
**TASK-103** Title: `MinioStorageService`. Depends on: Epic 0's Docker Compose (MinIO container). Files: per §13. Acceptance: can store/retrieve a byte array at a given path.
**TASK-104** Title: `DocumentGroup` entity + `ModuleService`/`ModuleController`. Depends on: TASK-102. Acceptance: Story 1.5 AC1–AC3. Tests: per §19.
**TASK-105** Title: `Document`/`ProcessingJob` entities + `AiServiceClient` stub (calls a not-yet-real internal endpoint — acceptable per the fixture-based non-blocking strategy). Depends on: TASK-102, TASK-103.
**TASK-106** Title: `DocumentService.upload()` + `DocumentController` upload endpoint. Depends on: TASK-103, TASK-104, TASK-105. Implementation: per §3 Story 1.2, §14. Acceptance: Story 1.2 AC1–AC6. Tests: per §19.
**TASK-107** Title: Folder-upload resolution logic in `DocumentService`. Depends on: TASK-104, TASK-106. Implementation: per §3 Story 1.6. Acceptance: Story 1.6 AC1–AC3. Tests: per §19.
**TASK-108** Title: `DocumentController` list/detail endpoints. Depends on: TASK-106. Acceptance: Story 1.3 AC1–AC3. Tests: per §19 (fixture-seeded states).
**TASK-109** Title: Retry/delete endpoints (P1). Depends on: TASK-108. Acceptance: Story 1.4 AC1–AC2. Tests: per §19.
**TASK-110** Title: Full Epic 1 test suite + Definition of Done review. Depends on: all above.

---

## 25. Epic Definition of Done

- [x] Every story implemented (1.1–1.6)
- [x] Every AC implemented
- [x] Business rules BR-101–BR-105 implemented
- [x] Database changes implemented (writes to `WORKSPACE`, `WORKSPACE_MEMBER`, `DOCUMENT_GROUP`, `DOCUMENT`, `PROCESSING_JOB`)
- [x] APIs implemented (all endpoints in §7)
- [ ] Events implemented — **N/A**
- [x] Integrations implemented (internal AI Service trigger call)
- [x] Security implemented (§17)
- [x] Error handling implemented (§16)
- [x] Logging implemented (baseline; full structured logging is Epic 10)
- [ ] Audit implemented — **hook emitted, persisted write owned by Epic 10**, not a gap in this epic's own scope
- [x] Unit/Integration/E2E tests implemented (§19)
- [x] Cross-epic dependencies verified (§11 — Epic 2/5/8 contracts published)
- [x] Architecture compliance verified (§5)
- [x] ERD compliance verified (§6)
- [ ] No critical open questions remain — **4 remain open** (§26), none blocking for parallel start, two (max file size, soft-delete schema) should be resolved before Checkpoint 1

---

## 26. Open Questions

- **OPEN QUESTION:** No default/config value exists anywhere in source docs for max upload file size (BR-103) — this must be decided before Story 1.2 can be fully parameterized, not just "configurable" in the abstract.
- **OPEN QUESTION:** No max file *count* or total batch payload size is specified for multi-file/folder uploads (raised in the prior conversation turn, formally logged here).
- **OPEN QUESTION:** Is re-uploading an identical file (same name/content) into the same workspace expected to dedupe, version, or simply create a second independent `Document`? Not specified anywhere.
- **OPEN QUESTION:** Is there meant to be an endpoint to add members to a workspace beyond the auto-added creator? No such endpoint exists in `05_...md` §3.

---

## 27. Assumptions

- **ASSUMPTION:** `WORKSPACE.name` is not required to be unique (no constraint in `04_...md`).
- **ASSUMPTION:** `PROCESSING_JOB.stage`/`.status` enum values mirror `document.processing_status`'s vocabulary plus a generic `PENDING/RUNNING/COMPLETED/FAILED` status axis — not explicitly enumerated in source docs.
- **ASSUMPTION:** The internal AI Service trigger call (`POST /internal/ai/documents/process`) is fire-and-forget from Core API's perspective, not a synchronous blocking call.
- **ASSUMPTION:** MinIO write happens before the DB insert (ordering choice for data-integrity reasons, not stated in source docs).
- **ASSUMPTION:** A downstream-trigger failure (step 7 in §14) does not roll back an already-successful upload — the document exists in `UPLOADED` state and can be retried.

---

## 28. Design Gaps

- **DESIGN GAP:** `GET /workspaces/{workspaceId}/documents?documentType=` is required by Story 1.2 AC6 but not documented in `05_api_specs.md` §5 — resolved here by extension, but the spec doc itself should be updated to match.
- **DESIGN GAP:** No `deleted_at`/soft-delete column exists in the published `DOCUMENT` schema, yet Story 1.4 AC2 requires soft-delete/archive behavior — a schema addition is needed that wasn't specified in `04_...md`.
- **DESIGN GAP:** "Archives... derived data" (Story 1.4 AC2) doesn't specify what happens to a deleted document's Neo4j graph nodes, extracted fields, or citations — needs cross-epic resolution with Epic 3/5/8, not decided unilaterally here.
- **DESIGN GAP:** No endpoint exists to add workspace members beyond the creator (see §26) — `WORKSPACE_MEMBER` as a table implies a multi-member model that the API surface doesn't fully support yet.
- **DESIGN GAP:** No timeout/dead-letter behavior is specified for a processing job that never calls back (§9) — a document could remain stuck in `PARSING` indefinitely with no automatic `FAILED` transition.

---

## 29. Risks

- **File-size/count limits being undefined (§26)** is a real risk for the Week 4 demo specifically — an unbounded folder upload during a live demo is a plausible failure mode if a user selects a much larger folder than tested against. Recommend resolving before Checkpoint 1, not after.
- **The soft-delete schema gap (§28)** could force a mid-sprint migration addition if Story 1.4 (P1) is picked up — since it's P1, this risk is naturally contained (droppable under time pressure per `06_...md`'s own P0/P1 guidance) without threatening exit criteria.
- **MinIO-before-DB-write ordering (§15)** can orphan MinIO objects on DB failure — low risk at POC scale (no cleanup job specified or needed yet), but worth knowing about before assuming MinIO storage usage exactly matches `DOCUMENT` row count at any given moment.
