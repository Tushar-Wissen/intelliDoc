# EPIC 06 — Hybrid Retrieval & Reranking — Implementation Plan
### Pod 3: Document Extractor + Chatbot

> **File numbering note:** the master plan is `00_...`, Epic 0 is `01_...`, so Epic 6 is `07_...`.
> **Inputs used:** `BRD_Pod3`, `01_project_knowledge`, `02_requirements_and_user_journeys`, `03_architecture`, `04_db_mapping_and_er_diagram`, `06_backend_epics_and_stories`, `08_epic_interlinking_and_architecture_map`.
> **Not available:** `05_api_specs.md` and `07_realistic_timeline_and_task_plan.md` (both referenced by other docs, neither supplied). Every place this matters is flagged as DESIGN GAP.
> **Scope of this document:** planning only. No source code.

---

## 0. Document conventions and top-line findings

Markers used: `ASSUMPTION`, `OPEN QUESTION`, `DESIGN GAP`, `CONFLICT`, `TRACEABILITY GAP`.

**Top-line findings (read these first):**

| # | Type | Finding | Section |
|---|---|---|---|
| F1 | DESIGN GAP | Epic 6 has no external REST API in any document. It is an internal AI-service capability. The internal call contract is undefined (`05_api_specs.md` missing). | §7 |
| F2 | DESIGN GAP | **No Epic 6 story implements the `retrieval_only` vs `retrieval_plus_graph` switch**, yet Epic 9 (Story 9.3) and BRD §8.6 require both modes. Epic 6 must own the switch or the exit criterion cannot be measured. | §3, BR-010 |
| F3 | DESIGN GAP | Graph schema stores `document_id` only on `:Document` nodes. Shared entity nodes (Org/Person) merged across documents by Story 5.3 have a single scalar `source_chunk_id`. Scope filtering therefore cannot rely on a per-entity `document_id`. Provenance must live on edges. | §6, §14 |
| F4 | CONFLICT (minor) | `03_architecture.md` §5 says "each node/edge keeps a source pointer". `04_...` §3 says the pointer is a **node** property. Epic 6 needs it on **edges**. | §11 |
| F5 | DESIGN GAP | The LLM-provider interface is used by Story 6.1 (classification/rewriting), but only Story 7.1 AC2 mentions it. No owner is named. | §12 |
| F6 | OPEN QUESTION | Should `retrieval_plus_graph` degrade to vector+keyword if Neo4j is down? Silent degradation would mislabel evaluation data. | §16 |
| F7 | DESIGN GAP | Repository structure is not documented. File plan uses logical module names only. | §13 |
| F8 | DESIGN GAP | Soft-delete/archive representation for documents is undefined (`processing_status` has no ARCHIVED value). Retrieval must exclude archived documents. | BR-013 |

---

## 1. EPIC OVERVIEW

| Field | Value |
|---|---|
| **Epic ID** | 6 |
| **Name** | Hybrid Retrieval & Reranking |
| **Owner** | Senior Developer (per `08_...` §5) |
| **Estimate** | 4.8 dev-days (6.1 = 1.0, 6.2 = 2.3, 6.3 = 1.5) |
| **Runs in** | AI Service (Python · FastAPI), the "Hybrid Retrieval + Reranking" box in `03_architecture.md` §2 |
| **Priority** | P0 (all three stories) |

**Business objective.** Given a user question and an already-resolved scope, find the best possible evidence from the original document text **and** the knowledge graph, so that the answer generator (Epic 7) can answer only from that evidence. This is the retrieval half of the GraphRAG hypothesis that the POC exists to prove (BRD §3, §10).

**Business problem.** Plain vector search misses exact identifiers, mixes documents up in comparison questions, and cannot cross-check facts. Worse, a graph that leaks across module or workspace boundaries silently produces confident but wrong answers (BRD §9, "Data isolation").

**In plain terms.** Epic 8 hands Epic 6 a question plus a locked list of allowed document IDs. Epic 6 runs three searches at once (meaning-based, keyword-based, graph-based), merges and de-duplicates the results, re-scores them for relevance, balances them across documents when the question compares documents, and returns one compact "evidence package". Epic 7 turns that package into an answer.

**Scope (in).**
- Question classification: fact / summary / comparison / cross-document (Story 6.1).
- Query rewriting into a retrieval-friendly query (Story 6.1).
- Vector search (pgvector), keyword search (Postgres FTS), scope-bounded graph query (Neo4j) (Story 6.2).
- Merge and de-duplication (Story 6.2).
- Strict scope enforcement, including graph traversal bounded to the induced subgraph (Story 6.2 AC3/AC4).
- Reranking and multi-document evidence balancing (Story 6.3).
- Building the evidence package consumed by Epic 7 (`08_...` §5, "Produces: Ranked evidence package").
- Retrieval-mode switch for evaluation (see F2). Added under Story 6.2; **not in the source stories, flagged as DESIGN GAP**.

**Out of scope.**
- Scope resolution (module/documents → `resolvedDocumentIds`), owned by Epic 8, Story 8.1/8.5.
- Embedding generation and index creation, owned by Epic 4.
- Graph construction, entity resolution, contradiction detection logic, owned by Epic 5.
- Answer generation, claim verification, "not found" decision, owned by Epic 7.
- SSE streaming, citation persistence, source viewer, owned by Epic 8.
- Test-set execution and scoring, owned by Epic 9.

**Actors.** Business User (indirect, via chat), QA/Evaluator (via Epic 9, which runs the same retrieval twice), Epic 7 (downstream consumer), Epic 8 (upstream caller).

**Dependencies (summary).**

| Direction | Epic | What |
|---|---|---|
| Consumes | 4 | pgvector index, full-text index, embedding adapter/model choice |
| Consumes | 5 | Neo4j graph (schema per `04_...` §3), scope-bounded contradiction query (Story 5.4) |
| Consumes | 2 | `document_chunk`, `document_section`, `document_page` rows (via Epic 4) |
| Consumes | 1 | `document` rows (`workspace_id`, `group_id`, `processing_status`) |
| Consumes | 8 | `resolvedDocumentIds` + `workspace_id` (Story 8.1/8.5), answer mode |
| Produces for | 7 | Evidence package |
| Produces for | 9 | Dual-mode retrieval (through Epic 7/8 pipeline) |

---

## 2. REQUIREMENT TRACEABILITY

| BRD Requirement | Epic | Story | Acceptance Criterion | Component | Implementation |
|---|---|---|---|---|---|
| §8.4 answer only from selected scope | 6 | 6.2 | AC3 | ScopeGuard, VectorSearcher, KeywordSearcher | Hard filter on `workspace_id` + `document_id IN resolvedIds` in every SQL query (BR-001) |
| §8.3 graph used at answer time | 6 | 6.2 | AC1 | GraphRetriever | Third retrieval channel, merged with chunks |
| §8.3 workspace isolation (mandatory) | 6 | 6.2 | AC4 | GraphRetriever, GraphScopeFilter | Induced-subgraph traversal; every hop checked (BR-002) |
| §8.4 compare docs, keep facts separate | 6 | 6.3 | AC2 | EvidenceBalancer | Per-document quota + round-robin (BR-009) |
| §8.4 questions of different kinds | 6 | 6.1 | AC1 | QuestionClassifier | LLM classification into 4 types with fallback |
| §10.2 search text and graph, combine | 6 | 6.2 | AC1, AC2 | CandidateMerger | Union + dedupe by `chunk_id`, RRF ordering |
| §10.1 accuracy first | 6 | 6.3 | AC1 | Reranker | Cross-encoder rerank before LLM (BR-008) |
| §8.5 citations (document, page, section) | 6 | 6.2, 6.3 | AC3 / AC2 | EvidencePackageBuilder | Every evidence item carries `documentId`, `chunkId`, `pageNumber`, `sectionHeading` (BR-011) |
| §8.6 record retrieval-only vs +graph | 6 | (gap F2) | none in source | RetrievalService mode switch | `answerMode` request field, graph channel skipped for `retrieval_only` (BR-010) |
| §9 Performance (first response in seconds) | 6 | 6.2, 6.3 | none | RetrievalService | Parallel channels, capped candidates (§20) |
| §9 Data isolation | 6 | 6.2 | AC3, AC4 | ScopeGuard + isolation test suite | §19 negative tests |
| §11 Evaluation needs comparable runs | 6 | (gap F2) | none | Config-driven parameters | All tunables externalised (§21) |

