# Backend Epics & Stories — 2-Week Sprint Plan
### Pod 3: Document Extractor + Chatbot

> Team: **1 Senior Developer + 3 Junior Developers**, all backend. FE team works in parallel from Day 1 against a frozen API contract. Every story is written to be **self-owned** — a developer picks it up, reads the AC, and starts, without waiting on a stand-up assignment.

---

## 1. How we make everything non-blocking

This is the single most important design decision in this plan, so it's stated once up front instead of repeated in every story.

1. **Contracts are already frozen.** `03_architecture.md`, `04_db_mapping_and_er_diagram.md`, and `05_api_specs.md` are the agreed contracts. No story needs to wait for another developer to "decide" an interface — it's already written down.
2. **Every story that consumes another module's output builds against a stub/fixture first**, not the real thing. Example: the Retrieval epic doesn't wait for real parsed documents — it's built against a fixture of 20 pre-made chunks with embeddings, seeded directly into Postgres on Day 1. When the real Parsing epic finishes, swapping the fixture for the real pipeline is a same-day "wire-up," not a redesign.
3. **Adapter pattern on every boundary** (storage, LLM provider, parser, reranker) — so a story can be finished and tested in isolation, then wired in later without touching its internals.
4. **Three integration checkpoints**, not one big-bang integration at the end (see §4). Small, frequent wiring beats one risky merge on Day 10.
5. **FE unblocked from Day 1**: the API spec is published as an OpenAPI file + mock server (Prism/WireMock) on Day 1, so FE builds against realistic mock responses immediately and swaps to the live backend incrementally as each endpoint goes live.

---

## 2. Backlog priority key

- **P0** — required for the two POC exit criteria (accuracy proof + demo). Cannot be dropped.
- **P1** — valuable, but can slip past Day 10 or be cut under time pressure without breaking the exit criteria.

---

## 3. Epic overview

| Epic | Focus | Total est. (dev-days) | Recommended skill fit |
|---|---|---|---|
| 0. Foundation & Environment | Repo, Docker Compose, DB migrations, CI, Auth skeleton | 3.0 | Senior kicks off, then anyone |
| 1. Workspace & Document Management (DMS) | Upload, storage, status tracking, modules (folders) | 5.75 | Junior-friendly |
| 2. Parsing & OCR Pipeline | PDF/DOCX parsing, selective OCR, chunking | 4.5 | Junior-friendly (with senior review) |
| 3. Classification & Field Extraction | Doc-type detection, key fields, correction API | 5.5 | Junior-friendly |
| 4. Search Indexing | Embeddings + pgvector, full-text index | 2.5 | Junior-friendly |
| 5. Knowledge Graph Construction | Entities, relationships, Neo4j, contradictions, **strict workspace isolation** | 5.2 | **Senior-recommended** |
| 6. Hybrid Retrieval & Reranking | Vector+keyword+graph merge, reranking, **scope-bounded traversal** | 4.8 | **Senior-recommended** |
| 7. Answer Generation & Verification | Grounded answer, claim verification | 3.5 | **Senior-recommended** |
| 8. Chat API & Citations | Sessions (workspace/module/document scope), SSE streaming, citations | 4.5 | Junior-friendly |
| 9. Feedback & Evaluation | Feedback API, evaluation harness, report | 4.0 | Mixed |
| 10. Cross-cutting Hardening | Logging, audit, file validation | 2.0 | Junior-friendly |
| **Total** | | **42.25** | capacity: 4 devs × 10 days = 40 |

> Epic 5 dropped from 6.0 to 4.5 after adopting `neo4j-graphrag-python` (see `03_architecture.md` §3), then rose to 5.2 after adding mandatory workspace-scoping to entity resolution and contradiction detection. Epic 6 rose from 4.5 to 4.8 for the same reason (scope-bounded graph traversal, not just result filtering). Epic 1 rose from 4.0 to 5.75 with the addition of module (folder) support. Epic 8 rose from 4.0 to 4.5 for workspace/module-scoped session creation. **Net: still ~2.25 dev-days over raw capacity** — same guidance as before: drop P1 stories first if the sprint runs tight, never the workspace-isolation work, since that's a correctness guarantee, not a feature.

---

## 4. 2-week calendar (illustrative — self-pick, not fixed assignment)

