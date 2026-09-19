# 00_MASTER_SYSTEM_IMPLEMENTATION_PLAN.md
### Pod 3 — Generic Document Extractor + Chatbot (POC)

> Synthesized from: `BRD_Pod3_DocumentExtractor_Chatbot.docx` (v1.1), `01_project_knowledge.md`, `02_requirements_and_user_journeys.md`, `03_architecture.md`, `04_db_mapping_and_er_diagram.md`, `05_api_specs.md`, `06_backend_epics_and_stories.md`, `07_realistic_timeline_and_task_plan.md`, `08_epic_interlinking_and_architecture_map.md`. Source priority follows BRD > Architecture > ERD > API specs > Epics > Project Knowledge, per the planning brief. No conflicts were found between these documents at the time of writing.

---

## 1. System Overview

A 4-week proof-of-concept where an internal business user uploads PDF/DOCX documents into a **workspace** (optionally organized into **modules**, i.e. folders), the system automatically classifies and extracts structured facts from each document, builds a **knowledge graph** of entities/relationships to ground and cross-check answers, and lets the user chat — scoped to a workspace, module, or specific document(s) — and receive answers with exact document/page/section citations. The differentiator being proven: does knowledge-graph-augmented retrieval (GraphRAG) measurably reduce hallucination versus retrieval-only RAG. Source: BRD §1–§3.

**POC exit criteria (both required, BRD §4):** (1) measured accuracy improvement of retrieval+graph over retrieval-only on a fixed evaluation set, (2) a working live demo.

---

## 2. Architecture Overview

Three-service architecture: a React web client, a Java/Spring Boot Core API (auth, workspaces, documents, chat sessions, orchestration), and a Python/FastAPI AI Service (parsing, extraction, KG construction, retrieval, generation). Two data stores: PostgreSQL+pgvector (relational data, source-faithful text, embeddings) and Neo4j (knowledge graph facts). File storage in MinIO; async jobs via Redis+Celery. Source: `03_architecture.md` §2.

**Three representations of every document are kept separate and never merged**: (1) the original file, (2) source-faithful extracted text (what citations point to), (3) knowledge graph facts (used to ground/verify, never treated as source of truth itself). Source: `03_architecture.md` §1.

---

## 3. Technology Stack

| Layer | Technology | Source |
|---|---|---|
| Frontend | React + TypeScript, Vite, Tailwind + shadcn/ui | `03_...md` §7 |
| Core API | Java 21 + Spring Boot 3 | `03_...md` §7 |
| AI Service | Python + FastAPI | `03_...md` §7 |
| Parsing | Docling (primary), PyMuPDF / python-docx (fallback) | `03_...md` §7 |
| OCR | PaddleOCR, selective invocation only | `03_...md` §7 |
| Relational DB | PostgreSQL + pgvector | `03_...md` §7 |
| Keyword search | Postgres full-text search (GIN) | `03_...md` §7 |
| Knowledge graph | Neo4j Community (Docker) | `03_...md` §7 |
| KG construction library | `neo4j-graphrag-python` (`SimpleKGPipeline`) | `03_...md` §1 principle 5, §3 |
| File storage | MinIO | `03_...md` §7 |
| Jobs/cache | Redis + Celery | `03_...md` §7 |
| LLM | Ollama (local) or hosted API, behind one swappable interface | `03_...md` §7 |
| Embeddings/reranking | BGE-M3 embeddings, BGE reranker | `03_...md` §7 |
| Packaging | Docker Compose | `03_...md` §7 |
| CI | GitHub Actions | `03_...md` §7 |

**ASSUMPTION:** Specific versions (Spring Boot 3.x point release, Neo4j Community exact version, Python version) are not pinned in source docs — an epic-level implementation task, not a master-plan decision.

---

## 4. Application Components

| Component | Responsibility |
|---|---|
| Web (React) | Upload UI, extracted-fields review, chat UI with citations, evaluation report view |
| Core API (Spring Boot) | Auth, workspace/module/document CRUD, chat session lifecycle, SSE relay, AI Service orchestration |
| AI Service (FastAPI) | Parsing/OCR, classification, field extraction, KG construction, hybrid retrieval, answer generation/verification, evaluation execution |
| PostgreSQL | Relational data, source-faithful text, embeddings (pgvector), full-text index |
| Neo4j | Knowledge graph nodes/edges |
| MinIO | Original file storage |
| Redis + Celery | Async document-processing job queue |