**TRACEABILITY GAP:** BRD §8.6 ("record whether an answer was generated using retrieval only or retrieval plus graph") has no acceptance criterion in Epic 6. Recorded in `CHAT_MESSAGE.answer_mode` by Epic 8, but Epic 6 must make it possible. Resolved here via BR-010.

**TRACEABILITY GAP:** No story or AC covers "evidence package" schema, though `08_...` §5 lists it as Epic 6's product and Epic 7 depends on it. Added as Task T-002.

---

## 3. STORY-BY-STORY IMPLEMENTATION PLAN

### Story 6.1 — Question classification & query rewriting
*Est: 1.0d · P0 · No hard dependency*

**Business requirement.** Different questions need different retrieval behaviour (a comparison must pull from both documents; an exact-ID lookup must not be paraphrased away). The system must decide the question type and turn chatty questions into a search-friendly query.

**Acceptance criteria (verbatim).**
- **AC1.** Classifies a question as fact / summary / comparison / cross-document.
- **AC2.** Rewrites conversational questions into a retrieval-friendly query.

Sample action: Classify "What's different between these two contracts?"
Expected result: `{"type": "comparison", "rewrittenQuery": "termination clauses, obligations, key differences"}`.

**Technical interpretation.**
- AC1: output `type` is exactly one of four enum values. Use the spelling from the story sample: `fact`, `summary`, `comparison`, `cross-document`. (`03_architecture.md` §4.2 writes "compare / cross-doc". Use the story spelling as the contract; see F-note in §11.)
- AC2: output `rewrittenQuery` is a string suitable for both embedding and keyword search.

**Implementation.**
1. `QuestionClassifier.classify_and_rewrite(question, conversationContext?, scopeSummary)` makes one LLM call through the swappable LLM interface (F5) requesting strict JSON `{type, rewrittenQuery}`.
2. Validate against a schema. Reject unknown `type` values.
3. **Fallback (graceful degradation):** on LLM failure, invalid JSON, or timeout, return `type = "fact"` and `rewrittenQuery = original question`, log a WARN. Retrieval must never fail because classification failed.
4. **Identifier preservation (BR-006):** before the LLM call, extract verbatim tokens from the original question that look like identifiers, amounts, dates, or quoted phrases (e.g. "SA-2026-014"). After the call, verify each appears in `rewrittenQuery` (or in a separate `verbatimTerms` list; ASSUMPTION: internal field, not exposed). If dropped, append them. This protects Story 4.2's exact-match behaviour.
5. `scopeSummary` (scope type and number of documents) informs classification: a single-document scope cannot be `comparison`; if the LLM returns `comparison` for a one-document scope, downgrade to `fact` (ASSUMPTION, engineering judgement).
6. **Follow-ups:** the user journey (`02_...` §3) has follow-up questions, but Story 6.1 does not say whether chat history is used. OPEN QUESTION. Default ASSUMPTION: accept optional `conversationContext` (last N turns of the same session, N configurable, default 3) so pronouns resolve. Same-session history shares the same workspace and scope, so it introduces no isolation risk.

**Components.** `QuestionClassifier`, `LLMClient` (interface, shared), prompt template file, `IdentifierExtractor` utility.

**Database.** None.

**APIs.** None (in-process). See §7.

**Events.** None.

**Business rules.** BR-005, BR-006.

**Validation.** `question` non-empty and length-capped (config, default 2,000 chars, ASSUMPTION); `type` ∈ enum; `rewrittenQuery` non-empty.

**Error handling.** LLM timeout / bad JSON → fallback above. Empty question → `INVALID_QUESTION` (proposed internal code, §16).

**Security.** No document content is sent to the LLM in this step, only the question, optional history and a scope summary.

**Audit / logging.** DEBUG: type, rewritten query length. WARN on fallback. Do not log full question text at INFO (data sensitivity is an open BRD item, §15).

**Testing.** T6.1-01 to T6.1-06 in §19.

---

### Story 6.2 — Hybrid retrieval (vector + keyword + graph merge) — scope-bounded
*Est: 2.3d · P0 · Built against fixture indexes/graph; wired at Checkpoint 2*

**Business requirement.** Find candidate evidence using three complementary methods and combine them, without ever crossing scope boundaries.

**Acceptance criteria (verbatim).**
- **AC1.** Combines vector search, keyword search, and graph query results into one candidate set.
- **AC2.** Deduplicates overlapping candidates.
- **AC3.** Filters strictly to the selected document IDs (no cross-document leakage for single-doc questions).
- **AC4.** The **graph portion** of retrieval bounds traversal to the induced subgraph of the resolved scope — every node/edge touched, including multi-hop neighbors, is checked against `workspace_id` (always) and the resolved document-ID set (when scope is module/document-level), **not** just the starting node. A shared entity node (e.g. "Acme Corp" appearing in two modules of the same workspace) must not pull in facts from outside the current scope via traversal.

Sample action: Ask a question scoped to Module A, where the graph's "Acme Corp" node also connects to a document in Module B of the same workspace.
Expected result: Returned evidence includes only Module A facts; Module B's facts connected via the shared "Acme Corp" node are not included, even though they're reachable in one graph hop.

**Technical interpretation.**
- AC1: three parallel channels (`VectorSearcher`, `KeywordSearcher`, `GraphRetriever`) feed `CandidateMerger`. A unified candidate is always a **chunk** (graph facts are resolved to their source chunk via `source_chunk_id`) plus optional attached graph facts.
- AC2: two channels returning the same `chunk_id` yield one candidate with provenance `["vector","keyword","graph"]`.
- AC3: every SQL statement includes `document.workspace_id = :workspace_id AND document_chunk.document_id = ANY(:resolvedDocumentIds)`. `document_chunk` has no `workspace_id` column (`04_...` §1), so the workspace predicate requires a join to `document`.
- AC4: see the graph traversal rules below. This is the highest-risk item in the epic.

**Implementation.**

*A. Entry and guard.* `RetrievalService.retrieve(request)` first calls `ScopeGuard.validate`:
- `workspaceId` present; `resolvedDocumentIds` non-empty.
- One cheap SQL check that every ID in `resolvedDocumentIds` belongs to `workspaceId` and is retrievable (BR-004, BR-013). Any mismatch is a **hard failure** (`SCOPE_VIOLATION`), never a silent drop. This is defence in depth: Epic 8 already rejects with `400 SCOPE_OUTSIDE_WORKSPACE` (Story 8.5), but Epic 6 must not trust that alone, because a leak here is a silent correctness failure (BRD §9).

*B. Channels (run concurrently).*
1. **Vector.** Embed `rewrittenQuery` with the same embedding model/adapter Epic 4 used (BGE-M3, `03_...` §7; a mismatched model gives meaningless similarity). Query `document_chunk.embedding` by cosine distance (Story 4.1 AC2), top-K, scoped as in AC3. Join `document_section` for `heading`.
2. **Keyword.** Full-text query over `chunk_text`, using **the same text-search configuration that Epic 4's GIN index was built with** (otherwise the index is not used). Verbatim identifiers are searched as exact terms/phrases. Top-K, scoped as in AC3.
3. **Graph** (skipped when `answerMode = retrieval_only`, BR-010). See traversal rules.

*C. Graph traversal rules (AC4).* Conceptual algorithm; exact query text is left to the implementer:
1. **Seed selection.** Two seed types:
   a. *Entity seeds:* match entity mentions from the question against `(workspace_id, normalized_name)` of `:Organization`/`:Person`/`:Topic` nodes, using the composite index from `04_...` §4. ASSUMPTION: mention extraction uses the classifier LLM output or a lightweight matcher against the scope's entity names (small at POC scale).
   b. *Document seeds:* for `comparison`/`cross-document` questions, or when no entity seed matches, seed from each in-scope `:Document` node (`document_id IN resolvedIds`) and return its key fact edges (`SIGNED`, `EXPIRES_ON`, `AMENDS`, `MENTIONS`, `HAS_VALUE`).
2. **Traversal.** Expand at most `graph.max_hops` (default 2, ASSUMPTION) from seeds.
3. **Per-hop admission test (the core of AC4).** A path step is admitted only if:
   - the destination node has `workspace_id = :workspace_id` (always), **and**
   - if the destination is a `:Document`, its `document_id ∈ resolvedDocumentIds`, **and**
   - the edge's provenance `document_id ∈ resolvedDocumentIds` (F3/F4: requires Epic 5 to stamp `document_id` on edges).
   Entity nodes are never a bridge to out-of-scope documents: reaching "Acme Corp" from Module A does **not** allow stepping from "Acme Corp" to a Module B `:Document`. This is exactly the sample scenario.