| Day | Milestone |
|---|---|
| Day 1 (AM) | Epic 0 stories done; repo, Docker Compose, DB migrated, CI green. OpenAPI spec published, FE mock server live. |
| Day 1 (PM) – Day 4 | Epics 1, 2, 3, 4 in progress in parallel, each against seeded fixture data. Epic 5/6/7 (senior) also starts Day 1 against the same fixtures — does **not** wait for Epics 1–4 to finish. |
| **Day 5 — Checkpoint 1** | Wire real output of Parsing (2) → Extraction (3) → Indexing (4) → Graph (5). Run one document through the real pipeline end-to-end. |
| Day 6 – Day 8 | Epics 6, 7, 8 continue/finish; Epic 9 harness + loader built in parallel against stubbed chat responses. |
| **Day 8 — Checkpoint 2** | Wire Retrieval (6) → Generation (7) → Chat API (8). Run one real question through the real pipeline end-to-end. |
| Day 9 | Epic 9 (evaluation) wired to the real chat pipeline; Epic 10 hardening; bug fixes from checkpoints. |
| **Day 10 — Checkpoint 3** | Full backend integration test, evaluation dry run, FE contract verification against live (not mocked) backend. Demo rehearsal readiness. |

---

## 5. Epic 0 — Foundation & Environment Setup

### Story 0.1 — Repo & Docker Compose skeleton
*Est: 0.5d · P0 · No dependency*
**AC1.** A single `docker-compose up` starts core-api, ai-service, postgres, neo4j, redis, minio containers.
**AC2.** Each service exposes a `/health` endpoint returning `200 OK`.
**AC3.** README documents how to run it locally in under 10 minutes.
**Sample action:** Run `docker-compose up` on a clean machine.
**Expected result:** All 6 containers report healthy within 2 minutes; hitting `http://localhost:8080/health` returns `{"status":"UP"}`.

### Story 0.2 — Database schema & migrations
*Est: 1.0d · P0 · No dependency (built directly from `04_db_mapping_and_er_diagram.md`)*
**AC1.** Flyway migration scripts create every table in the ER diagram.
**AC2.** pgvector extension enabled; `document_chunk.embedding` is a `vector` column with an HNSW index.
**AC3.** Migrations are idempotent and run automatically on container start.
**Sample action:** Start Postgres container fresh, inspect schema via `\dt`.
**Expected result:** All 17 tables from the ER diagram exist with correct columns and foreign keys.

### Story 0.3 — CI pipeline
*Est: 0.5d · P1 · Depends on 0.1*
**AC1.** GitHub Actions runs build + unit tests on every push.
**AC2.** Pipeline fails the build if tests fail.
**AC3.** Build artifacts (docker images) are tagged with commit SHA.
**Sample action:** Push a commit with a failing test.
**Expected result:** PR shows a red CI check with the failing test name.

### Story 0.4 — Auth skeleton (login/logout/me)
*Est: 1.0d · P0 · No dependency*
**AC1.** `POST /auth/login` returns a bearer token for valid credentials.
**AC2.** `GET /auth/me` returns the current user given a valid token.
**AC3.** Protected endpoints return `401` without a token and `403` for wrong-workspace access.
**Sample action:** `POST /auth/login` with valid credentials, then `GET /auth/me` with the returned token.
**Expected result:** Login returns `{"token": "...", "user": {...}}`; `/auth/me` returns the matching user profile.

---

## 6. Epic 1 — Workspace & Document Management (DMS)

### Story 1.1 — Workspace CRUD
*Est: 1.0d · P0 · Depends on 0.2, 0.4*
**AC1.** User can create, rename, list, and archive a workspace.
**AC2.** Only workspace members can view/modify it.
**AC3.** `tenant_id` is stamped on every workspace record.
**Sample action:** `POST /workspaces {"name":"Q3 Vendor Review"}`.
**Expected result:** `201` with a workspace object containing `id`, `status: "ACTIVE"`.