Source: `03_...md` §2, `08_...md` §1.

---

## 5. Service / Module Boundaries

- **Core API owns**: everything with a clear owner, a status, and transactional integrity — users, workspaces, modules, documents (metadata/status), chat sessions, citations, feedback, audit log.
- **AI Service owns**: everything AI-driven and stateless-per-call — parsing, OCR, classification, extraction, KG build, retrieval, generation, verification, evaluation execution.
- Core API calls AI Service internally via the contract in `05_api_specs.md` §10; the AI Service is never called directly by the frontend.

---

## 6. Database Architecture

Two stores, intentionally separate, referencing each other by ID only (never duplicating truth): PostgreSQL (17 tables, ERD in `04_...md` §1) and Neo4j (6 node labels, 6 relationship types, `04_...md` §3). Source: `04_...md` intro.

**Critical enforcement rule (BRD §8.3, §9):** `workspace_id` is a required property on every Neo4j node, not just `:Document` — this is the mechanism, not just documentation, that prevents two workspaces' data from ever merging. Source: `04_...md` §3.

---

## 7. API Architecture

REST/JSON over `/api/v1`, bearer-token auth, SSE for chat streaming. Full endpoint catalogue in `05_api_specs.md` §2–§10 (Auth, Workspaces, Modules, Documents, Extracted Fields, Chat, Citations, Evaluation, and the internal Core API → AI Service contract).

---

## 8. Event Architecture

**DESIGN GAP:** No pub/sub event bus (Kafka/RabbitMQ/SNS) is defined anywhere in source documents, and BRD §5.2/§8 give no indication one is needed for the POC. What exists instead is a **job-queue pattern**: Redis+Celery drives async document processing, with state tracked via `PROCESSING_JOB` rows and `DOCUMENT.processing_status` transitions (`UPLOADED → PARSING → EXTRACTING → INDEXING → READY/FAILED`), polled or pushed to the UI. This is a deliberate, simpler substitute for true event architecture, appropriate for POC scale (BRD §9 Scalability: "not a priority"). If a future phase needs true event-driven integration (e.g., notifying an external system when a document is processed), that is unspecified and would need a new design pass — not something to invent here.

---

## 9. Integration Architecture

**N/A by explicit BRD scope** (§5.2: "Integrations with external systems... out of scope"). The only external-facing interface is the swappable LLM provider (Ollama local vs. a hosted API), which is a **provider abstraction**, not a third-party system integration in the traditional sense. Source: `03_...md` §1 principle 2, §7.

---

## 10. Security Architecture

Baseline only, per BRD §5.2/§9: simple login (no SSO), safe file handling, standard access control. **Data isolation is elevated to the same priority as accuracy** (BRD §9) — workspace boundaries are enforced at the data layer (write-time `workspace_id` stamping on every graph node, scope-bounded Cypher traversal), not just at the API/UI layer. Formal security certification/pen-testing is explicitly out of scope for the POC (BRD §5.2).

---

## 11. Authentication / Authorization

- **Authentication:** `POST /auth/login` returns a bearer token; `GET /auth/me` returns the current user (`05_...md` §2; Story 0.4).
- **Authorization:** protected endpoints return `401` without a token, `403` for wrong-workspace access (Story 0.4 AC3). `WORKSPACE_MEMBER.role` exists in the schema (`04_...md` §1).

**OPEN QUESTION:** No source document defines what values `WORKSPACE_MEMBER.role` actually takes or what each role can/cannot do (e.g., is there an "admin" who can delete a workspace vs. a "member" who can only chat?). The BRD only says workspace members can view/modify a workspace (Story 1.1 AC2) without distinguishing role-based permission levels. This must be resolved before Epic 1's authorization logic can be fully implemented — currently the safest implementable interpretation is "all workspace members have equal permissions," but that is an assumption, not a documented decision.

---

## 12. Shared Components