4. **`AMENDS` edges** whose target document is outside scope are not followed (the induced subgraph excludes them). Same for `CONTRADICTS` where either side's source document is outside scope.
5. **Resolve to chunks.** For every admitted fact, take its source pointer (`source_chunk_id`, page) and load the chunk **through the same scoped SQL as AC3**. If the chunk is not in scope or not found, **discard the fact** (BR-012). This is a second, independent isolation check.
6. **Contradictions.** Call Epic 5's scope-bounded contradiction query (Story 5.4) with `(workspaceId, resolvedDocumentIds)` and attach results as `contradictions[]` in the package. ASSUMPTION: Epic 6 attaches them for Epic 7; Story 7.2 also depends on 5.4 directly. OPEN QUESTION: which epic invokes it, to avoid a double call.

*D. Merge.* `CandidateMerger`:
- Union by `chunk_id`; record per-channel rank and score, plus `provenance[]`.
- Initial ordering by Reciprocal Rank Fusion across channels (ASSUMPTION: engineering judgement, since raw pgvector and FTS scores are not comparable). Cap merged set at `merge.max_candidates` (default 40, ASSUMPTION).
- Attach graph facts to the chunk they cite; facts always survive into `graphFacts[]` even if their chunk is later trimmed by reranking (Epic 7 verification needs them).

*E. Mode switch (F2).* `answerMode ∈ {retrieval_only, retrieval_plus_graph}`, values exactly as in `CHAT_MESSAGE.answer_mode`. `retrieval_only` skips channel 3 and contradiction lookup and returns empty `graphFacts` / `contradictions`. Everything else is identical, so the evaluation comparison isolates the graph's effect. **DESIGN GAP:** Story 7.2 verifies "against evidence + graph", so Epic 7 must also honour the mode. Raise with the Epic 7 owner (same person).

**Components.** `RetrievalService`, `ScopeGuard`, `VectorSearcher`, `KeywordSearcher`, `GraphRetriever`, `GraphScopeFilter`, `GraphFactResolver`, `CandidateMerger`, `EmbeddingClient` (from Epic 4), `Neo4jClient`, `PostgresRepository` (read-only).

**Database (Postgres, read-only).**

| Table | Use |
|---|---|
| `document` | `id`, `workspace_id`, `group_id`, `processing_status`, `file_name`; scope and status filter |
| `document_chunk` | `id`, `document_id`, `section_id`, `page_number`, `chunk_text`, `embedding`, `token_count` |
| `document_section` | `heading` (for citation) |

**Neo4j (read-only).** `:Document`, `:Organization`, `:Person`, `:DateFact`, `:Amount`, `:Topic` and the six relationship types in `04_...` §3.

**Events.** None.

**Business rules.** BR-001 to BR-004, BR-007, BR-010 to BR-013, BR-015.

**Validation.** See §14 `retrieve`.

**Error handling.** Vector/keyword failure = whole request fails (evidence would be incomplete). Graph failure: see OPEN QUESTION F6. Zero candidates is a valid result (empty package), not an error; Epic 7 turns it into "not found".

**Security.** Parameterised queries only (no string-built SQL/Cypher). `workspace_id` never derived from user text.

**Audit / logging.** Per-channel candidate counts, latencies, scope size, graph facts admitted/discarded (counts only, no text at INFO).

**Testing.** T6.2-01 to T6.2-14 in §19.

---

### Story 6.3 — Reranking + evidence balancing
*Est: 1.5d · P0 · Depends on 6.2*

**Business requirement.** Send Epic 7 the most relevant passages, and for comparisons make sure every relevant document is represented (BRD §8.4: "keep facts from each document separate and correctly attributed").

**Acceptance criteria (verbatim).**
- **AC1.** Top candidates are reranked by relevance before being sent to the LLM.
- **AC2.** For comparison questions, evidence is balanced so no single document dominates the evidence package.

Sample action: Ask a comparison question across 2 documents.
Expected result: Final evidence package includes passages from both documents, not just the one with more/denser text.

**Technical interpretation.**
- AC1: a cross-encoder reranker scores `(rewrittenQuery, chunk_text)` pairs for the merged candidates and the package is sorted by that score. Reranker sits behind an adapter (`06_...` §1 point 3).
- AC2: applies to `comparison` (and, ASSUMPTION, `cross-document`). No document may exceed its share unless others have no relevant candidates.

**Implementation.**
1. `Reranker` interface with a BGE-reranker implementation (`03_...` §7, "or equivalent") and a deterministic fake for tests. Rerank the top `rerank.input_size` merged candidates (default 30, ASSUMPTION). Output `rerankScore` per candidate.
2. `EvidenceBalancer.balance(candidates, type, resolvedDocumentIds, budget)`:
   - `fact` / `summary`: take top `package.max_chunks` by `rerankScore` (summary uses larger budget and section diversity, ASSUMPTION).
   - `comparison` / `cross-document`: **quota + round-robin.** Determine documents present in the candidate set. Give each a floor of `floor(max_chunks / numDocs)` slots filled by its highest-scoring chunks, then fill the remainder round-robin by best remaining score. No document may hold more than `ceil(max_chunks * balance.max_share)` (default 0.6, ASSUMPTION).
   - **Coverage fallback:** if the scope has at most `balance.fanout_max_docs` documents (default 6, ASSUMPTION) and any in-scope document has zero candidates for a comparison question, run one supplemental per-document vector+keyword query (same scoping rules as AC3) for that document, rerank those results, then balance. This addresses the sample case where one document has denser text and would otherwise crowd the other out at merge time.
3. `EvidencePackageBuilder.build(...)` assembles the package (§7) and enforces the token budget `package.max_tokens` (default 3,000, ASSUMPTION) using `token_count` from `document_chunk`, trimming lowest-scored chunks first, never below the per-document floor.
4. Preserve document identity on every item so downstream attribution cannot mix documents (BRD §8.4).

**Components.** `Reranker` (interface + BGE impl + fake), `EvidenceBalancer`, `EvidencePackageBuilder`.

**Database.** Read-only, only for the supplemental per-document fan-out (same tables as 6.2).

**Business rules.** BR-008, BR-009, BR-011.

**Validation.** Every candidate has `documentId ∈ resolvedDocumentIds` before entering the package (re-asserted in the builder as a third guard).

**Error handling.** Reranker failure/timeout → fall back to RRF order, set `diagnostics.rerankSkipped = true`, log WARN. This is a degraded but valid package. OPEN QUESTION: for evaluation runs, should this fail hard instead, so scores are comparable? Default: degrade and flag.

**Security.** None beyond scope guards.

**Audit / logging.** Log package size, per-document chunk counts, whether fan-out fired.

**Testing.** T6.3-01 to T6.3-07 in §19.

---

## 4. END-TO-END FLOW

```
Epic 8: session scope resolved → resolvedDocumentIds + workspace_id (Story 8.1/8.5)
   ↓ (question arrives via Core API ORCH → AI Service)
RetrievalService.retrieve(request)
   ↓
ScopeGuard.validate ───────────── fail → SCOPE_VIOLATION (hard error)
   ↓
QuestionClassifier.classify_and_rewrite ── LLM fail → fallback {fact, original question}
   ↓
┌────────────────┬──────────────────┬───────────────────────────┐
VectorSearcher   KeywordSearcher    GraphRetriever (skipped if retrieval_only)
(pgvector)       (Postgres FTS)     (Neo4j, induced-subgraph)
└────────────────┴──────────────────┴───────────────────────────┘
   ↓
CandidateMerger (dedupe by chunk_id, RRF)
   ↓
Reranker (cross-encoder)
   ↓
EvidenceBalancer (comparison → per-document quota; fan-out if a doc is missing)
   ↓
EvidencePackageBuilder (token budget, citation metadata, graph facts, contradictions)
   ↓
Epic 7: GroundedAnswerGenerator → ClaimVerifier → citations → Epic 8 SSE
```

| Path | Behaviour |
|---|---|
| Happy path | Package with ranked chunks, graph facts, metadata |
| Validation failure | Empty question / empty scope → `INVALID_REQUEST`, no channel runs |
| Business failure | Scope contains a document from another workspace → `SCOPE_VIOLATION`, nothing retrieved |
| Not found | Zero candidates → empty package (valid). Epic 7 returns "not found" |
| Duplicate | Same chunk from several channels → one candidate |
| Unauthorized | Handled upstream (Core API, Story 0.4). AI Service is internal only |
| External failure: LLM | Classification fallback |
| External failure: Neo4j | See F6 |
| External failure: Postgres | Request fails; nothing to degrade to |
| Timeout | Per-channel timeout; vector/keyword timeout fails request; graph/reranker timeout degrades with flag |
| Retry | One retry on transient DB error per channel (ASSUMPTION); no retry on scope errors |
| Rollback / partial failure | Not applicable (read-only). Partial channel results are never returned unflagged |

