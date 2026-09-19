# Realistic Timeline & Independent Task Plan — Pod 3 Backend

> Answers two questions: (1) is 2 weeks actually realistic, and (2) exactly what does each developer do, with what input, producing what output, and how long does it take with vs. without AI-assisted development.

---

## 1. The math

| | Total effort | Capacity | Slack |
|---|---|---|---|
| **Without AI assistance** | ~42.25 dev-days | 40 dev-days (4 devs × 10 days) | **~0 — no real buffer** |
| **With AI-assisted development** | ~27.3 dev-days | 40 dev-days | **~32% buffer overall — but see §3, Track A specifically has none** |

**Verdict — updated after adding module (folder-level) support and the strict workspace-isolation requirement:** the overall number barely moved (25.3 → 27.3 dev-days with AI) because most of the new work is small, junior-friendly CRUD/config. **What did change materially is the critical path.** Track A (Senior) now sits at **11.0 dev-days against a 10-day capacity — confirmed over budget, not just tight** (see §3). Workspace isolation isn't optional scope to trim if the sprint runs hot; it's a correctness guarantee (Finance and Governance must never leak into each other), so the mitigation below is now load-bearing, not a nice-to-have.

---

## 2. Why the AI discount varies by story type

| Type of work | Typical AI speed-up | Why |
|---|---|---|
| CRUD APIs, DevOps/config, boilerplate | ~45–50% | AI is very strong at generating standard, well-documented patterns |
| Library integration (parsing, OCR, KG library config) | ~35–40% | Mostly wiring + config, some judgment needed |
| Prompt engineering (classification, extraction, generation) | ~30–35% | AI drafts the first prompt fast; tuning against real documents is still iterative and manual |
| Complex algorithmic logic (hybrid retrieval merge, reranking, verification) | ~25–30% | Requires reasoning about edge cases and empirical testing that AI can't shortcut |

---

## 3. Four independent dev tracks

Each track is chosen so a developer can work start-to-finish without waiting on another track — every cross-track dependency is satisfied by a fixture/stub until the scheduled integration checkpoint (Day 5, 8, 10 — same checkpoints as `06_backend_epics_and_stories.md`).

| Track | Owner | Epics | Effort (with AI) | Capacity | Slack |
|---|---|---|---|---|---|
| **A — Accuracy Engine** *(critical path — over budget)* | Senior Dev | Epic 0 (Foundation) + Epic 5 (Knowledge Graph, workspace-isolated) + Epic 6 (Retrieval, scope-bounded) + Epic 7 (Generation & Verification) | **11.0 d** | 10 d | **−1.0 d (over)** |
| **B — Ingestion** | Junior Dev 1 | Epic 1 (DMS + Modules) + Epic 2 (Parsing/OCR) + Epic 10 (Hardening) | 6.6 d | 10 d | 3.4 d |
| **C — Understanding** | Junior Dev 2 | Epic 3 (Classification/Extraction) + Epic 4 (Indexing) | 4.7 d | 10 d | 5.3 d |
| **D — Experience** | Junior Dev 3 | Epic 8 (Chat API/Citations, scope-aware) + Epic 9 (Feedback/Evaluation) | 5.0 d | 10 d | 5.0 d |

**Risk called out directly — now upgraded from "watch this" to "act on this":** Track A is **confirmed over its 10-day budget by roughly 1 day**, and that's before accounting for the fact that workspace-isolation bugs (a shared entity leaking across workspaces) are exactly the kind of subtle, hard-to-notice-in-a-demo defect that erodes the whole "near-zero hallucination, trustworthy" premise of the product if missed. This is no longer a contingency — **plan the pairing now, not if things slip:**
- **Day 6–7:** Junior C (5.3d slack) pairs with Senior on Story 5.3/5.4 — writing and testing the workspace-scoped Cypher queries, including the explicit cross-workspace isolation test case, under Senior review.
- **Day 7–8:** Junior D (5.0d slack) pairs with Senior on Story 6.2's scope-bounded traversal logic and helps write the "shared entity across two modules doesn't leak" test case.
- This redirected pairing time is already accounted for inside Junior C/D's stated slack above — it does not need to be found from somewhere else.