| Component | Owner (Epic) | Purpose | Consumers | Interface/Contract |
|---|---|---|---|---|
| Auth & session (JWT) | Epic 0 (Story 0.4) | Issue/validate bearer tokens | All epics with protected endpoints (1, 3, 8, 9) | `POST /auth/login`, `GET /auth/me` (`05_...md` §2) |
| DB schema & migrations | Epic 0 (Story 0.2) | Single source of relational schema | All epics | Flyway migrations per `04_...md` §1 |
| Model-provider abstraction | Epic 7 (implicit in Story 7.1), used from Epic 5 too | Swap local/hosted LLM with no code change | Epic 5 (extraction), Epic 6 (query rewriting), Epic 7 (generation) | One config value, per `03_...md` §7 |
| MinIO storage client | Epic 1 (Story 1.2) | Store/retrieve original files | Epic 2 (parsing reads from it) | `workspace/{workspaceId}/document/{documentId}/original.{ext}` (`06_...md` Story 1.2 AC3) |
| Structured logging | Epic 10 (Story 10.1) | Correlate requests across services | Epic 1, Epic 8 (explicitly, per Story 10.2) | `requestId`, `path`, `status`, `durationMs` JSON fields |
| Audit trail | Epic 10 (Story 10.2) | Record upload/question/answer actions | Epic 1, Epic 8 | `DOCUMENT_UPLOADED`, `QUESTION_ASKED` entries |
| Workspace/module scope resolution | Epic 8 (Story 8.5) | Resolve `workspace/module/documents` scope to a concrete document-ID list, bounded to one workspace | Epic 6 (retrieval), Epic 5 (graph queries) | `resolvedDocumentIds + workspace_id`, per `03_...md` §4.1 |

**No epic duplicates another epic's shared functionality** — verified against `06_...md` and `08_...md`; each shared concern above has exactly one owning epic.

---

## 13. Shared Database Entities

| Entity | Owning Epic | Consumed by |
|---|---|---|
| `TENANT`, `USER_ACCOUNT` | Epic 0 | All epics (via auth) |
| `WORKSPACE`, `WORKSPACE_MEMBER` | Epic 1 | Epics 2–9 (everything is workspace-scoped) |
| `DOCUMENT_GROUP` (module) | Epic 1 | Epic 5 (graph `group_id`), Epic 8 (scope resolution) |
| `DOCUMENT`, `DOCUMENT_VERSION`, `DOCUMENT_PAGE`, `DOCUMENT_SECTION`, `DOCUMENT_CHUNK` | Epic 1/2 | Epic 3, 4, 5, 6 |
| `EXTRACTED_FIELD` | Epic 3 | Epic 5 (KG input) |
| `PROCESSING_JOB` | Epic 1/2 (status tracking) | Epic 1 UI/status endpoints |
| `CHAT_SESSION`, `CHAT_MESSAGE` | Epic 8 | Epic 9 (evaluation links to `CHAT_MESSAGE`) |
| `ANSWER_CITATION` | Epic 8 | — |
| `USER_FEEDBACK` | Epic 9 | — |
| `EVALUATION_RUN`, `EVALUATION_QUESTION`, `EVALUATION_RESULT` | Epic 9 | Leadership demo (BRD exit criterion 1) |

Source: `04_...md` §1–§2.

---

## 14. Shared APIs

Auth (`/auth/*`) and Workspace (`/workspaces/*`) endpoints are consumed across nearly every other API group — every other resource is nested under or scoped by `workspaceId`. Source: `05_...md` §2–§3.

---

## 15. Shared Events

**N/A** — consistent with §8 above, there is no shared event bus. The closest shared "signal" is `DOCUMENT.processing_status`, which is polled/pushed rather than published/subscribed.

---

## 16. Cross-Epic Dependencies

Full table with fixture/real-input/consumer detail lives in `08_epic_interlinking_and_architecture_map.md` §5 — reproduced here at summary level:

```
EPIC-00 (Foundation)
   ↓
EPIC-01 (DMS) ──────────────┐
   ↓                        │
EPIC-02 (Parsing/OCR)       │
   ↓            ↓           │
EPIC-03      EPIC-04        │
(Extraction) (Indexing)     │
   ↓            │           │
EPIC-05 ────────┘           │
(Knowledge Graph)           │
   ↓                        │
EPIC-06 (Retrieval) ←───────┘ (consumes Epic 4 + Epic 5 output)
   ↓
EPIC-07 (Generation/Verification)
   ↓
EPIC-08 (Chat API & Citations) ── also depends on EPIC-01 (workspace/module scope, Story 8.5)
   ↓
EPIC-09 (Evaluation) — wraps EPIC-06/07/08, calls the whole flow twice per question
EPIC-10 (Hardening) — cross-cutting over EPIC-01 and EPIC-08, not sequential
```