---

## 5. ARCHITECTURE MAPPING

Follows `03_architecture.md` §4.1/§4.2 and `08_...` §3 (EP6 boxes QC → QR → VS/KS/GS → MG → RR). No redesign.

| Component | Responsibility | Input | Output | Depends on | External |
|---|---|---|---|---|---|
| RetrievalService | Orchestrates pipeline, mode switch, degradation | RetrievalRequest | EvidencePackage | all below | none |
| ScopeGuard | Rejects invalid/mismatched scope | workspaceId, resolvedIds | pass / error | Postgres | Postgres |
| QuestionClassifier | Type + rewrite | question, context | `{type, rewrittenQuery}` | LLMClient | LLM |
| VectorSearcher | Semantic search | rewrittenQuery, scope | ranked chunks | EmbeddingClient | Postgres/pgvector |
| KeywordSearcher | Exact-term search | query, verbatim terms, scope | ranked chunks | Postgres | Postgres FTS |
| GraphRetriever | Scope-bounded graph facts | query, scope | facts + chunk refs | Neo4jClient | Neo4j |
| GraphFactResolver | Fact → in-scope chunk | facts | chunks or discard | Postgres | Postgres |
| CandidateMerger | Union, dedupe, RRF | 3 channel outputs | candidates | none | none |
| Reranker | Relevance scoring | query, candidates | scored candidates | adapter | BGE model |
| EvidenceBalancer | Multi-doc balance | scored candidates, type | selected chunks | Postgres (fan-out) | Postgres |
| EvidencePackageBuilder | Final package | selected + facts | EvidencePackage | none | none |

---

## 6. DATABASE IMPLEMENTATION

**Epic 6 creates no tables and no migrations, and writes nothing.** Everything is read-only against schemas owned by Epics 0, 2, 4 and 5. `ANSWER_CITATION` is written by Epic 8, not here. Redis is not used (no caching is specified in any source).

| Entity | Purpose for Epic 6 | PK / FKs | Columns used | Indexes relied on (owner) |
|---|---|---|---|---|
| `DOCUMENT` | scope + status filter | `id`; `workspace_id`, `group_id` | `id, workspace_id, group_id, processing_status, file_name` | B-tree `workspace_id`, `group_id` (Epic 0) |
| `DOCUMENT_CHUNK` | evidence text | `id`; `document_id`, `section_id` | `id, document_id, section_id, page_number, chunk_text, embedding, token_count` | HNSW on `embedding`, GIN on `chunk_text` (Epic 0/4) |
| `DOCUMENT_SECTION` | citation heading | `id`; `document_id` | `id, heading, start_page, end_page` | none needed |

| Operation | Detail |
|---|---|
| CREATE / UPDATE / DELETE | None |
| READ: vector | `document_chunk` ⨝ `document`, filter `workspace_id`, `document_id = ANY(ids)`, `processing_status='READY'`; order by cosine distance; limit K |
| READ: keyword | Same joins/filters; FTS match; rank; limit K |
| READ: chunk by ID (graph resolution) | Same joins/filters, `id = ANY(sourceChunkIds)` |
| READ: fan-out | Same as vector/keyword with a single `document_id` |
| Transaction | Read-only, default isolation, no locks |
| Failure | Connection error → retry once → fail request |

**Neo4j (owned by Epic 5), relied-on contract:**

| Requirement | Why | Status |
|---|---|---|
| `workspace_id` on every node | isolation | Documented (`04_...` §3) |
| Composite indexes `(workspace_id, normalized_name)` for Org/Person; `:Document(document_id / workspace_id / group_id)` | seed lookup and scope resolution | Documented (`04_...` §4) |
| `source_chunk_id` + `source_page` on facts | resolve to chunks | Documented on **nodes** |
| `document_id` + `source_chunk_id` on **edges** | per-hop scope test (AC4) | **DESIGN GAP F3/F4, must be added to Epic 5 Story 5.2** |
| Scope-bounded contradiction query | contradictions in package | Story 5.4 |

---

## 7. API IMPLEMENTATION

**No external REST endpoints.** Epic 6 is invoked in-process by the AI Service's question-answering flow, which the Core API reaches via the internal AI-service call (`03_...` §2). **DESIGN GAP F1:** the AI-service internal endpoint that composes retrieval and generation is not specified anywhere, and `05_api_specs.md` was not supplied.

**Internal contract (ASSUMPTION, to be reconciled with `05_api_specs.md`):**

**RetrievalRequest**

| Field | Type | Required | Notes |
|---|---|---|---|
| `workspaceId` | uuid | yes | from Epic 8 session |
| `resolvedDocumentIds` | uuid[] | yes, non-empty | from Epic 8, never re-derived |
| `scopeType` | `workspace`/`module`/`documents` | yes | matches Story 8.1 |
| `question` | string | yes | |
| `answerMode` | `retrieval_only`/`retrieval_plus_graph` | yes | matches `CHAT_MESSAGE.answer_mode` |
| `conversationContext` | array | no | see Story 6.1 OPEN QUESTION |
| `requestId` | string | yes | Story 10.1 correlation |

**EvidencePackage** (the contract Epic 7 builds its fixture against)

| Field | Notes |
|---|---|
| `questionType`, `rewrittenQuery`, `answerMode` | echoed from processing |
| `workspaceId`, `resolvedDocumentIds` | echoed, so Epic 7 can assert scope |
| `chunks[]` | each: `chunkId`, `documentId`, `documentName`, `pageNumber`, `sectionId`, `sectionHeading`, `text`, `rerankScore`, `provenance[]` |
| `graphFacts[]` | each: `factType`, `subject`, `relationship`, `object`, `documentId`, `sourceChunkId`, `sourcePage`. Empty in `retrieval_only` |
| `contradictions[]` | each: both conflicting facts with `documentId` and page (per Story 5.4 AC3). Empty in `retrieval_only` |
| `perDocumentCounts` | for balance verification |
| `diagnostics` | `graphStatus` (`OK`/`SKIPPED`/`FAILED`), `rerankSkipped`, channel counts, latencies |

Citation fields deliberately mirror `ANSWER_CITATION` (`document_id`, `chunk_id`, `page_number`, `section_heading`, `source_excerpt`) so Epic 8 can persist them without lookups.

**Per-API template values:** Caller = AI-service orchestration / Epic 9 harness (via chat pipeline). Authentication = internal network only (ASSUMPTION; user auth is enforced at Core API). Idempotent (pure read). Retry: safe. Timeout: see §21. Events: none. Audit: none here (Story 10.2 audits at Epic 8).

An optional internal debug route (e.g. to run retrieval without generation for tuning) is **not** in any source and is left as OPEN QUESTION, not planned.

---

## 8. BUSINESS RULES

| ID | Rule | Source | Enforced where | Failure | Test |
|---|---|---|---|---|---|
| BR-001 | Every retrieval query is filtered by `workspace_id` AND `resolvedDocumentIds` | Arch §4.1, Story 6.2 AC3, BRD §8.4 | Every SQL statement | Never return out-of-scope row | T6.2-05, T6.2-06 |
| BR-002 | Graph traversal is bounded to the induced subgraph of the scope at every hop | Story 6.2 AC4, Arch §4.2 | GraphRetriever/GraphScopeFilter | Discard step | T6.2-09, T6.2-10 |
| BR-003 | Epic 6 consumes resolved scope only; it never resolves or widens scope | Arch §4.1 ("never re-derived per question") | ScopeGuard | Reject | T6.2-07 |
| BR-004 | Any document ID not belonging to `workspaceId` is a hard error | Story 8.5 AC2 (mirrored), BRD §9 | ScopeGuard | `SCOPE_VIOLATION` | T6.2-08 |
| BR-005 | Question type ∈ {fact, summary, comparison, cross-document} | Story 6.1 AC1 | QuestionClassifier | Fallback to `fact` | T6.1-01..03 |
| BR-006 | Rewriting must never drop exact identifiers/amounts from the question | Story 4.2 AC2 (exact matching), engineering judgement | QuestionClassifier | Re-append terms | T6.1-05 |
| BR-007 | Candidates are de-duplicated by `chunk_id` | Story 6.2 AC2 | CandidateMerger | n/a | T6.2-04 |
| BR-008 | Reranking happens before anything reaches the LLM | Story 6.3 AC1 | RetrievalService | Fallback flagged | T6.3-01 |
| BR-009 | Comparison evidence must be balanced across documents | Story 6.3 AC2 | EvidenceBalancer | n/a | T6.3-03..05 |
| BR-010 | `retrieval_only` mode never queries the graph; identical otherwise | BRD §8.6, Story 9.3 AC1 | RetrievalService | n/a | T6.2-11 |
| BR-011 | Evidence is source-faithful chunk text with citation metadata, never LLM summaries or `document.summary/overview` | Arch §1 principle 3, §9 | EvidencePackageBuilder | Reject item | T6.3-07 |
| BR-012 | A graph fact without a resolvable, in-scope source chunk is discarded | Arch §1 principle 3, DB §3 | GraphFactResolver | Discard | T6.2-12 |
| BR-013 | Only documents in `READY` status (and not archived) are retrievable | ASSUMPTION (F8) | SQL filter | Excluded | T6.2-13 |
| BR-015 | Epic 6 is read-only against Postgres and Neo4j | Design | Repository layer | n/a | T6.2-14 |