---

## 4. Checkpoints (unchanged from the backlog doc)

- **Day 5:** Wire Parsing (B) → Extraction (C) → Indexing (C) → Graph (A) into one real pipeline; run one real document end-to-end.
- **Day 8:** Wire Retrieval (A) → Generation (A) → Chat API (D) into one real pipeline; run one real question end-to-end.
- **Day 10:** Full integration, evaluation dry run (A+D), FE contract verification against the live backend.

---

## 5. Track A — Accuracy Engine (Senior Dev)

| Story | Input | Action | Expected response / output | w/o AI | With AI |
|---|---|---|---|---|---|
| 0.1 Repo & Docker skeleton | None | Scaffold repo structure + `docker-compose.yml` for all 6 services | `docker-compose up` brings up all services; each returns `200 OK` on `/health` | 0.5d | 0.25d |
| 0.2 DB schema & migrations | ER diagram (`04_...md`) | Write Flyway migrations for all 17 tables + pgvector extension | Fresh DB has all tables/indexes matching the ER diagram | 1.0d | 0.5d |
| 0.3 CI pipeline | Repo skeleton | Configure GitHub Actions build+test workflow | Push triggers build; failing test shows red check | 0.5d | 0.25d |
| 0.4 Auth skeleton | DB schema | Build `/auth/login`, `/auth/me`, JWT middleware | Valid login returns a token; protected routes reject missing/invalid tokens | 1.0d | 0.5d |
| 5.1 Entity extraction (SimpleKGPipeline) | Fixture: sample extracted fields JSON | Configure pipeline with our schema, **stamping `workspace_id` on every node** | Given sample text, returns entities with `source_chunk_id` **and `workspace_id`** populated | 1.1d | 0.7d |
| 5.2 Relationship extraction + Neo4j writer | Output of 5.1 | Configure pipeline's relationship extraction + writer; verify idempotency | Reprocessing the same document produces identical node/edge counts | 1.1d | 0.7d |
| 5.3 Cross-document entity resolution (workspace-scoped) | Output of 5.2, fixture docs across 2+ workspaces | Write `(workspace_id, normalized_name)` matching; add explicit cross-workspace isolation test | "Acme Corp" in Workspace A and Workspace B resolve to two separate nodes with zero relationship path | 1.8d | 1.2d |
| 5.4 Contradiction detection (scope-bounded) | Output of 5.3 | Write Cypher query bounded to current chat scope (workspace/module/document); never crosses workspaces | Contradiction across Module A/B surfaces at workspace scope, not when scoped to Module A alone; never across workspaces | 1.2d | 0.8d |
| 6.1 Question classification & rewrite | Sample questions | Build LLM-based classifier (fact/summary/compare/cross-doc) + query rewriter | "What's different between these two contracts?" → `{"type":"comparison", "rewrittenQuery": "..."}` | 1.0d | 0.75d |
| 6.2 Hybrid retrieval merge (scope-bounded traversal) | Fixture: seeded pgvector + Neo4j data across 2+ workspaces | Combine vector+keyword+graph results; bound graph traversal to the resolved scope's induced subgraph, not just the starting node | Query scoped to Module A returns nothing from Module B, even via a shared entity node one hop away | 2.3d | 1.7d |
| 6.3 Reranking & evidence balancing | Output of 6.2 | Add reranker; balance evidence across documents for comparison questions | 2-document comparison query returns evidence from both documents, not just one | 1.5d | 1.15d |
| 7.1 Grounded answer generation | Evidence package from 6.3 | Build prompt/pipeline that answers strictly from evidence, provider-agnostic (Ollama/hosted) | No-evidence input never produces a fabricated answer | 1.5d | 1.05d |
| 7.2 Claim verification | Draft answer + evidence + graph | Build verification step that checks each claim, strips unsupported ones | Forced unsupported-claim test case gets flagged/stripped, confidence drops | 1.5d | 1.05d |
| 7.3 "Not found" handling | Output of 7.2 | Wire the explicit refusal path | Out-of-scope question returns `{"isNotFound": true, "reason": "..."}` | 0.5d | 0.35d |

