# Realistic Timeline & Independent Task Plan — Pod 3 Backend

> Answers two questions: (1) is 2 weeks actually realistic, and (2) exactly what does each developer do, with what input, producing what output, and how long does it take with vs. without AI-assisted development.

---

## 1. The math

| | Total effort | Capacity | Slack |
|---|---|---|---|
| **Without AI assistance** | ~42.0 dev-days | 40 dev-days (4 devs × 10 days) | **~0 — no real buffer** |
| **With AI-assisted development** | ~25.3 dev-days | 40 dev-days | **~37% buffer** |

**Verdict:** 2 weeks is realistic **only if** the team codes with AI assistance throughout, the 4 developers are already comfortable with those tools (not learning them mid-sprint), and scope stays strictly P0 (per `06_backend_epics_and_stories.md`). Without AI assistance, budget 2.5–3 weeks, not 2. Even with AI, treat the senior developer's track as the critical path (see §3) — it's the one place estimates carry the most uncertainty regardless of tooling, because it's prompt-tuning and retrieval-quality work, not boilerplate.

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
| **A — Accuracy Engine** *(critical path)* | Senior Dev | Epic 0 (Foundation) + Epic 5 (Knowledge Graph) + Epic 6 (Retrieval) + Epic 7 (Generation & Verification) | 10.3 d | 10 d | ~0 — flag as risk |
| **B — Ingestion** | Junior Dev 1 | Epic 1 (DMS) + Epic 2 (Parsing/OCR) + Epic 10 (Hardening) | 5.7 d | 10 d | 4.3 d |
| **C — Understanding** | Junior Dev 2 | Epic 3 (Classification/Extraction) + Epic 4 (Indexing) | 4.7 d | 10 d | 5.3 d |
| **D — Experience** | Junior Dev 3 | Epic 8 (Chat API/Citations) + Epic 9 (Feedback/Evaluation) | 4.6 d | 10 d | 5.4 d |

**Risk called out directly:** Track A is at ~103% of capacity even with AI help — it's the one track with no slack, and it's also the highest-uncertainty work (retrieval quality and claim verification behave differently on real data than on fixtures, no matter how well-scoped the story is). **Mitigation:** Tracks B/C/D each carry 4+ days of slack by Day 6–7. Once their own epics are done, redirect that slack to pairing with the Senior on Epic 6/7 under their direction (e.g. Junior C writes the Cypher contradiction query under review once Epic 3/4 are done; Junior D helps wire the SSE/generation integration at Checkpoint 2). Build this into the plan now rather than discovering it as a Day 8 surprise.

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
| 5.1 Entity extraction | Fixture: sample extracted fields JSON | Configure `SimpleKGPipeline` with our schema (Organization, Person, DateFact, Amount, Topic) | Given sample text, returns entities with `source_chunk_id` populated | 1.0d | 0.65d |
| 5.2 Relationship extraction + Neo4j writer | Output of 5.1 | Configure pipeline's relationship extraction + writer; verify idempotency | Reprocessing the same document produces identical node/edge counts | 1.0d | 0.65d |
| 5.3 Cross-document entity resolution | Output of 5.2, 2+ fixture documents | Write normalized-name matching logic to merge duplicate entity nodes | Two documents mentioning "Acme Corp." / "ACME CORP" resolve to one graph node | 1.5d | 1.0d |
| 5.4 Contradiction detection | Output of 5.3 | Write Cypher query to detect conflicting `DateFact`/`Amount` values across related docs | Given a contract + amendment with different expiry dates, returns both conflicting facts with sources | 1.0d | 0.65d |
| 6.1 Question classification & rewrite | Sample questions | Build LLM-based classifier (fact/summary/compare/cross-doc) + query rewriter | "What's different between these two contracts?" → `{"type":"comparison", "rewrittenQuery": "..."}` | 1.0d | 0.75d |
| 6.2 Hybrid retrieval merge | Fixture: seeded pgvector + Neo4j data | Combine vector + keyword + graph query results; dedupe; filter to selected documents | Query scoped to 1 of 5 documents returns candidates only from that document | 2.0d | 1.5d |
| 6.3 Reranking & evidence balancing | Output of 6.2 | Add reranker; balance evidence across documents for comparison questions | 2-document comparison query returns evidence from both documents, not just one | 1.5d | 1.15d |
| 7.1 Grounded answer generation | Evidence package from 6.3 | Build prompt/pipeline that answers strictly from evidence, provider-agnostic (Ollama/hosted) | No-evidence input never produces a fabricated answer | 1.5d | 1.05d |
| 7.2 Claim verification | Draft answer + evidence + graph | Build verification step that checks each claim, strips unsupported ones | Forced unsupported-claim test case gets flagged/stripped, confidence drops | 1.5d | 1.05d |
| 7.3 "Not found" handling | Output of 7.2 | Wire the explicit refusal path | Out-of-scope question returns `{"isNotFound": true, "reason": "..."}` | 0.5d | 0.35d |