**Independent-until-checkpoint epics** (per `08_...md` §1): Epic 3 and Epic 4 both depend only on Epic 2's output and never on each other — they can be built in parallel or either order. Epic 5 depends only on Epic 3's output, not Epic 4's.

---

## 17. Epic Dependency Graph (explicit, with contracts)

| Dependency | Dependent Epic | Providing Epic | Contract consumed |
|---|---|---|---|
| Stored file | Epic 2 | Epic 1 | File at MinIO path + `DOCUMENT` row (`processingStatus: UPLOADED`) |
| Parsed chunks | Epic 3 | Epic 2 | `document_chunk` rows |
| Parsed chunks | Epic 4 | Epic 2 | `document_chunk` rows |
| Extracted fields | Epic 5 | Epic 3 | `extracted_field` rows |
| Vector + keyword index | Epic 6 | Epic 4 | pgvector index, Postgres FTS index |
| Graph | Epic 6 | Epic 5 | Neo4j nodes/edges, `workspace_id`-stamped |
| Evidence package | Epic 7 | Epic 6 | Ranked, deduplicated, balanced candidate set |
| Answer generator | Epic 8 | Epic 7 | Grounded, verified answer + citations |
| Resolved scope | Epic 6 | Epic 8 (Story 8.5) | `resolvedDocumentIds + workspace_id` |
| Real pipeline | Epic 9 | Epic 7 + Epic 8 | Full chat-answer call, both modes |

None of these are duplicated elsewhere — each contract has exactly one producer.

---

## 18. Recommended Implementation Order

1. Epic 0 (Foundation) — Day 1 AM, blocks nothing else from starting once done.
2. Epics 1, 2, 3, 4 in parallel (Ingestion + Understanding tracks) — start Day 1 PM against fixtures.
3. Epics 5, 6, 7 in parallel with the above, also starting Day 1 against fixtures (senior track) — **does not wait** for Epics 1–4.
4. Epic 8 starts Day 1 against a stub answer generator (Experience track).
5. Checkpoint 1 (Day 5): wire Epic 2 → 3/4 → 5 for real.
6. Checkpoint 2 (Day 8): wire Epic 6 → 7 → 8 for real.
7. Epic 9 (Evaluation) built in parallel throughout against stubs, wired at Checkpoint 3 (Day 10).
8. Epic 10 (Hardening) ongoing, no hard sequencing.

Source: `06_...md` §4, `08_...md` §1.

---

## 19. Parallel Development Boundaries

Four independently workable tracks (detailed input/action/output per story in `07_realistic_timeline_and_task_plan.md` §5–§8):

| Track | Owner | Epics |
|---|---|---|
| A — Accuracy Engine (critical path) | Senior Dev | 0, 5, 6, 7 |
| B — Ingestion | Junior Dev 1 | 1, 2, 10 |
| C — Understanding | Junior Dev 2 | 3, 4 |
| D — Experience | Junior Dev 3 | 8, 9 |

**RISK (carried from `07_...md` §3):** Track A is confirmed over its 10-day capacity (11.0 dev-days even with AI assistance) — this is the critical path for the entire system, not just one epic.

---

## 20. Database Migration Ordering

Respecting foreign-key dependency order (Flyway, Story 0.2):

```
1. TENANT
2. USER_ACCOUNT (FK → TENANT)
3. WORKSPACE (FK → TENANT)
4. WORKSPACE_MEMBER (FK → WORKSPACE, USER_ACCOUNT)
5. DOCUMENT_GROUP (FK → WORKSPACE)
6. DOCUMENT (FK → WORKSPACE, DOCUMENT_GROUP nullable)
7. DOCUMENT_VERSION, DOCUMENT_PAGE, DOCUMENT_SECTION (FK → DOCUMENT)
8. DOCUMENT_CHUNK (FK → DOCUMENT, DOCUMENT_SECTION) — requires pgvector extension enabled first
9. EXTRACTED_FIELD (FK → DOCUMENT, DOCUMENT_CHUNK)
10. PROCESSING_JOB (FK → DOCUMENT)
11. CHAT_SESSION (FK → WORKSPACE)
12. CHAT_MESSAGE (FK → CHAT_SESSION)
13. ANSWER_CITATION (FK → CHAT_MESSAGE, DOCUMENT, DOCUMENT_CHUNK)
14. USER_FEEDBACK (FK → CHAT_MESSAGE, EXTRACTED_FIELD)
15. EVALUATION_RUN
16. EVALUATION_QUESTION (FK → EVALUATION_RUN, DOCUMENT)
17. EVALUATION_RESULT (FK → EVALUATION_QUESTION, CHAT_MESSAGE)
```