---

## 9. STATE MACHINES

Epic 6 owns no status workflow. It reads `DOCUMENT.processing_status` (`UPLOADED → PARSING → EXTRACTING → INDEXING → READY | FAILED`, owned by Epic 1/Story 1.3) and filters to `READY` (BR-013).

Per-request pipeline states are transient and in-memory only: `VALIDATED → CLASSIFIED → RETRIEVED → MERGED → RERANKED → BALANCED → PACKAGED`; any state may exit to `FAILED`. Nothing is persisted, so no database changes or events.

**OPEN QUESTION:** a document in `INDEXING` may have chunks but a partial graph. Excluding non-`READY` documents avoids half-indexed evidence but means a scope selected while a document is still processing silently omits it. Epic 8/FE should show status (Story 1.3), and `diagnostics` should list excluded document IDs.

---

## 10. EVENTS AND INTEGRATIONS

No events (none in any source document).

| Integration | Source → Target | Protocol | Auth | Timeout | Retry | Failure | Idempotent |
|---|---|---|---|---|---|---|---|
| Postgres (chunks, docs) | AI Service → Postgres | SQL | service credentials | `retrieval.db_timeout_ms` | 1 | fail request | yes |
| Neo4j | AI Service → Neo4j | Bolt | service credentials | `retrieval.graph_timeout_ms` | 1 | degrade/flag (F6) | yes |
| LLM | AI Service → provider adapter | Ollama or hosted API | per provider | `retrieval.llm_timeout_ms` | 0 | classification fallback | yes |
| Embedding model | AI Service → local model | in-process/HTTP | n/a | config | 0 | fail request | yes |
| Reranker | AI Service → local model | in-process/HTTP | n/a | `retrieval.rerank_timeout_ms` | 0 | degrade/flag | yes |

Ordering and transaction behaviour: all read-only, so none apply.

---

## 11. CROSS-EPIC DEPENDENCIES

| # | Dependency | Providing epic → Dependent | What is consumed | Contract | Failure behaviour |
|---|---|---|---|---|---|
| D1 | Chunk/section rows | Epic 2 → Epic 6 (via Epic 4) | text, page, section | `04_...` §1 tables | fixtures until CP1 |
| D2 | Vector + FTS indexes, embedding adapter | Epic 4 → Epic 6 | `embedding`, GIN index, model identity | Story 4.1/4.2 | fixtures until CP1 |
| D3 | Knowledge graph | Epic 5 → Epic 6 | nodes/edges with `workspace_id`; **edge provenance (F3/F4)** | `04_...` §3 + edge amendment | fixtures until CP1 |
| D4 | Contradiction query | Epic 5 (5.4) → Epic 6 | scope-bounded conflicting facts | `(workspaceId, resolvedIds)` → facts + sources | omit if unavailable, flag |
| D5 | Resolved scope | Epic 8 (8.1/8.5) → Epic 6 | `workspaceId`, `resolvedDocumentIds`, `answerMode` | §7 request | reject invalid |
| D6 | Document rows/status | Epic 1 → Epic 6 | `workspace_id`, `group_id`, `processing_status` | ER `DOCUMENT` | n/a |
| D7 | Evidence package | Epic 6 → Epic 7 | §7 schema | published Day 1–2 with golden sample | Epic 7 builds against fixture |
| D8 | Dual-mode retrieval | Epic 6 → Epic 9 (via 7/8) | `answerMode` behaviour | BR-010 | stub until CP3 |

**Checkpoint alignment (from `08_...` §1):** data from Epics 4 and 5 becomes real at Checkpoint 1 (Day 5); Epic 6's own fixture→real swap is at Checkpoint 2 (Day 8), alongside Epic 7. These do not conflict: the Day 5 to Day 8 window is for wiring and tuning Epic 6 against real data.

**CONFLICT (minor, naming):** `03_architecture.md` §4.2 names types "fact / summary / compare / cross-doc"; Story 6.1 uses "fact / summary / comparison / cross-document". Resolution: use Story 6.1 spelling (story sample output uses `"comparison"`). Implementation can proceed. Epic 7 must use the same enum.

Do not duplicate: Epic 6 must not re-implement embedding generation, entity resolution, contradiction detection or scope resolution.

---

## 12. SHARED COMPONENTS

| Component | Owner | Contract | Epic 6 usage |
|---|---|---|---|
| LLM provider interface | **DESIGN GAP F5.** Recommend: formally Epic 7 (Story 7.1 AC2), interface created first by whichever of 6.1/7.1 starts first, in a shared module | one `LLMClient` with a single config value for provider | classification/rewrite; test fake |
| Embedding client | Epic 4 (Story 4.1) | `embed(text) → vector`, model identity constant | query embedding |
| Reranker adapter | **Epic 6** (only consumer) | `rerank(query, candidates) → scores` | Story 6.3 |
| Postgres access layer | Epic 0 | connection config | read-only repositories |
| Neo4j client | Epic 5 (writer) / Epic 0 (config) | Bolt session config | read-only queries |
| Structured logging + `requestId` | Epic 10 (Story 10.1) | JSON log fields | per-request context |
| Auth | Epic 0 (Story 0.4) | at Core API only | none in AI Service |

---

## 13. FILE / MODULE IMPLEMENTATION PLAN

**DESIGN GAP F7:** no repository tree is documented. Names below are **logical modules within the `ai-service` (Python · FastAPI)**; map them to real paths once Story 0.1 creates the skeleton.

**CREATE**

| Module | Responsibility | Depends on | Depended on by |
|---|---|---|---|
| `retrieval/service` | `RetrievalService.retrieve` orchestration, mode switch, degradation | all below | Epic 7/8 pipeline |
| `retrieval/schemas` | `RetrievalRequest`, `EvidencePackage`, enums | none | everything, Epic 7 |
| `retrieval/scope_guard` | scope validation | Postgres repo | service |
| `retrieval/question_classifier` | Story 6.1 | LLMClient, identifier utility | service |
| `retrieval/identifier_extractor` | verbatim-term extraction | none | classifier, keyword search |
| `retrieval/vector_search` | pgvector channel | EmbeddingClient, repo | service |
| `retrieval/keyword_search` | FTS channel | repo | service |
| `retrieval/graph_retriever` | seed selection, bounded traversal | Neo4j client | service |
| `retrieval/graph_scope_filter` | per-hop admission rules | none | graph_retriever |
| `retrieval/graph_fact_resolver` | fact → in-scope chunk | repo | graph_retriever |
| `retrieval/merger` | dedupe + RRF | none | service |
| `retrieval/reranker` | interface, BGE impl, fake | model | service |
| `retrieval/balancer` | multi-document balancing + fan-out | repo | service |
| `retrieval/package_builder` | token budget, package assembly | none | service |
| `retrieval/repository` | read-only SQL | Postgres | channels |
| `retrieval/config` | tunables (§21) | none | all |
| `retrieval/prompts` | classification prompt | none | classifier |
| `tests/fixtures/retrieval` | two-workspace fixtures (§19) | none | tests, Epic 7 |

**MODIFY**

| Existing item | Change | Reason |
|---|---|---|
| Epic 5 graph writer (Story 5.2) | Stamp `document_id`, `source_chunk_id`, `source_page` on **edges** | F3/F4 |
| Epic 5 contradiction query (Story 5.4) | Expose a callable `(workspaceId, resolvedDocumentIds)` function | D4 |
| Epic 7 fixture | Build against golden EvidencePackage from T-002 | D7 |
| Epic 9 run executor | Pass `answerMode` through the pipeline | BR-010 |

**DELETE:** none.

---