**Track A total:** 17.6d without AI → **11.0d with AI** *(over the 10-day track budget — see §3 pairing plan)*

---

## 6. Track B — Ingestion (Junior Dev 1)

| Story | Input | Action | Expected response / output | w/o AI | With AI |
|---|---|---|---|---|---|
| 1.1 Workspace CRUD | Auth skeleton (0.4) | Build create/list/rename/archive endpoints | `POST /workspaces {"name":"..."}` → `201` with `status: ACTIVE` | 1.0d | 0.5d |
| 1.2 Document upload (DMS) | Workspace CRUD | Build multipart upload, validation, MinIO storage, status tracking | PDF accepted (`201`, `UPLOADED`); `.xlsx` rejected `415` | 1.5d | 0.75d |
| 1.3 Document listing & status | Document upload | Build list/detail endpoints, wire status transitions | Polling shows `UPLOADED→PARSING→...→READY` | 1.0d | 0.5d |
| 1.4 Retry/delete/archive (P1) | Document listing | Build retry, soft-delete endpoints | Retrying a `FAILED` doc re-queues it | 0.5d | 0.25d |
| 1.5 Module (document group) CRUD | Workspace CRUD | Build create/list/rename/delete + document-reassign endpoints; enforce `(workspace_id, name)` uniqueness | Same module name succeeds in two different workspaces; duplicate within one workspace returns `409` | 0.75d | 0.4d |
| 1.6 Folder upload + auto-module assignment | Document upload, Module CRUD | Accept relative paths on upload; find-or-create a module per top-level subfolder | Folder with `Finance/Q3report.pdf` creates/reuses a "Finance" module and assigns the file to it | 1.0d | 0.5d |
| 2.1 PDF/DOCX parsing | Fixture files (not blocked by 1.2) | Integrate Docling/PyMuPDF/python-docx, preserve page/heading structure | 10-page PDF → 10 `document_page` rows with correct text/order | 2.0d | 1.2d |
| 2.2 Selective OCR | Output of 2.1 | Detect low-text pages, run PaddleOCR only on those | Only scanned pages get `was_ocr: true` + confidence score | 1.5d | 0.9d |
| 2.3 Structure-aware chunking | Output of 2.1 | Chunk respecting section boundaries, store with metadata | Chunks traceable to real page/section, within token limits | 1.0d | 0.6d |
| 10.1 Logging & tracing | Any endpoint | Add structured JSON request logging | Log line includes `requestId`, `path`, `status`, `durationMs` | 0.5d | 0.25d |
| 10.2 Audit trail | Upload + chat endpoints | Log upload/question/answer actions | Two audit entries after upload+question, correct user/timestamp | 1.0d | 0.5d |
| 10.3 File validation/security | Document upload | Add content-type verification, path sanitization | Renamed `.exe` as `.pdf` rejected `422`; no path traversal | 0.5d | 0.25d |

**Track B total:** 12.25d without AI → **6.6d with AI**

---

## 7. Track C — Understanding (Junior Dev 2)