### Story 1.2 — Document upload & storage (the "build DMS" story)
*Est: 1.5d · P0 · Depends on 1.1*
**AC1.** User can upload multiple PDF/DOCX files in one request.
**AC2.** Files are validated for type and a configurable max size before accepting.
**AC3.** Original files are stored in MinIO, organized by `workspace/{workspaceId}/document/{documentId}/original.{ext}` (module, if any, is metadata on the document record, not part of the storage path).
**AC4.** Each uploaded document is created with `processingStatus: UPLOADED` and queued for processing.
**AC5.** Invalid file type or oversized file returns `415`/`413` with a clear error message, and no partial record is created.
**AC6.** Documents can be filtered/grouped by `documentType` once classified (folder-like view via API query, not physical folders).
**Sample action:** Upload `ServiceAgreement.pdf` and `Q2Report.xlsx` (unsupported type) in one request.
**Expected result:** The PDF is accepted (`201`, status `UPLOADED`, visible under the workspace); the `.xlsx` is rejected with `415 UNSUPPORTED_FILE_TYPE` and does not appear in the document list.

### Story 1.3 — Document listing & status tracking
*Est: 1.0d · P0 · Depends on 1.2*
**AC1.** `GET /workspaces/{id}/documents` lists all documents with current status.
**AC2.** Status transitions correctly through `UPLOADED → PARSING → EXTRACTING → INDEXING → READY` (or `FAILED`).
**AC3.** `GET /documents/{id}` returns overview/summary once `READY`.
**Sample action:** Poll `GET /documents/{id}` every few seconds after upload.
**Expected result:** Status visibly progresses through each stage and lands on `READY` (or `FAILED` with an `error_message`).

### Story 1.4 — Retry, delete, archive
*Est: 0.5d · P1 · Depends on 1.3*
**AC1.** `POST /documents/{id}/retry` re-queues a `FAILED` document.
**AC2.** `DELETE /documents/{id}` archives (soft-deletes) a document and its derived data.
**Sample action:** Retry a document stuck in `FAILED`.
**Expected result:** Status resets to `PARSING` and either reaches `READY` or fails again with an updated error message.

### Story 1.5 — Module (document group) CRUD
*Est: 0.75d · P0 · Depends on 1.1*
**AC1.** User can create, rename, list, delete a module within a workspace.
**AC2.** Module name is unique **within its workspace only** — the same name in a different workspace is a separate, unrelated module.
**AC3.** `PATCH /documents/{id}/module` reassigns a document; assigning a module from a different workspace than the document returns `400 INVALID_MODULE_SCOPE`.
**Sample action:** Create a module named "Contracts" in Workspace A, then create another module also named "Contracts" in Workspace B.
**Expected result:** Both succeed with distinct IDs; attempting a third "Contracts" module inside Workspace A returns `409 MODULE_NAME_TAKEN`.

### Story 1.6 — Folder upload with auto-module assignment
*Est: 1.0d · P0 · Depends on 1.2, 1.5*
**AC1.** Uploading a browser-selected folder sends each file's relative path.
**AC2.** The top-level subfolder name is used to find-or-create a module in the target workspace, and every file in it is assigned to that module.
**AC3.** Files with no folder path upload as unassigned (`moduleId: null`), same as today.
**Sample action:** Upload a folder containing `Finance/Q3report.pdf` and `loose-memo.docx` (no subfolder).
**Expected result:** A "Finance" module is created (or reused) and `Q3report.pdf` is assigned to it; `loose-memo.docx` uploads with `moduleId: null`.

---

## 7. Epic 2 — Parsing & OCR Pipeline

### Story 2.1 — PDF/DOCX text & structure extraction
*Est: 2.0d · P0 · No hard dependency — build against 5 seeded sample files, wire to real upload flow at Checkpoint 1*
**AC1.** For a text-based PDF, extracted output preserves page number, headings, and paragraph order.
**AC2.** For a DOCX, headings, paragraphs, and tables are preserved with structure intact.
**AC3.** Output is stored in `document_page` and `document_section` tables.
**Sample action:** Parse a 10-page contract PDF.
**Expected result:** 10 `document_page` rows created, each with correct `page_number` and non-empty `raw_text`; section headings match the document's actual headings.

### Story 2.2 — Scanned-page detection + selective OCR
*Est: 1.5d · P0 · Depends on 2.1 (same story track, can start once page objects exist — use fixture pages)*
**AC1.** Pages with low extractable text are flagged as scanned.
**AC2.** OCR runs only on flagged pages, not the whole document.
**AC3.** `document_page.ocr_confidence` is recorded for OCR'd pages.
**Sample action:** Parse a document with 2 scanned pages out of 10.
**Expected result:** Exactly those 2 pages have `was_ocr: true` and a populated `ocr_confidence`; the other 8 are untouched by OCR.