## 14. METHOD-LEVEL IMPLEMENTATION DETAILS

**`RetrievalService.retrieve(request) → EvidencePackage`**
1. Validate request fields; call `ScopeGuard.validate` (hard-fail on mismatch).
2. `classify_and_rewrite` (fallback on failure).
3. Launch vector and keyword searches concurrently; launch graph retrieval too unless mode is `retrieval_only`.
4. Await all with per-channel timeouts. Vector/keyword failure → raise. Graph failure → per F6 default: set `graphStatus = FAILED`, continue.
5. `CandidateMerger.merge`; cap.
6. `Reranker.rerank` (fallback: RRF order, flag).
7. `EvidenceBalancer.balance` (fan-out if applicable).
8. `EvidencePackageBuilder.build`, re-asserting every item's document is in scope.
9. Log summary; return. Inputs: request. Outputs: package. Transaction: none. Exceptions: `INVALID_REQUEST`, `SCOPE_VIOLATION`, `RETRIEVAL_UNAVAILABLE`.

**`ScopeGuard.validate(workspaceId, ids)`** — reject empty; run one query asserting every ID belongs to workspace and is retrievable; return list of excluded (non-READY) IDs for diagnostics; raise on foreign IDs.

**`GraphRetriever.retrieve(query, scope, questionType)`** — select seeds (entity or document), traverse with `GraphScopeFilter`, collect facts, resolve via `GraphFactResolver`, return facts + chunk refs. Never returns a fact whose provenance is out of scope.

**`GraphScopeFilter.admit(step)`** — returns true only if destination `workspace_id` matches, any `:Document` destination is in the resolved set, and edge provenance `document_id` is in the resolved set. Pure function, unit-testable without Neo4j.

**`CandidateMerger.merge(vec, kw, graph)`** — group by `chunk_id`, combine provenance, compute RRF, sort, cap.

**`EvidenceBalancer.balance(cands, type, ids, budget)`** — as Story 6.3; returns selected chunks and `perDocumentCounts`.

**`EvidencePackageBuilder.build(...)`** — attach citation metadata, enforce token budget, echo scope, fill diagnostics.

---

## 15. TRANSACTION AND CONSISTENCY

- All operations are read-only; no transactions or locks are needed.
- **Consistency between stores:** Postgres and Neo4j are separate. A document being reprocessed may momentarily have new chunks but old graph facts (or the reverse). Mitigation: the fact-to-chunk resolution step (BR-012) discards facts whose chunk no longer exists; `READY` filter (BR-013) reduces exposure.
- **Idempotency:** identical request yields an identical package, given unchanged data and a deterministic reranker. LLM classification may vary; set temperature to 0 (ASSUMPTION) to help evaluation reproducibility.
- **Concurrency:** stateless; safe to run in parallel.
- **Retry implications:** safe to retry; no side effects.

---

## 16. ERROR HANDLING

Error codes below are **proposed internal codes**, since the source documents define only `SCOPE_OUTSIDE_WORKSPACE` (Epic 8) among relevant ones.

| Condition | Error | HTTP (if surfaced) | Code | Logging | Recovery |
|---|---|---|---|---|---|
| Empty/oversize question | reject | 400 | `INVALID_QUESTION` | WARN | caller fixes |
| Empty `resolvedDocumentIds` | reject | 400 | `INVALID_SCOPE` | WARN | caller fixes |
| Document not in workspace | reject | 400 | `SCOPE_VIOLATION` | **ERROR** (security-relevant) | none, must not proceed |
| Non-READY documents in scope | continue, list in diagnostics | n/a | n/a | INFO | user waits for READY |
| All scoped documents non-READY | empty package | n/a | n/a | WARN | Epic 7 returns not-found |
| Invalid LLM JSON / timeout | fallback | n/a | n/a | WARN | `{fact, original question}` |
| Postgres failure | fail | 503 | `RETRIEVAL_UNAVAILABLE` | ERROR | retry once |
| Neo4j failure, mode `retrieval_plus_graph` | **OPEN QUESTION F6.** Default: continue with `graphStatus=FAILED`; Epic 8 must record `answer_mode=retrieval_only` for that message; evaluation runs should fail hard | n/a | `GRAPH_UNAVAILABLE` | ERROR | retry once |
| Reranker failure | degrade | n/a | n/a | WARN | RRF order, flag |
| Timeout | per channel as above | 504 | `RETRIEVAL_TIMEOUT` | WARN | none |
| Concurrency conflict | not applicable (read-only) | | | | |

---

## 17. SECURITY

- Authentication and user authorization are enforced at the Core API (Story 0.4, Story 1.1 AC2). The AI Service is internal only (ASSUMPTION).
- **Resource access:** workspace and document isolation is the central security requirement (BRD §9). Enforced at four points: Epic 8 rejection, `ScopeGuard`, every SQL predicate, per-hop graph admission plus fact resolution guard.
- **Injection:** parameterised SQL and Cypher only; never concatenate question text or IDs into query strings. The question text is untrusted input to the LLM classifier; its output is schema-validated and never executed.
- **Prompt injection via documents** is not reachable in Epic 6 (no document text goes to an LLM here). Epic 7 owns that risk.
- **Sensitive data:** data sensitivity is unresolved (BRD §15). Do not log question text or chunk text at INFO.
- **Secrets:** DB/Neo4j/LLM credentials from environment only.

---

## 18. OBSERVABILITY

- **Correlation:** carry `requestId` (Story 10.1) through every log line.
- **Logs (INFO):** question type, scope type, scope size, answer mode, per-channel candidate counts and latencies, merged count, final chunk count, per-document counts, graph facts admitted vs discarded, `graphStatus`, `rerankSkipped`, total latency.
- **WARN:** classifier fallback, reranker fallback, degraded graph, excluded non-READY documents.
- **ERROR:** `SCOPE_VIOLATION`, DB/Neo4j failures.
- **Metrics/tracing:** none specified in the sources. Latency and counts in structured logs are sufficient for the POC.
- **Audit:** not an Epic 6 responsibility (Story 10.2 audits question asked and answered at Epic 8).
- **Evaluation support:** the `diagnostics` block lets Epic 9 explain accuracy differences between modes.

---

## 19. TEST IMPLEMENTATION PLAN

**Shared fixture (build first; enables all isolation tests).** Two workspaces, **Finance** and **Governance**.
- Both contain a module named "Contracts".
- Both mention "Acme Corp".
- Finance also has Module A and Module B; a document in each connects to the same "Acme Corp" node.
- Finance includes an amendment/contract pair with conflicting expiry dates (31 Mar 2027 vs 30 Jun 2027 from `04_...` §3), and a document containing an exact reference such as "SA-2026-014" (Story 4.2 sample).
- Around 20 chunks with embeddings seeded in Postgres, plus the matching graph in Neo4j (per `06_...` §1 point 2).
- One document pair with unequal text volume, for balancing tests.

### Unit Tests
- Classifier: enum validation, fallback, single-document downgrade, identifier re-append.
- `GraphScopeFilter.admit` truth table (pure function).
- Merger: dedupe and RRF ordering.
- Balancer: quota, share cap, floor.
- Builder: token-budget trim, document-in-scope assertion.

### Integration Tests
- Vector, keyword, and graph channels against fixtures (Postgres + pgvector + Neo4j containers).
- Fan-out coverage fallback.

### API Tests
- No public API. Test the `RetrievalService.retrieve` contract (§7) instead.

### Event Tests
- None (no events).

### Database Tests
- Verify SQL plans use the HNSW and GIN indexes (sanity check).
- Verify no writes occur (BR-015).

### End-to-End Tests
- At Checkpoint 2: one real question through real Epic 4/5 data into Epic 7.
- At Checkpoint 3: run both modes through Epic 9 harness.

### Negative Tests
- Foreign-workspace ID, empty scope, LLM down, Neo4j down, reranker down, zero candidates, non-READY document.

### Regression Tests
- Fixed golden EvidencePackage snapshot for fixture questions.
- The **explicit workspace-isolation test** required by `06_...` §16 must remain in CI permanently.

### Story / AC test map