| Story | Input | Action | Expected response / output | w/o AI | With AI |
|---|---|---|---|---|---|
| 3.1 Document classification | Fixture: sample parsed text | Build LLM classifier for document type + confidence | Contract text → `{"documentType":"contract","classificationConfidence":0.93}` | 1.0d | 0.65d |
| 3.2 Universal field extraction | Output of 3.1 | Build schema-validated extraction for title/parties/dates/amounts/topics | Returns fields with `source_page`, `source_chunk_id`, `confidence` | 1.5d | 0.95d |
| 3.3 Type-specific field extraction | Output of 3.1, 3.2 | Add per-type field sets (contract vs. financial report, etc.) | Financial report returns Revenue/EBITDA; no Termination Terms field | 1.5d | 0.95d |
| 3.4 Field correction API | Output of 3.2 | Build `PATCH`/`DELETE` on fields | `PATCH` updates value, sets `status: CORRECTED` | 1.0d | 0.5d |
| 3.5 Field export (P1) | Output of 3.2 | Build CSV/JSON export endpoint | Downloadable CSV, one row per field | 0.5d | 0.25d |
| 4.1 Embeddings & pgvector | Chunks (fixture, not blocked by Track B) | Generate embeddings, store + index in pgvector | Similarity query returns the actually-relevant chunk in top 5 | 1.5d | 0.85d |
| 4.2 Full-text/keyword index | Chunks (fixture) | Build GIN index + keyword search endpoint | Exact reference number search returns the right chunk, ranked first | 1.0d | 0.55d |

**Track C total:** 8.0d without AI → **4.7d with AI**

---

## 8. Track D — Experience (Junior Dev 3)

| Story | Input | Action | Expected response / output | w/o AI | With AI |
|---|---|---|---|---|---|
| 8.1 Chat session management (scoped) | Workspace CRUD, Module CRUD (fixture until Checkpoint 1) | Build session create/get endpoints accepting `scope: {type: workspace\|module\|documents}` | Session created with correct `resolvedDocumentIds` for the given scope, empty message list | 1.0d | 0.55d |
| 8.2 SSE streaming chat endpoint | Stubbed answer generator initially | Build `POST /messages` with SSE token/citation/done events | Client receives `token`, `citation`, and `done` events in order | 1.5d | 0.85d |
| 8.3 Citation storage & retrieval | Output of 8.2 | Persist and expose citations per message | `GET /messages/{id}/citations` matches what streamed | 1.0d | 0.55d |
| 8.4 Source passage viewer | Output of 8.3 | Build endpoint returning highlighted source passage | Response includes full passage with cited excerpt marked | 0.5d | 0.3d |
| 8.5 Scope resolution & cross-workspace rejection | Session creation (8.1), Module CRUD (1.5) | Resolve module/documents scope to a concrete document list at creation time; reject anything outside the request's workspace | Session referencing a document from another workspace returns `400 SCOPE_OUTSIDE_WORKSPACE`; no session created | 0.5d | 0.3d |
| 9.1 Feedback API | Chat message | Build thumbs up/down + comment endpoint | Feedback stored and retrievable, linked to correct message and user | 0.5d | 0.3d |
| 9.2 Evaluation test-set loader | Config/seed file | Load documents+questions+expected answers, validate | 25-question set loads; malformed entry rejected with clear error | 1.0d | 0.6d |
| 9.3 Evaluation run executor | Output of 9.2, stub until Checkpoint 3 | Run each question in both modes, score results | 50 result rows created (25 × 2 modes), each scored | 1.5d | 0.9d |
| 9.4 Evaluation comparison report | Output of 9.3 | Build aggregation/report endpoint | Returns per-mode stats + delta — the primary POC evidence artifact | 1.0d | 0.6d |

**Track D total:** 8.5d without AI → **5.0d with AI**

---

## 9. What this plan does NOT solve — be clear-eyed about it

- AI assistance speeds up **writing** code; it does not speed up **deciding** what the graph schema should be, tuning a prompt against messy real contracts, or debugging why a reranker under-weights the right passage. Track A's numbers already reflect the smallest discount for exactly this reason — don't compress them further under schedule pressure.
- These estimates assume developers are **already fluent** with their AI tooling on Day 1. If any junior dev is learning Copilot/Claude Code *and* Neo4j/pgvector at the same time, add back roughly 1 day per unfamiliar tool.
- The plan assumes the BRD's open items (data sensitivity, GPU access, test document set) are resolved by end of Day 1 — every estimate above assumes no time lost to blocked decisions.