### Story 2.3 — Structure-aware chunking
*Est: 1.0d · P0 · Depends on 2.1*
**AC1.** Chunks respect section/paragraph boundaries (no mid-sentence splits where avoidable).
**AC2.** Each chunk stores `document_id`, `section_id`, `page_number`, `chunk_text`, `token_count`.
**AC3.** Average chunk size stays within an agreed token range (e.g. 200–500 tokens).
**Sample action:** Chunk a 10-page document.
**Expected result:** Chunks created in `document_chunk`, each traceable to a real page/section, none exceeding the max token limit.

---

## 8. Epic 3 — Classification & Field Extraction

### Story 3.1 — Document type classification
*Est: 1.0d · P0 · Built against fixture chunk text; wired to real parsing at Checkpoint 1*
**AC1.** Returns one of the supported types (contract, proposal, financial report, policy, other) with a confidence score.
**AC2.** Low-confidence classifications (< 0.5) are flagged, not silently accepted.
**Sample action:** Classify a sample contract's extracted text.
**Expected result:** `documentType: "contract"`, `classificationConfidence: 0.93`.

### Story 3.2 — Universal field extraction
*Est: 1.5d · P0 · Depends on 3.1*
**AC1.** Extracts title, parties, key dates, amounts, reference numbers, topics for every document type.
**AC2.** Each field stores `source_page`, `source_chunk_id`, and `confidence`.
**AC3.** Extraction returns structured JSON (schema-validated), never free text.
**Sample action:** Extract fields from a signed service agreement.
**Expected result:** Fields returned include `Effective Date: 2026-01-01 (confidence 0.97, page 1)`, `Parties: Acme Corp, Beta Ltd`.

### Story 3.3 — Document-type-specific field extraction
*Est: 1.5d · P0 · Depends on 3.1, 3.2*
**AC1.** Contract → obligations, termination terms. Financial report → revenue, forecasts. Etc. (per BRD table).
**AC2.** Fields not applicable to a type are simply omitted, not returned as null noise.
**Sample action:** Extract fields from a financial report.
**Expected result:** Fields include `Revenue`, `EBITDA`, `Forecast Period` — no `Termination Terms` field is present.

### Story 3.4 — Field review & correction API
*Est: 1.0d · P0 · Depends on 3.2*
**AC1.** `PATCH /fields/{id}` updates value and sets `status: CORRECTED`.
**AC2.** `DELETE /fields/{id}` removes a field, keeping an audit record of who removed it.
**Sample action:** `PATCH /fields/{id} {"fieldValue":"45 days","status":"CORRECTED"}`.
**Expected result:** Field value updates; `GET` on the field shows `status: CORRECTED` and the corrected value.

### Story 3.5 — Field export
*Est: 0.5d · P1 · Depends on 3.2*
**AC1.** `GET /documents/{id}/fields/export?format=csv|json` returns all fields in the requested format.
**Sample action:** Request export as CSV for a processed document.
**Expected result:** A downloadable CSV with one row per field, columns matching field name/value/confidence/source page.

---

## 9. Epic 4 — Search Indexing

### Story 4.1 — Embedding generation & vector storage
*Est: 1.5d · P0 · Built against fixture chunks; wired to real chunking at Checkpoint 1*
**AC1.** Every chunk gets an embedding generated and stored in `document_chunk.embedding`.
**AC2.** A vector similarity query returns results ordered by cosine distance.
**Sample action:** Query the top 5 chunks most similar to "termination notice period."
**Expected result:** Returned chunks are ranked by similarity and include the actual termination clause chunk in the top 5.

### Story 4.2 — Full-text / keyword index
*Est: 1.0d · P0 · Depends on 2.3 (or fixture)*
**AC1.** GIN full-text index on `chunk_text` supports keyword and phrase search.
**AC2.** Exact identifiers (contract numbers, dollar amounts) are matched precisely, not just semantically.
**Sample action:** Search for the exact reference number "SA-2026-014".
**Expected result:** The chunk containing that exact reference number is returned; semantically similar but non-matching chunks are not top-ranked ahead of it.

---

## 10. Epic 5 — Knowledge Graph Construction *(senior-recommended)*