| Story | AC | Test | Type | Expected result |
|---|---|---|---|---|
| 6.1 | AC1 | T6.1-01 "What's different between these two contracts?" | Unit | `type=comparison` |
| 6.1 | AC1 | T6.1-02 fact, summary and cross-document samples | Unit | correct enum each |
| 6.1 | AC1 | T6.1-03 LLM returns unknown type | Unit | fallback `fact` |
| 6.1 | AC2 | T6.1-04 conversational question | Unit | non-empty, keyword-style `rewrittenQuery` |
| 6.1 | AC2 | T6.1-05 question containing "SA-2026-014" | Unit | identifier preserved verbatim (BR-006) |
| 6.1 | AC1/2 | T6.1-06 LLM timeout | Unit | fallback `{fact, original}`, WARN |
| 6.2 | AC1 | T6.2-01 query hits all three channels | Integration | candidate set contains items from vector, keyword, graph |
| 6.2 | AC1 | T6.2-02 exact ID query | Integration | keyword channel surfaces the "SA-2026-014" chunk |
| 6.2 | AC1 | T6.2-03 entity question | Integration | graph channel contributes a fact with a resolvable chunk |
| 6.2 | AC2 | T6.2-04 chunk returned by 3 channels | Unit | one candidate, `provenance` has 3 entries |
| 6.2 | AC3 | T6.2-05 single-document scope, question matching other document's text | Integration | zero chunks from other documents |
| 6.2 | AC3 | T6.2-06 module scope | Integration | only that module's documents |
| 6.2 | AC3 | T6.2-07 caller passes extra ID not in resolved list | Unit | never appears in output (BR-003) |
| 6.2 | AC3 | T6.2-08 ID from another workspace | Integration | `SCOPE_VIOLATION`, nothing retrieved |
| 6.2 | AC4 | T6.2-09 sample scenario: Module A scope, "Acme Corp" also linked to Module B doc | Integration | only Module A facts; no Module B evidence |
| 6.2 | AC4 | T6.2-10 `AMENDS` edge to out-of-scope document; multi-hop path through shared entity | Integration | not traversed; not returned |
| 6.2 | AC4 | T6.2-10b Finance vs Governance "Acme Corp" | Integration | zero Governance data in any Finance retrieval and vice versa |
| 6.2 | BR-010 | T6.2-11 same question in both modes | Integration | `retrieval_only`: no graph query issued, empty `graphFacts`; other fields comparable |
| 6.2 | BR-012 | T6.2-12 fact whose `source_chunk_id` is out of scope | Integration | fact discarded |
| 6.2 | BR-013 | T6.2-13 non-READY document | Integration | excluded, listed in diagnostics |
| 6.2 | BR-015 | T6.2-14 write attempt detection | Database | none occur |
| 6.2 | AC4 | T6.2-15 contradiction in Module B, query scoped to Module A | Integration | not in `contradictions[]`; present at workspace scope |
| 6.3 | AC1 | T6.3-01 known-relevant chunk ranked low by RRF | Integration | reranked above irrelevant ones |
| 6.3 | AC1 | T6.3-02 reranker down | Integration | RRF order, `rerankSkipped=true` |
| 6.3 | AC2 | T6.3-03 comparison across 2 docs, one with denser text | Integration | passages from both documents present |
| 6.3 | AC2 | T6.3-04 share cap | Unit | no document above `max_share` unless others empty |
| 6.3 | AC2 | T6.3-05 one document absent from merged set | Integration | fan-out retrieves it and it appears |
| 6.3 | AC1/2 | T6.3-06 zero candidates | Unit | empty package, no error |
| 6.3 | BR-011 | T6.3-07 items reference chunk text, not summary | Unit | every item has `chunkId` with source text |

Every one of the 8 acceptance criteria has at least one test; the workspace-isolation scenarios are P0 blockers.

---

## 20. NON-FUNCTIONAL REQUIREMENTS

| Area | Requirement |
|---|---|
| Accuracy | Highest priority (BRD §9). Parameters (K values, share cap, hop depth) are config-driven so Epic 9 can tune them |
| Performance | BRD: first response within a few seconds. ASSUMPTION: retrieval budget of about 1.5 s p95 excluding generation, at POC scale. Run channels in parallel, cap candidates. **Risk:** cross-encoder reranking on CPU may exceed this (GPU unconfirmed, BRD §15). Mitigate with `rerank.input_size` |
| Scalability | Not a priority (BRD §9) |
| Availability / Reliability | Must complete a demo run reliably; degradation paths in §16 |
| Security | §17 |
| Maintainability | Adapters on LLM, embeddings, reranker (`06_...` §1) |
| Observability | §18 |
| Accessibility | Not applicable (no UI) |
| Data retention | No data stored |

---

## 21. CONFIGURATION

All names below are **proposed** (ASSUMPTION); defaults are starting points to be tuned by the evaluation harness.

| Key | Default | Purpose |
|---|---|---|
| `retrieval.vector_top_k` | 20 | vector candidates |
| `retrieval.keyword_top_k` | 20 | keyword candidates |
| `retrieval.graph.max_hops` | 2 | traversal depth |
| `retrieval.graph.max_facts` | 30 | cap on returned facts |
| `merge.max_candidates` | 40 | cap after merge |
| `rerank.input_size` | 30 | candidates reranked |
| `package.max_chunks` | 8 | final chunks (fact) |
| `package.max_chunks_summary` | 12 | summary questions |
| `package.max_tokens` | 3000 | evidence token budget |
| `balance.max_share` | 0.6 | per-document cap for comparisons |
| `balance.fanout_max_docs` | 6 | max scope size for fan-out |
| `classifier.context_turns` | 3 | follow-up context |
| `classifier.max_question_chars` | 2000 | input cap |
| `retrieval.*_timeout_ms` | to set | db, graph, llm, rerank |
| `llm.provider` | n/a | swappable, owned per F5 |
| Env: Postgres, Neo4j, model endpoints | n/a | connection settings; **no secrets in the repo** |
| Feature flag: graph channel | on | lets `retrieval_only` be forced globally during evaluation |

---

## 22. DEPLOYMENT

- **Migrations:** none from Epic 6. Requires Epic 0's schema, HNSW and GIN indexes, and Neo4j indexes from `04_...` §4.
- **Service:** ships inside `ai-service` (Docker Compose, `03_...` §6). No new container.
- **Startup dependencies:** Postgres+pgvector, Neo4j, model files for embeddings/reranker (local), LLM provider reachable.
- **Health:** the `/health` endpoint (Story 0.1 AC2) should reflect Postgres and Neo4j reachability (ASSUMPTION).
- **Backward compatibility:** the `EvidencePackage` schema is a shared contract with Epic 7; version it from day one and change additively only.
- **Rollback:** stateless; redeploy the previous image.

---

## 23. IMPLEMENTATION ORDER

1. Publish `retrieval/schemas` and golden EvidencePackage sample (unblocks Epic 7 on Day 1–2).
2. Build shared fixtures (two workspaces, graph, chunks).
3. Config module, adapter interfaces (LLM Protocol, Reranker).
4. `ScopeGuard` and repository.
5. Story 6.1 classifier and rewriter.
6. Vector channel, keyword channel.
7. Graph scope filter (pure), then graph retriever and fact resolver (dependency on Epic 5 edge provenance, coordinate early).
8. Merger, mode switch, `RetrievalService`.
9. Isolation test suite (before moving on).
10. Story 6.3: reranker, balancer, package builder.
11. Observability and error handling polish.
12. Checkpoint 1 follow-through (Day 5): point at real Epic 4/5 data.
13. Checkpoint 2 (Day 8): hand real package to Epic 7.
14. Tuning support for Epic 9 (Checkpoint 3).

Dependencies: 1 unblocks Epic 7; 7 depends on Epic 5's edge provenance; 10 depends on 8.

---

## 24. CODING AGENT TASK BREAKDOWN

**TASK-001 — Module skeleton and config.** Depends: none. Files: `retrieval/config`, package layout. Implement: config object with §21 keys, typed, env-overridable. Tests: config load defaults/overrides.

**TASK-002 — Schemas and golden package.** Depends: 001. Files: `retrieval/schemas`, `tests/fixtures/retrieval/golden_package`. Implement: `RetrievalRequest`, `EvidencePackage`, enums (§7). Publish sample for Epic 7. Tests: schema validation, enum spellings.

**TASK-003 — Fixtures.** Depends: 002. Implement the §19 fixture (Postgres seed + Neo4j seed). Tests: fixture loads idempotently; isolation invariants hold in raw data.

**TASK-004 — Repository and ScopeGuard.** Depends: 001, 003. Implement scoped read-only queries; guard validation and READY filter. Tests: T6.2-07, 08, 13.

**TASK-005 — IdentifierExtractor and QuestionClassifier.** Depends: 002. Implement Story 6.1, LLM Protocol, fallback, follow-up context, single-document downgrade. Tests: T6.1-01..06.

**TASK-006 — VectorSearcher.** Depends: 004. Implement embedding call, cosine query, scoping, section join. Tests: T6.2-01, 05, 06.