**Track A total:** 15.5d without AI → **10.3d with AI**

---

## 6. Track B — Ingestion (Junior Dev 1)

| Story | Input | Action | Expected response / output | w/o AI | With AI |
|---|---|---|---|---|---|
| 1.1 Workspace CRUD | Auth skeleton (0.4) | Build create/list/rename/archive endpoints | `POST /workspaces {"name":"..."}` → `201` with `status: ACTIVE` | 1.0d | 0.5d |
| 1.2 Document upload (DMS) | Workspace CRUD | Build multipart upload, validation, MinIO storage, status tracking | PDF accepted (`201`, `UPLOADED`); `.xlsx` rejected `415` | 1.5d | 0.75d |
| 1.3 Document listing & status | Document upload | Build list/detail endpoints, wire status transitions | Polling shows `UPLOADED→PARSING→...→READY` | 1.0d | 0.5d |
| 1.4 Retry/delete/archive (P1) | Document listing | Build retry, soft-delete endpoints | Retrying a `FAILED` doc re-queues it | 0.5d | 0.25d |
| 2.1 PDF/DOCX parsing | Fixture files (not blocked by 1.2) | Integrate Docling/PyMuPDF/python-docx, preserve page/heading structure | 10-page PDF → 10 `document_page` rows with correct text/order | 2.0d | 1.2d |
| 2.2 Selective OCR | Output of 2.1 | Detect low-text pages, run PaddleOCR only on those | Only scanned pages get `was_ocr: true` + confidence score | 1.5d | 0.9d |
| 2.3 Structure-aware chunking | Output of 2.1 | Chunk respecting section boundaries, store with metadata | Chunks traceable to real page/section, within token limits | 1.0d | 0.6d |
| 10.1 Logging & tracing | Any endpoint | Add structured JSON request logging | Log line includes `requestId`, `path`, `status`, `durationMs` | 0.5d | 0.25d |
| 10.2 Audit trail | Upload + chat endpoints | Log upload/question/answer actions | Two audit entries after upload+question, correct user/timestamp | 1.0d | 0.5d |
| 10.3 File validation/security | Document upload | Add content-type verification, path sanitization | Renamed `.exe` as `.pdf` rejected `422`; no path traversal | 0.5d | 0.25d |

**Track B total:** 10.5d without AI → **5.65d with AI** (rounded 5.7d)

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
| 8.1 Chat session management | Workspace CRUD (fixture until Checkpoint 1) | Build session create/get endpoints | Session created with correct `documentIds`, empty message list | 1.0d | 0.55d |
| 8.2 SSE streaming chat endpoint | Stubbed answer generator initially | Build `POST /messages` with SSE token/citation/done events | Client receives `token`, `citation`, and `done` events in order | 1.5d | 0.85d |
| 8.3 Citation storage & retrieval | Output of 8.2 | Persist and expose citations per message | `GET /messages/{id}/citations` matches what streamed | 1.0d | 0.55d |
| 8.4 Source passage viewer | Output of 8.3 | Build endpoint returning highlighted source passage | Response includes full passage with cited excerpt marked | 0.5d | 0.3d |
| 9.1 Feedback API | Chat message | Build thumbs up/down + comment endpoint | Feedback stored, linked to correct message/user | 0.5d | 0.3d |
| 9.2 Evaluation test-set loader | Config/seed file | Load documents+questions+expected answers, validate | 25-question set loads; malformed entry rejected with clear error | 1.0d | 0.6d |
| 9.3 Evaluation run executor | Output of 9.2, stub until Checkpoint 3 | Run each question in both modes, score results | 50 result rows created (25 × 2 modes), each scored | 1.5d | 0.9d |
| 9.4 Evaluation comparison report | Output of 9.3 | Build aggregation/report endpoint | Returns per-mode stats + delta — the primary POC evidence artifact | 1.0d | 0.6d |

**Track D total:** 8.0d without AI → **4.6d with AI**

---

## 9. What this plan does NOT solve — be clear-eyed about it

- AI assistance speeds up **writing** code; it does not speed up **deciding** what the graph schema should be, tuning a prompt against messy real contracts, or debugging why a reranker under-weights the right passage. Track A's numbers already reflect the smallest discount for exactly this reason — don't compress them further under schedule pressure.
- These estimates assume developers are **already fluent** with their AI tooling on Day 1. If any junior dev is learning Copilot/Claude Code *and* Neo4j/pgvector at the same time, add back roughly 1 day per unfamiliar tool.
- The plan assumes the BRD's open items (data sensitivity, GPU access, test document set) are resolved by end of Day 1 — every estimate above assumes no time lost to blocked decisions.