### Story 5.1 — Entity extraction via SimpleKGPipeline
*Est: 1.1d · P0 · Built against fixture extracted fields*
**AC1.** `SimpleKGPipeline` configured with our schema identifies people, organizations, dates, amounts, topics from extracted fields + source text.
**AC2.** Every extracted entity is written with `workspace_id`, `document_id`, and `source_chunk_id` populated — **no node is ever created without a `workspace_id`.**
**Sample action:** Run entity extraction on a contract's extracted fields from Workspace A.
**Expected result:** Entities returned include `Organization: Acme Corp (workspace_id: A)`, `DateFact: 2027-03-31 (workspace_id: A)`, each with a valid `source_chunk_id`.

### Story 5.2 — Relationship extraction + Neo4j writer
*Est: 1.1d · P0 · Depends on 5.1*
**AC1.** Relationships (`SIGNED`, `EXPIRES_ON`, `AMENDS`, `MENTIONS`, `HAS_VALUE`) are written as edges via the pipeline's writer.
**AC2.** Every node and edge is queryable by `document_id` and `workspace_id`.
**AC3.** Writing is idempotent — reprocessing a document doesn't duplicate nodes/edges.
**Sample action:** Reprocess the same document twice.
**Expected result:** Neo4j node/edge count for that document is identical after both runs (no duplicates).

### Story 5.3 — Cross-document entity resolution — strictly workspace-scoped
*Est: 1.8d · P0 · Depends on 5.2*
**AC1.** The same organization/person mentioned in two documents **in the same workspace** resolves to one graph node, not two.
**AC2.** Resolution query matches on `(workspace_id, normalized_name)` — **never on `normalized_name` alone.**
**AC3.** The same entity name in a **different** workspace never resolves to, links to, or is discoverable from the first workspace's node, under any circumstance.
**Sample action:** Upload a document mentioning "Acme Corp" into a Finance workspace, and a separate document also mentioning "Acme Corp" into a Governance workspace.
**Expected result:** Two completely separate `:Organization` nodes exist, one per workspace, with zero relationship path between them — this is verified as an explicit automated test, not just informally observed.

### Story 5.4 — Contradiction detection query — scope-bounded
*Est: 1.2d · P0 · Depends on 5.3*
**AC1.** Detects conflicting `DateFact`/`Amount` values across related documents **within the same workspace** (e.g. two expiry dates for contract + amendment).
**AC2.** When a chat session is scoped to a module or a single document, the contradiction check is bounded to that scope's induced subgraph — a contradiction that only involves documents outside the current scope must not surface.
**AC3.** Returns both conflicting facts with their source documents/pages.
**AC4.** Contradictions are **never** detected or reported across two different workspaces, even if the same real-world entity name appears in both (see 5.3).
**Sample action:** Query contradictions scoped to "Module A" only, where the real contradiction actually involves a document in "Module B" of the same workspace.
**Expected result:** No contradiction is surfaced for the Module-A-scoped query (out of scope); the same query run at workspace scope does surface it.

---

## 11. Epic 6 — Hybrid Retrieval & Reranking *(senior-recommended)*

### Story 6.1 — Question classification & query rewriting
*Est: 1.0d · P0 · No hard dependency*
**AC1.** Classifies a question as fact / summary / comparison / cross-document.
**AC2.** Rewrites conversational questions into a retrieval-friendly query.
**Sample action:** Classify "What's different between these two contracts?"
**Expected result:** `{"type": "comparison", "rewrittenQuery": "termination clauses, obligations, key differences"}`.

### Story 6.2 — Hybrid retrieval (vector + keyword + graph merge) — scope-bounded
*Est: 2.3d · P0 · Built against fixture indexes/graph; wired at Checkpoint 2*
**AC1.** Combines vector search, keyword search, and graph query results into one candidate set.
**AC2.** Deduplicates overlapping candidates.
**AC3.** Filters strictly to the selected document IDs (no cross-document leakage for single-doc questions).
**AC4.** The **graph portion** of retrieval bounds traversal to the induced subgraph of the resolved scope — every node/edge touched, including multi-hop neighbors, is checked against `workspace_id` (always) and the resolved document-ID set (when scope is module/document-level), **not** just the starting node. A shared entity node (e.g. "Acme Corp" appearing in two modules of the same workspace) must not pull in facts from outside the current scope via traversal.
**Sample action:** Ask a question scoped to Module A, where the graph's "Acme Corp" node also connects to a document in Module B of the same workspace.
**Expected result:** Returned evidence includes only Module A facts; Module B's facts connected via the shared "Acme Corp" node are not included, even though they're reachable in one graph hop.