**TASK-007 — KeywordSearcher.** Depends: 004. Implement FTS with the index's own configuration and verbatim-term handling. Tests: T6.2-02.

**TASK-008 — GraphScopeFilter.** Depends: 002. Pure admission function. Tests: truth table.

**TASK-009 — GraphRetriever + GraphFactResolver.** Depends: 003, 004, 008; **coordinate Epic 5 edge provenance (F3/F4)**. Implement seeding, bounded traversal, resolution, discards. Tests: T6.2-03, 09, 10, 10b, 12.

**TASK-010 — Contradiction integration.** Depends: 009, Epic 5 Story 5.4. Tests: T6.2-15.

**TASK-011 — CandidateMerger.** Depends: 006, 007, 009. RRF, dedupe, cap. Tests: T6.2-04.

**TASK-012 — RetrievalService (pre-rerank) with mode switch.** Depends: 005, 006–011. Concurrency, timeouts, degradation. Tests: T6.2-11, negative tests.

**TASK-013 — Isolation regression suite.** Depends: 012. Consolidate T6.2-05..10b, 12, 15 as a permanent CI job.

**TASK-014 — Reranker adapter.** Depends: 001. Interface, BGE implementation, fake, fallback. Tests: T6.3-01, 02.

**TASK-015 — EvidenceBalancer.** Depends: 014, 004. Quotas, share cap, fan-out. Tests: T6.3-03..05.

**TASK-016 — EvidencePackageBuilder.** Depends: 015. Token budget, citation metadata, diagnostics, scope re-assertion. Tests: T6.3-06, 07.

**TASK-017 — Full pipeline wiring.** Depends: 012, 016. Stage 6–9 of `retrieve`. Regression snapshot.

**TASK-018 — Observability.** Depends: 017. Logging fields (§18), no content at INFO.

**TASK-019 — Checkpoint wiring.** Depends: 017, Epics 4 and 5 real. Swap fixtures for real data; run a real document end to end; confirm Epic 7 consumes the package.

**TASK-020 — Evaluation hooks.** Depends: 019. Ensure `answerMode` works through Epic 8/9; confirm parameters tunable without code changes.

---

## 25. EPIC DEFINITION OF DONE

- [ ] Stories 6.1, 6.2, 6.3 implemented
- [ ] All 8 ACs implemented and tested
- [ ] BR-001 to BR-015 implemented
- [ ] No database changes required (confirmed read-only)
- [ ] Internal contract (§7) published and aligned with Epic 7 and Epic 8
- [ ] No events (none required)
- [ ] Integrations (Postgres, Neo4j, LLM, embedding, reranker) implemented with timeouts
- [ ] Security: four-layer scope enforcement verified
- [ ] Error handling and degradation paths verified
- [ ] Logging implemented, no content at INFO
- [ ] Audit: confirmed out of scope (Epic 10/8)
- [ ] Unit, integration, negative and E2E tests passing
- [ ] **Explicit two-workspace isolation test passing in CI**
- [ ] Module-scope graph-leak test (Story 6.2 sample) passing
- [ ] Both answer modes verified via Epic 9 at Checkpoint 3
- [ ] Cross-epic dependencies D1–D8 verified
- [ ] Architecture and ERD compliance verified
- [ ] No critical open questions remain (see §26)

---

## 26. OPEN QUESTIONS

1. **F6:** on Neo4j failure in `retrieval_plus_graph` mode, degrade (flag) or fail? Recommend fail hard for evaluation runs and degrade-with-flag in live chat.
2. Does Story 6.1 rewriting use chat history for follow-ups? Default: yes, last 3 turns.
3. Who calls the scope-bounded contradiction query: Epic 6 (into the package) or Epic 7 (Story 7.2)? Avoid a double call.
4. Should low rerank scores be filtered out with a minimum threshold, or should everything go to Epic 7 and let verification decide "not found"?
5. Which text-search configuration (language) does Epic 4's GIN index use?
6. Should extracted fields (`EXTRACTED_FIELD`) ever be evidence, or only chunks and graph facts? Current plan: chunks and graph facts only (BR-011).
7. Should an internal debug retrieval endpoint exist for tuning?
8. How does the FE learn that a selected document was excluded for not being `READY`?

## 27. ASSUMPTIONS

A1. Epic 6 runs in the AI Service and is invoked in-process (§7).
A2. Internal request/response schema as in §7.
A3. Only `READY`, non-archived documents are retrievable (F8).
A4. RRF used to combine channel ranks before reranking.
A5. Default numeric parameters in §21.
A6. Graph seeds come from entity-name matching and, for comparisons, from in-scope `:Document` nodes; max 2 hops.
A7. `cross-document` questions are balanced like `comparison`.
A8. LLM classification runs at temperature 0.
A9. The AI Service is reachable only on the internal network.
A10. Endpoints and configuration key names are proposals, not documented names.
A11. A single-document scope downgrades `comparison` to `fact`.

## 28. DESIGN GAPS

- **F1** No internal API definition, and `05_api_specs.md` was not supplied.
- **F2** No story implements the retrieval-only vs retrieval+graph switch; Epic 7 must also honour it.
- **F3/F4** Edge-level provenance (`document_id`, `source_chunk_id`) is not in the graph schema; needed for AC4.
- **F5** No owner for the shared LLM interface.
- **F7** Repository structure undocumented.
- **F8** Soft-delete representation undefined.
- No schema for the evidence package (added as TASK-002).
- Graph seed selection (how question text maps to graph nodes) is unspecified.
- `07_realistic_timeline_and_task_plan.md` was not supplied, so pairing and sequencing was derived from `06_...` and `08_...` only.

## 29. RISKS

| Risk | Impact | Mitigation |
|---|---|---|
| Graph traversal leaks across module boundary via shared entity | **Critical** (silent wrong answers) | Per-hop admission, chunk-resolution guard, permanent regression suite |
| Epic 5 does not stamp edge provenance | High | Raise on Day 1; fallback: derive scope by requiring an in-scope `:Document` node on every path |
| Reranker too slow without GPU | Medium | Lower `rerank.input_size`; adapter allows a hosted or lighter model |
| Embedding-model mismatch between Epic 4 and Epic 6 | High | Single shared embedding client (Epic 4) |
| Epic 6 over-runs (raw capacity already over by about 2.25 days, `06_...` §3) | Medium | Cut order: fan-out fallback, summary-specific budget, follow-up context; **never** the isolation work |
| Mode switch omitted, evaluation impossible | High | Treated as P0 in Story 6.2 (BR-010) |
| Half-indexed documents produce inconsistent chunk/graph evidence | Medium | READY filter, fact-resolution guard |
| Balancing fan-out adds latency | Low | Only for small scopes and only when a document is missing |

---

## FINAL CONSISTENCY CHECK (Epic 6 scope)

1. BRD requirements §8.3, §8.4, §8.5, §8.6, §9, §10 map to Epic 6 (§2). §8.6 mapped via gap F2.
2. Epic 6 maps to Stories 6.1–6.3.
3. Every story maps to ACs (2 + 4 + 2 = 8), all quoted verbatim.
4. Every AC maps to an implementation section and at least one test (§19).
5. Implementation maps to `03_architecture.md` §4.1/§4.2 and `08_...` §3.
6. Every database operation maps to ER tables; no new tables. Neo4j use maps to `04_...` §3, with the edge-provenance amendment flagged.
7. API ownership: no external API (F1).
8. Events: none.
9. Cross-epic dependencies D1–D8 documented.
10. Shared functionality: LLM interface ownership flagged (F5); reranker owned here; embedding owned by Epic 4.
11. Status definitions: only consumes Epic 1's `processing_status` (no conflict).
12. Naming CONFLICT on question-type enum resolved (§11).

**TRACEABILITY GAP:** BRD §8.6 has no Epic 6 AC (see §2).
**TRACEABILITY GAP:** the evidence package has no story (see §2).

## CODING AGENT READINESS REVIEW

If given only this plan plus the repository, a coding agent can answer: what to build (§3, §14), why (§1), where (logical modules §13; **real paths require Story 0.1's skeleton**), how it behaves (§3, §4), which components to reuse (§12), which database entities (§6), which APIs (§7, internal only), which rules (§8), which errors (§16), which security rules (§17), which epics are involved (§11), what order (§23, §24), how it is tested (§19), and when it is done (§25).

Answer to the readiness question: **YES, conditional on** resolving F3/F4 (edge provenance with Epic 5), F2 (mode switch acknowledged by Epic 7/9), and F1/F7 (internal contract and repo paths) before Day 1 coding begins.