**Neo4j has no schema migration in the relational sense** — node/relationship shape is enforced in application code (the `SimpleKGPipeline` schema config) and indexes are created at service startup (`04_...md` §4: composite index on `(workspace_id, normalized_name)`, index on `:Document(document_id/workspace_id/group_id)`).

---

## 21. Infrastructure Dependencies

Single Docker Compose stack: `postgres` (+pgvector), `neo4j`, `redis`, `minio`, `core-api`, `ai-service`, `web`, optional `ollama` (Story 0.1). Each service exposes `/health`. Source: `03_...md` §6, Story 0.1.

---

## 22. Deployment Dependencies

Startup order: data stores (`postgres`, `neo4j`, `redis`, `minio`) → migrations run automatically on `core-api` start (Story 0.2 AC3) → `core-api` → `ai-service` → `web`. **ASSUMPTION:** no blue/green or backward-compatibility strategy is needed — this is a single-environment POC (BRD §12: "non-production, internal environment only"), not a production rollout.

---

## 23. End-to-End Business Workflows

1. **Upload → Understanding** (`02_...md` §4): Upload → validate/store → parse/OCR → classify/extract/summarize → build graph → mark `READY`.
2. **Ask a question** (`02_...md` §5): Select scope → resolve to document IDs → classify question → hybrid retrieve → rerank → generate → verify → cite → stream.
3. **Evaluation run** (`02_...md` §6): Load fixed test set → run each question in both modes → score → compare → report (the primary POC exit-criterion-1 artifact).

---

## 24. System-Level Testing Strategy

- **Per-story:** unit/integration tests against the AC in each story (`06_...md`).
- **Checkpoint smoke tests:** one real document end-to-end at Checkpoint 1; one real question end-to-end at Checkpoint 2 (`06_...md` §4).
- **Day 10 full integration + workspace-isolation test:** two workspaces with an identically-named module and identically-named entity must produce zero shared graph nodes/citations/contradictions (`06_...md` §16).
- **Accuracy testing:** the evaluation harness itself (Epic 9) is the system's core testing mechanism for the accuracy exit criterion — not a separate QA activity.

---

## 25. System-Level Risks

| Risk | Source | Note |
|---|---|---|
| KG complexity not fully tunable in 4 weeks | BRD §14 | Mitigated by `neo4j-graphrag-python` adoption (`03_...md` §1 principle 5) and simple schema (`03_...md` §9) |
| Workspace isolation leak | This session's decisions | Elevated to top-priority NFR; adds load to the critical-path track (`03_...md` §9, `07_...md` §3) |
| Data sensitivity unconfirmed | BRD §15 | Open item — affects hosting/security posture |
| GPU/deployment environment unconfirmed | BRD §15 | Mitigated by swappable LLM provider |
| Senior-owned track over capacity | `07_...md` §1, §3 | Confirmed 11.0 dev-days vs. 10-day budget; mitigation is scheduled junior pairing, not optional |
| No event architecture designed | This document §8 | Fine for POC scale; would need design work if a future phase needs event-driven integration |

---

## 26. Traceability Gaps

Reporting per the required protocol — these are not filled in with invented detail:

- **OPEN QUESTION:** `WORKSPACE_MEMBER.role` values and their permission differences are undefined (see §11).
- **OPEN QUESTION:** No UI/UX specification exists (wireframes, component behavior) — Epic-level frontend implementation (if/when frontend epics are written) will need this resolved.
- **DESIGN GAP:** No event/pub-sub architecture defined (see §8) — acceptable at POC scale per BRD, but explicitly not designed for any future need.
- **ASSUMPTION:** No existing codebase exists; per-epic "File/Module Implementation Plan" sections will propose a structure based on standard Spring Boot/FastAPI conventions rather than real repository paths, and must be labeled as such.
- **ASSUMPTION:** Neo4j exact version and other dependency versions are not pinned in source docs; left to epic-level implementation detail.

No BRD requirement was found without a corresponding epic. No epic was found without corresponding stories. No story was found without acceptance criteria. Full chain verified against `06_...md` and BRD §8.