### Story 6.3 — Reranking + evidence balancing
*Est: 1.5d · P0 · Depends on 6.2*
**AC1.** Top candidates are reranked by relevance before being sent to the LLM.
**AC2.** For comparison questions, evidence is balanced so no single document dominates the evidence package.
**Sample action:** Ask a comparison question across 2 documents.
**Expected result:** Final evidence package includes passages from both documents, not just the one with more/denser text.

---

## 12. Epic 7 — Answer Generation & Verification *(senior-recommended)*

### Story 7.1 — Grounded answer generation
*Est: 1.5d · P0 · Built against fixture evidence package; wired at Checkpoint 2*
**AC1.** Answer is generated strictly from the provided evidence package — no general-knowledge fallback.
**AC2.** LLM provider is swappable (local vs. hosted) via one config value, no code change.
**Sample action:** Ask a question with no relevant evidence in the package.
**Expected result:** The model does not fabricate an answer; downstream verification (7.2) catches and converts it to "not found."

### Story 7.2 — Claim verification against evidence + graph
*Est: 1.5d · P0 · Depends on 7.1, 5.4*
**AC1.** Each factual claim in the answer is checked against the evidence and the graph before being returned.
**AC2.** Unsupported claims are stripped or the whole answer is downgraded to "not found."
**Sample action:** Force a test case where the draft answer includes a fact not present in evidence.
**Expected result:** Verification step flags and removes the unsupported claim; response confidence score drops accordingly.

### Story 7.3 — "Not found" handling
*Est: 0.5d · P0 · Depends on 7.2*
**AC1.** When evidence is insufficient, response explicitly states the question can't be answered from the documents.
**Sample action:** Ask an out-of-scope question (e.g. "What's the weather today?") against uploaded contracts.
**Expected result:** `{"isNotFound": true, "reason": "No supporting evidence found in the selected documents."}`.

---

## 13. Epic 8 — Chat API & Citations

### Story 8.1 — Chat session management with scoped creation
*Est: 1.0d · P0 · Depends on 1.1*
**AC1.** `POST /workspaces/{id}/chat-sessions` accepts exactly one scope: `workspace`, `module` (`moduleId`), or `documents` (`documentIds`).
**AC2.** `GET /chat-sessions/{id}` returns full message history plus the resolved scope.
**Sample action:** Create a session with `{"scope": {"type": "module", "moduleId": "uuid"}}`, then fetch it.
**Expected result:** Session object returned with `scope.type: "module"` and the correct `resolvedDocumentIds` for that module.

### Story 8.2 — Chat message endpoint with SSE streaming
*Est: 1.5d · P0 · Built against a stub answer generator first; wired to real Epic 7 at Checkpoint 2*
**AC1.** `POST /chat-sessions/{id}/messages` streams tokens, citations, and a final `done` event via SSE.
**AC2.** Works end-to-end with a stubbed answer generator before Epic 7 is ready.
**Sample action:** Send a question and observe the SSE stream.
**Expected result:** Client receives incremental `token` events, one or more `citation` events, and a final `done` event with `messageId` and `answerMode`.

### Story 8.3 — Citation storage & retrieval
*Est: 1.0d · P0 · Depends on 8.2*
**AC1.** Every citation on an answer is persisted with `documentId`, `page`, `section`, `excerpt`.
**AC2.** `GET /messages/{id}/citations` returns them.
**Sample action:** Fetch citations for a previously answered message.
**Expected result:** Returns the exact citations shown during the original SSE stream, unchanged.

### Story 8.4 — Source passage viewer
*Est: 0.5d · P0 · Depends on 8.3*
**AC1.** `GET /citations/{id}/source` returns the full source passage with the cited excerpt highlighted/marked.
**Sample action:** Open a citation's source.
**Expected result:** Response includes the full paragraph/section text with the cited excerpt clearly delimited (e.g. `<mark>` boundaries or offset indices).

### Story 8.5 — Scope resolution & cross-workspace rejection
*Est: 0.5d · P0 · Depends on 8.1, 1.5*
**AC1.** `module`/`documents` scope is resolved server-side to a concrete `documentIds` list at session-creation time, before any question is asked.
**AC2.** A `moduleId` or `documentId` that doesn't belong to the request's `{workspaceId}` is rejected with `400 SCOPE_OUTSIDE_WORKSPACE` at creation time — never silently dropped or partially honored.
**AC3.** The resolved scope, once set, cannot be changed mid-session.
**Sample action:** Attempt to create a session in Workspace A referencing a `documentId` that actually belongs to Workspace B.
**Expected result:** `400 SCOPE_OUTSIDE_WORKSPACE`; no session is created.

---

## 14. Epic 9 — Feedback & Evaluation

### Story 9.1 — Answer feedback API
*Est: 0.5d · P0 · Depends on 8.2*
**AC1.** `POST /messages/{id}/feedback` accepts a rating (`up`/`down`) and optional comment.
**Sample action:** Submit thumbs-down with a comment.
**Expected result:** Feedback stored and retrievable, linked to the correct message and user.

### Story 9.2 — Evaluation test-set loader
*Est: 1.0d · P0 · No hard dependency*
**AC1.** Loads a fixed set of documents + questions + expected answers from a config/seed file.
**AC2.** Validates the set (no missing expected answers) before a run starts.
**Sample action:** Load a test set with 25 questions across 3 documents.
**Expected result:** `EVALUATION_QUESTION` rows created for all 25; a malformed entry (missing expected answer) is rejected with a clear validation error.

### Story 9.3 — Evaluation run executor (dual mode)
*Est: 1.5d · P0 · Depends on 9.2, and Epic 7/8 for real wiring (built against stub until Checkpoint 3)*
**AC1.** Runs every test question twice: `retrieval_only` and `retrieval_plus_graph`.
**AC2.** Records correctness, citation correctness, and hallucination flag per run per mode.
**Sample action:** Trigger `POST /evaluation/runs` on a 25-question test set.
**Expected result:** 50 `EVALUATION_RESULT` rows created (25 × 2 modes), each scored.

### Story 9.4 — Evaluation comparison report
*Est: 1.0d · P0 · Depends on 9.3*
**AC1.** `GET /evaluation/runs/{id}/report` returns aggregated stats per mode and the delta between them.
**Sample action:** Fetch the report after a completed run.
**Expected result:** `{"retrievalOnly": {...}, "retrievalPlusGraph": {...}, "improvement": {"correctnessDelta": "+24%", "hallucinationDelta": "-83%"}}` — this is the primary evidence artifact for POC exit criterion 1.

---

## 15. Epic 10 — Cross-cutting Hardening

### Story 10.1 — Structured logging & request tracing
*Est: 0.5d · P1 · No dependency*
**AC1.** Every request logs a `requestId`, endpoint, status, and latency in structured (JSON) format.
**Sample action:** Trigger a request and inspect logs.
**Expected result:** Log line includes `requestId`, `path`, `status`, `durationMs`, correlatable across core-api and ai-service.

### Story 10.2 — Audit trail
*Est: 1.0d · P0 (basic level per BRD) · Depends on 1.2, 8.2*
**AC1.** Uploads, questions, and answers are recorded in an audit log with user, timestamp, and action.
**Sample action:** Upload a document and ask a question.
**Expected result:** Two audit entries exist: `DOCUMENT_UPLOADED` and `QUESTION_ASKED`, each with the correct `user_id` and `timestamp`.

### Story 10.3 — File validation & basic security hardening
*Est: 0.5d · P0 · Depends on 1.2*
**AC1.** Uploaded files are scanned/validated for type mismatch (e.g. renamed `.exe` as `.pdf`) before storage.
**AC2.** Path traversal and injection attempts in file names are sanitized.
**Sample action:** Upload a file named `../../etc/passwd.pdf` containing non-PDF binary content.
**Expected result:** Rejected with `422 INVALID_FILE_CONTENT`; nothing is written outside the intended MinIO path.

---

## 16. Summary — what "done" looks like on Day 10

- All P0 stories complete and wired (not stubbed) into the real pipeline.
- Checkpoint 3 smoke test passes: upload → process → ask a question → get a cited, verified answer → run evaluation → get a comparison report.
- **Workspace isolation test passes explicitly**: two workspaces with an identically-named module and an identically-named real-world entity (e.g. "Acme Corp") produce zero shared graph nodes, zero cross-workspace citations, and zero cross-workspace contradiction hits (Stories 5.3/5.4/6.2/8.5).
- FE has been integrating against real (not mocked) endpoints since Checkpoint 2 at the latest.
- P1 stories (export, retry/delete, request logging polish) are the only acceptable carry-over if the sprint runs hot.
