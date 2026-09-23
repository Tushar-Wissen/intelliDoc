# 05_EPIC_04_SEARCH_INDEXING_IMPLEMENTATION_PLAN.md
### Epic 4 — Search Indexing

---
## ⚠️ IMPLEMENTATION STATUS — READ BEFORE MAKING ANY CHANGE

**Stories 4.1 and 4.2, exactly as originally planned, are ALREADY IMPLEMENTED.** Do not rewrite, refactor, or "fix" the existing embedding generation code, the existing GIN/`simple`-tsvector migration, or the existing `keyword_search()` function — they are working, deployed code, not a draft.

**This revision adds one NEW, ADDITIVE story (4.2b) on top of the existing implementation** — it does not replace anything. The original `simple`-tsvector keyword search stays exactly as built and keeps handling natural-language queries. Story 4.2b adds a **second, separate** index and a **new** function for exact-identifier queries, plus a small **new** routing function that decides which of the two existing/new search paths to call. No existing file listed in §13 as `✅ IMPLEMENTED` should be edited by this change — only new files are added, and the one integration point (a dispatch call in whatever already calls `keyword_search()`) is a small addition, not a rewrite.

Every section below is tagged `✅ IMPLEMENTED` (already built, do not touch) or `🆕 NEW` (this revision's additive work) so this can be read top-to-bottom without ambiguity.

---


> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `06_backend_epics_and_stories.md`. Depends on Epic 2 (chunks). No public API — internal only, consumed by Epic 6. **One significant DESIGN GAP found by cross-checking the ingestion diagram against this epic's actual requirement — flagged prominently below, not glossed over.**

---

## 1. Epic Overview

**Epic ID:** 4
**Epic Name:** Search Indexing
**Business Objective:** Make every chunk findable two ways — by meaning (vector similarity) and by exact text (keyword/phrase) — so Epic 6's hybrid retrieval has both to draw on.
**Business Problem:** Semantic search alone misses exact identifiers (contract numbers, precise dollar amounts); keyword search alone misses conceptually-related passages worded differently. BRD's hybrid RAG approach needs both.
**Scope:** Embedding generation + pgvector storage, full-text/keyword index.
**Out of Scope:** Reranking (that's Epic 6 Story 6.3, not this epic — a boundary worth stating explicitly since "search" could be misread as including ranking logic). Retrieval/merge logic itself (Epic 6).
**Actors:** None human-facing — pure background processing, no correction/review UI exists for indexing (unlike Epic 3's fields).
**Dependencies:** Epic 2 (chunk rows to embed/index); Epic 0 (pgvector extension, schema).

In plain language: this epic makes every passage in every document searchable two different ways before anyone ever asks a question.

---

## 2. Requirement Traceability

| BRD Requirement | Story | Component |
|---|---|---|
| Implicit in BRD §8.4/§10.1's hybrid RAG description ("searches using vector similarity... keyword search") — no epic-4-specific BRD "shall" line exists; this epic exists to enable BRD §8.4's retrieval requirement, same pattern as Epic 2 | 4.1, 4.2 | `indexing.py` |

Like Epic 2, this epic has no direct BRD line item of its own — it's enabling infrastructure for BRD §8.4 (grounded chat answers), not a gap, an expected pattern for infrastructure-layer epics.

---

## 3. Story-by-Story Implementation Plan

### Story 4.1 — Embedding generation & vector storage `✅ IMPLEMENTED — DO NOT MODIFY`

**Business Requirement:** Enable semantic (meaning-based) search across chunks. Source: `03_...md` §10.1/§7 (BGE-M3 embeddings, chosen tech).

**Acceptance Criteria** (verbatim):
- AC1. Every chunk gets an embedding generated and stored in `document_chunk.embedding`.
- AC2. A vector similarity query returns results ordered by cosine distance.

**Technical Interpretation:** AC1 requires this story to **resolve an assumption left open in Epic 0's plan** — the `vector` column's dimension size wasn't pinned anywhere in source docs. BGE-M3 (the chosen embedding model, `03_...md` §7) produces **1024-dimensional dense embeddings** as its standard output — this is a technical fact about the named tool, not an invented requirement, and is necessary to declare `document_chunk.embedding vector(1024)` correctly. **If Epic 0's migration V10 was written before this was resolved, it needs to specify `vector(1024)` explicitly — cross-reference `01_EPIC_00_...md` §27.** AC2's "cosine distance" is an explicit, unambiguous decision already made at the story level (resolves the vaguer "HNSW (or IVFFlat)" wording in `04_...md` §4, which didn't specify a distance metric) — the HNSW index must be built with `vector_cosine_ops`, and queries use pgvector's `<=>` cosine-distance operator.

**Implementation:** `indexing.generate_embeddings(document_id) -> None` — loads all chunks for the document with `embedding IS NULL`, batches them through the BGE-M3 model, writes embeddings back via `UPDATE` (this is the cross-epic shared-row write flagged in Epic 2's plan §11 — Epic 2 creates the row, this story fills in the one column it left null).

**Components:** `pipeline/indexing.py`.

**Database:** `DOCUMENT_CHUNK` — **UPDATE only** (`embedding` column), no new rows.

**APIs:** None — internal function.

**Events:** None.

**Business Rules:** BR-401 (see §8).

**Validation:** A chunk with empty/whitespace-only text should not be embedded (wasted computation, meaningless vector) — **not explicitly stated in source docs**, an engineering-judgement default, flagged as ASSUMPTION §27.

**Error Handling:** Embedding model failure (OOM, timeout) on a batch → retry the batch once, then fail the document (same resilience pattern as Epic 3's LLM calls, for consistency).

**Security:** No new surface.

**Audit/Logging:** Embedding count + timing logged per document.

**Testing:** Per `06_...md`'s sample: query the top 5 chunks most similar to "termination notice period" → results ranked by similarity, actual termination clause chunk in top 5.

---

### Story 4.2 — Full-text / keyword index `✅ IMPLEMENTED — DO NOT MODIFY`

> **Status note:** built exactly as described below, using the `simple` text-search config. Subsequent analysis (this revision) found that `simple` alone does not fully satisfy AC2's "matched precisely" requirement for hyphenated alphanumeric identifiers like `"SA-2026-014"` — not because `simple` vs `english` was the wrong call, but because PostgreSQL's **parser** (not the dictionary that `simple`/`english` controls) splits such strings into separate tokens before either config ever sees them. **This existing implementation is not being changed to fix that** — it correctly handles natural-language keyword/phrase search, which is its job. The precision gap is closed by a **new, separate** index and function in **Story 4.2b** below, not by editing this one.

**Acceptance Criteria** (verbatim):
- AC1. GIN full-text index on `chunk_text` supports keyword and phrase search.
- AC2. Exact identifiers (contract numbers, dollar amounts) are matched precisely, not just semantically.

**Technical Interpretation:** A standard PostgreSQL GIN index built on `to_tsvector('english', chunk_text)` applies English-language stemming and stop-word removal, which is well-suited for natural-language phrase search but is **not reliable for exact alphanumeric identifiers** like `"SA-2026-014"` — the `english` text-search configuration can tokenize hyphenated/numeric strings in ways that break exact matching (this is a known PostgreSQL full-text-search limitation, not specific to this project). **As built:** the `simple` config was used instead of `english` for exactly this reason, which correctly removes the *stemming/dictionary* half of the risk. **What was not yet resolved when this was built** (see Story 4.2b): even `simple` doesn't control PostgreSQL's *parser* stage, which independently tends to decompose a hyphenated alphanumeric string into separate lexemes (`sa`, `2026`, `014`) regardless of dictionary config — so AC2's "precisely" bar needs a second mechanism, not a different tsvector config.

**Implementation:** A Flyway migration adding a GIN index on `to_tsvector('simple', chunk_text)` — **this migration was not included in Epic 0's Story 0.2 migration list**, so it was added here as a new migration.

**Components:** Flyway migration; `indexing.keyword_search(query, document_ids) -> List[Chunk]` query function.

**Database:** Index on `DOCUMENT_CHUNK.chunk_text` (no new columns).

**APIs:** None — internal function, consumed by Epic 6.

**Testing:** Per `06_...md`'s sample: search for the exact reference number `"SA-2026-014"` → the chunk containing it is returned; semantically similar but non-matching chunks are not top-ranked ahead of it. **As-built status:** this test passes on the "returned" half by virtue of token co-occurrence, but does not yet give a genuine exact-match precision signal — Story 4.2b closes that gap.

---

### Story 4.2b — Trigram index for exact identifier matching `🆕 NEW — TO IMPLEMENT`

**Business Requirement:** Close the precision gap identified above in Story 4.2's AC2 — a query-shape router directs identifier-looking queries to a trigram-based exact/substring match instead of (not in place of, *in addition to*) the tsvector path.

**Why this is additive, not corrective-of-existing-code:** the existing `simple`-tsvector GIN index and `keyword_search()` function are architecturally correct for what they do — relevance-ranked natural-language search. Trigram matching is a different tool for a different job — literal substring/similarity matching on a code-like string. Both are needed; neither replaces the other. This mirrors the same reasoning already applied elsewhere in this project (e.g., three separate representations of a document, kept separate rather than collapsed into one).

**Acceptance Criteria (new, added by this revision):**
- AC1. `pg_trgm` extension enabled; a GIN (or GiST) trigram index exists on `document_chunk.chunk_text`.
- AC2. A lightweight, deterministic heuristic (`is_identifier_like(query_text)`) classifies a query string as "identifier-shaped" (contains a digit, contains a hyphen or is a single alphanumeric token with no dictionary words, etc. — exact rule TBD, see §26) or "natural language."
- AC3. Identifier-shaped queries are routed to a trigram similarity/substring query instead of (or in addition to, for recall) the existing `keyword_search()`.
- AC4. `SELECT to_tsvector('simple', 'SA-2026-014');` is run against the live dev database once, and its actual lexeme output is recorded in this document (§26), replacing the current "likely decomposes into separate tokens" language with a confirmed fact — this two-minute verification was flagged as outstanding in the prior review and should happen before this story is considered done.

**Implementation:** New Flyway migration enabling `pg_trgm` and creating the trigram index; new `indexing.trigram_search(query_text, document_ids, k)` function; new `indexing.is_identifier_like(query_text) -> bool` routing helper; a small dispatch addition at whatever call site currently invokes `keyword_search()` directly (likely inside Epic 6's retrieval code, once that exists) so it calls `trigram_search()` instead when `is_identifier_like()` is true.

**Components:** New migration file (see §13), new functions in `indexing.py` — **appended to the existing file, not replacing its current contents.**

**Database:** New index only — no changes to `document_chunk`'s existing columns or the existing GIN tsvector index.

**Error Handling:** A trigram query on a very short string (1-2 characters) can be slow/low-precision — a minimum-length guard on `is_identifier_like()` is a reasonable addition (ASSUMPTION §27, not specified).

**Testing:** Re-run the exact identifier test from Story 4.2 — now expect the trigram path to return the match with a genuine similarity-based precision signal, not token co-occurrence.

---

## 4. End-to-End Flow

```
orchestrator (Epic 3 hand-off, EXTRACTING complete)
 ↓ set document.processing_status = INDEXING
 ↓ indexing.generate_embeddings(document_id)     — Story 4.1
 ↓ (full-text index already exists at the DB level — no per-document action needed for 4.2;
    the GIN index applies automatically to every row as it's written)
 ↓ (orchestrator also runs Epic 5's graph build here — see §11 for the DESIGN GAP on how these combine)
 ↓ set document.processing_status = READY   (see §11 — corrected gating condition)
```

**Failure branches:** embedding batch failure → retry once → `FAILED`, consistent with Epic 2/3's pattern. No failure mode exists for Story 4.2 at document-processing time, since the GIN index is a standing DB structure, not a per-document operation — its "failure mode" would only be an index-creation failure at migration time, a deployment concern (§22), not a per-document runtime concern.

---

## 5. Architecture Mapping

| Component | Responsibility | Input | Output | Dependencies |
|---|---|---|---|---|
| `indexing.py` (embedding fn) | Generate + store embeddings | `document_chunk` rows (text) | Updated `embedding` column | BGE-M3 model |
| GIN index (DB structure) | Enable keyword/phrase search | `chunk_text` column | Queryable via `to_tsvector`/`to_tsquery` | None (standing index) |

Maps to `03_architecture.md` §2's implicit indexing responsibility inside `AISvc` (not a separately named box in the high-level diagram — it's folded into the `PARSE`/`EXTRACT` boxes' surrounding data flow rather than given its own component name there, worth noting as a minor diagram granularity gap, not a conflict).

---

## 6. Database Implementation

**`DOCUMENT_CHUNK.embedding`** — `vector(1024)` (dimension resolved in §3, cross-references Epic 0 §27). HNSW index, `vector_cosine_ops` (resolves the "HNSW or IVFFlat" ambiguity in `04_...md` §4 to a concrete choice, per Story 4.1 AC2's explicit cosine requirement).

**`DOCUMENT_CHUNK.chunk_text`** — new GIN index on `to_tsvector('simple', chunk_text)` (§3 Story 4.2's resolution, using `simple` not `english` config — a deviation from what a naive reading of `04_...md` §4 might suggest, justified above).

**UPDATE operations:** `document_chunk.embedding`, one document's worth of chunks at a time, keyed by `document_id IS NOT NULL AND embedding IS NULL` — this predicate is also useful as a manual recovery query if a batch partially fails.

**READ operations (used by Epic 6, documented here since this epic owns the query patterns):**

`✅ IMPLEMENTED — DO NOT MODIFY these two queries:`
```sql
-- Vector similarity (cosine)
SELECT * FROM document_chunk
WHERE document_id = ANY(:resolved_document_ids)
ORDER BY embedding <=> :query_embedding
LIMIT :k;

-- Keyword/phrase (simple config)
SELECT * FROM document_chunk
WHERE document_id = ANY(:resolved_document_ids)
  AND to_tsvector('simple', chunk_text) @@ websearch_to_tsquery('simple', :query_text)
ORDER BY ts_rank(to_tsvector('simple', chunk_text), websearch_to_tsquery('simple', :query_text)) DESC
LIMIT :k;
```

`🆕 NEW — add this query, do not merge it into the one above:`
```sql
-- Trigram exact/similarity match (Story 4.2b) — enable pg_trgm extension first
SELECT *, similarity(chunk_text, :query_text) AS trgm_score
FROM document_chunk
WHERE document_id = ANY(:resolved_document_ids)
  AND chunk_text % :query_text  -- pg_trgm's similarity operator
ORDER BY trgm_score DESC
LIMIT :k;
```
These are translations of already-established DB decisions (`04_...md` §4's indexing plan, plus this revision's identifier-precision addition) into concrete query shape, not new information invented from nothing.

---

## 7. API Implementation

**None.** Same situation as Epic 2 — no public REST endpoints. `vector_search()` and `keyword_search()` `✅ IMPLEMENTED` are called directly by Epic 6's retrieval code. `trigram_search()` `🆕 NEW` will be called the same way, via the new routing function, once Epic 6 exists to call it.

---

## 8. Business Rules

**BR-401:** Every non-empty chunk must have an embedding before the document can be considered fully indexed. Source: derived from BRD §8.4's retrieval requirement (a chunk without an embedding is invisible to vector search, which would silently degrade answer quality — not an explicit BRD line item, but a direct logical consequence). Enforced in: `indexing.py`'s completion check before allowing the orchestrator to proceed past the `INDEXING` stage (see §11's gating fix).

---

## 9. State Machines

This epic **should** own part of the `EXTRACTING→INDEXING→READY` transition, but per §11's DESIGN GAP, the *current* diagram doesn't actually gate `READY` on this epic's completion — flagged there as something to fix, not something this section pretends is already correctly wired.

---

## 10. Events and Integrations

None.

---

## 11. Cross-Epic Dependencies — including the DESIGN GAP found here

| Dependency | Dependent Epic | Providing Epic | Contract | Status |
|---|---|---|---|---|
| `document_chunk` rows (text, no embedding yet) | Epic 4 | Epic 2 | Table rows | `✅` |
| pgvector query function | Epic 6 | Epic 4 | `indexing.vector_search()`, `indexing.keyword_search()` | `✅ IMPLEMENTED` |
| Trigram query + routing function | Epic 6 | Epic 4 | `indexing.trigram_search()`, `indexing.is_identifier_like()` | `🆕 NEW` — Epic 6's retrieval plan should call the routing function, not `keyword_search()` directly, once this exists |

**DESIGN GAP (significant, found by cross-checking `03_architecture.md` §3.2's diagram against this epic's actual requirement):** in that diagram, the embedding/indexing branch (nodes `L → M → N`) does **not** have an arrow into `R` ("Mark document READY") — only the overview/summary branch (`J`), the field-storage branch (`Q`), and the graph branch (`P`) do. Taken literally, this means a document could be marked `READY` — and therefore selectable for chat — **before its embeddings exist**, which would mean Epic 6's vector search silently finds nothing for that document even though the UI shows it as ready. This directly contradicts BRD §8.4's grounding requirement. **This plan corrects the gating condition**: `document.processing_status` should only transition to `READY` after **all** of {overview/summary (Epic 3), fields (Epic 3), embeddings (Epic 4), graph (Epic 5)} have completed — not the 3-of-4 the diagram currently shows. **Recommend updating `03_architecture.md` §3.2's diagram** to add `L→R` (or `M→R`) once this is confirmed, so the diagram matches the actual required behavior rather than contradicting it.

**Full-text indexing (`N`)** doesn't need a completion gate the same way — it's a standing index that applies automatically as rows are written, not a per-document async step with its own success/failure state, so it was never really part of the "wait for completion" set to begin with; only the embedding branch's *absence* from the gate is the actual bug.

---

## 12. Shared Components

Consumes: pipeline orchestrator (Epic 2), chunk rows (Epic 2). Owns: the two query functions Epic 6 depends on (documented as a cross-epic dependency above).

---

## 13. File / Module Implementation Plan

**`✅ ALREADY EXIST — DO NOT MODIFY:**
```
/ai-service/app/pipeline/
  indexing.py — contains generate_embeddings(document_id), vector_search(...), keyword_search(...)
                 ⚠️ this file gets NEW functions APPENDED to it in this revision (see below) —
                 do not touch the three functions already in it.
  embedding_model.py — BGE-M3 wrapper.

/core-api/src/main/resources/db/migration/
  V18__add_fulltext_gin_index.sql

/ai-service/tests/pipeline/
  test_indexing.py — existing tests for the three functions above stay as-is;
                       new tests are ADDED to this file for the new functions, not replacing old ones.
```

**`🆕 NEW — TO CREATE (this revision only):`**
```
/core-api/src/main/resources/db/migration/
  V19__enable_pg_trgm_and_add_trigram_index.sql — new migration, next number after V18.
    Must NOT be inserted between existing migrations or renumbered — Flyway migrations
    are append-only once applied; this must be a new, higher-numbered file.

/ai-service/app/pipeline/indexing.py (APPEND to this existing file, do not recreate it):
  + trigram_search(query_text, document_ids, k) -> List[Chunk]
  + is_identifier_like(query_text: str) -> bool

/ai-service/tests/pipeline/test_indexing.py (APPEND new test cases, do not replace the file):
  + tests for trigram_search() and is_identifier_like()
```

**MODIFY:** `ai-service/app/pipeline/orchestrator.py` — `⚠️ this modification is STILL PENDING regardless of Story 4.1/4.2's implemented status` — add the `generate_embeddings()` call and the corrected `READY` gating logic from §11 if not already present. If the orchestrator already calls `generate_embeddings()` but hasn't yet been fixed to gate `READY` on it, that specific gating fix is still outstanding and is not part of what "implemented as-is" covers, since §11 was identified in this same review pass.

---

## 14. Method-Level Implementation Details

`✅ IMPLEMENTED — DO NOT MODIFY the three functions below:`

### `indexing.generate_embeddings(document_id: UUID) -> None`
1. `chunks = query chunks WHERE document_id = :id AND embedding IS NULL AND chunk_text != ''`.
2. Batch chunks (batch size — **ASSUMPTION §27**, not specified in source docs; a reasonable default like 32 per batch, tunable).
3. For each batch: `embeddings = bge_m3_model.encode(batch_texts)`.
4. `UPDATE document_chunk SET embedding = :vec WHERE id = :chunk_id` per chunk.
5. On batch failure: retry once, then raise (caught by orchestrator → `FAILED`).

### `indexing.vector_search(query_embedding, document_ids, k) -> List[Chunk]`
Executes the cosine-distance query from §6, scoped to `document_ids` (the caller — Epic 6 — is responsible for having already resolved workspace/module/document scope before calling this; this function does not itself enforce workspace isolation, it trusts its caller's `document_ids` list, consistent with how the scope-bounding responsibility was assigned in earlier project decisions).

### `indexing.keyword_search(query_text, document_ids, k) -> List[Chunk]`
Executes the `websearch_to_tsquery`/GIN query from §6, same scoping trust model.

---

`🆕 NEW — TO IMPLEMENT, appended to the same file, does not touch the three functions above:`

### `indexing.is_identifier_like(query_text: str) -> bool`
Purpose: routing heuristic deciding whether a query string looks like a code/reference number rather than natural language.
Logic (exact rule TBD — see §26): e.g. contains at least one digit AND (contains a hyphen OR is a single token with no whitespace) AND is short (under some length threshold, guards against slow trigram queries on long strings per §3 Story 4.2b's error-handling note).
Output: `True`/`False`. Called by whatever code invokes search (Epic 6, once it exists) to choose between `keyword_search()` and `trigram_search()` — **this function does not itself call either search function**, it's a pure classifier.

### `indexing.trigram_search(query_text, document_ids, k) -> List[Chunk]`
Purpose: exact/similarity-based matching for identifier-shaped queries, using `pg_trgm`.
1. Execute the `%` similarity query from §6 (new SQL block), scoped to `document_ids` (same trust model as the two existing functions).
2. Return results ordered by `similarity()` score descending.
Exceptions: none beyond standard DB-error propagation — no special handling needed beyond what the two existing functions already do.

---

## 15. Transaction and Consistency

Embedding updates are per-chunk, independent — no multi-row transaction needed. The GIN index and the new trigram index are both maintained automatically by Postgres on every `INSERT`/`UPDATE` to `chunk_text` — no application-level consistency logic needed beyond the migrations that create them.

---

## 16. Error Handling

| Condition | Result |
|---|---|
| Embedding batch failure | Retry once, then `FAILED` |
| Empty chunk text | Skipped, not embedded (ASSUMPTION §27) |
| Malformed search query reaching `keyword_search` | Tolerated via `websearch_to_tsquery` rather than crashing (ASSUMPTION §27) |

---

## 17. Security

No public surface. `vector_search`/`keyword_search` trust their caller's `document_ids` scope (Epic 6's responsibility to have resolved correctly, per the workspace-isolation discipline established earlier in this project) — this epic does not re-derive or re-check scope itself.

---

## 18. Observability

Embedding generation timing/count logged per document — a useful signal if the evaluation harness (Epic 9) later shows retrieval quality issues traceable to slow/incomplete embedding coverage.

---

## 19. Test Implementation Plan

`✅ IMPLEMENTED — these tests already exist, do not modify:`

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 4.1 | AC1 | Generate embeddings for a fixture document | Integration | All non-empty chunks have non-null `embedding` |
| 4.1 | AC2 | Vector query for "termination notice period" | Integration | Termination clause chunk in top 5, ranked by cosine distance |
| 4.2 | AC1 | Keyword search for a common phrase | Integration | Relevant chunks returned |
| 4.2 | AC2 | Search for exact reference number `"SA-2026-014"` | Integration | Chunk returned via token co-occurrence (known-imprecise, superseded by 4.2b's test below) |
| — | — | Query embeddings before Story 4.1 has run | Negative | Vector query on unembedded chunks returns nothing for that document (expected — this is why the §11 gating fix matters) |

`🆕 NEW — add these, do not remove any row above:`

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 4.2b | AC4 | `SELECT to_tsvector('simple', 'SA-2026-014');` run manually against dev DB | Verification (one-time, not automated) | Confirms actual lexeme decomposition — record result in §26 |
| 4.2b | AC1 | `pg_trgm` extension check post-migration | DB | Extension enabled, index exists |
| 4.2b | AC2 | `is_identifier_like()` unit tests | Unit | Correctly classifies `"SA-2026-014"` as identifier-like, "termination notice period" as not |
| 4.2b | AC3 | Search for `"SA-2026-014"` via `trigram_search()` | Integration | Exact-match chunk returned with a genuine similarity score, not token co-occurrence — this is the corrected version of the existing 4.2/AC2 test above |

---

## 20. Non-Functional Requirements

Performance: embedding generation contributes to overall ingestion time; BRD §9's speed target is for *chat*, not ingestion, so no hard number applies here directly, same as Epic 2.

---

## 21. Configuration

| Variable | Purpose | Status |
|---|---|---|
| `EMBEDDING_BATCH_SIZE` | Tunable batch size for Story 4.1 | `✅` |
| `EMBEDDING_MODEL_NAME` | `BAAI/bge-m3` (or equivalent, per `03_...md` §7's "or benchmarked equivalent" allowance) | `✅` |
| `IDENTIFIER_QUERY_MIN_LENGTH` | Minimum length guard for `is_identifier_like()`, per §3 Story 4.2b's error-handling note | `🆕 NEW` |

---

## 22. Deployment

No new infrastructure beyond enabling the `pg_trgm` extension (a standard Postgres contrib extension, no new service required — same container, same instance as the existing `pgvector` extension). The embedding model needs to be loaded into the `ai-service` container/process — if run on CPU (no GPU, per BRD §15's open question), embedding generation latency should be sanity-checked against the demo timeline; this is the same GPU-availability open item already tracked at the BRD level, now concretely relevant to this epic's runtime characteristics.

---

## 23. Implementation Order

`✅ Steps 1–4 already done:`
1. `V18__add_fulltext_gin_index.sql` migration (Story 4.2).
2. `embedding_model.py` wrapper.
3. `indexing.generate_embeddings()` — Story 4.1.
4. `indexing.vector_search()`/`keyword_search()`.

`🆕 NEW steps, in order:`
5. `SELECT to_tsvector('simple', 'SA-2026-014');` verification query (§26) — do this first, it's free and confirms the reasoning before writing any new code.
6. `V19__enable_pg_trgm_and_add_trigram_index.sql` migration.
7. `is_identifier_like()` + `trigram_search()`, appended to the existing `indexing.py`.
8. Wire the corrected `READY` gating logic (§11) into the orchestrator, if not already done — this specifically needs Epic 5's completion signal too, so this step is properly a **Checkpoint 1 wiring task shared with Epic 5**, not something this epic can fully close alone.
9. Update Epic 6's retrieval code (once it exists) to call `is_identifier_like()` → route to `trigram_search()` or `keyword_search()` accordingly.

---

## 24. Coding Agent Task Breakdown

`✅ DONE — already implemented, listed for traceability only, do not re-execute:`
**TASK-401** Full-text GIN index migration. **TASK-402** BGE-M3 model wrapper. **TASK-403** `generate_embeddings()`. **TASK-404** `vector_search()`, `keyword_search()` query functions.

`🆕 NEW — TO EXECUTE:`
**TASK-407** Title: Manually verify `to_tsvector('simple', 'SA-2026-014')` output. Depends on: None (can run against the existing dev DB right now). Acceptance: result recorded in §26, replacing the "likely" language with a confirmed fact.
**TASK-408** Title: `pg_trgm` migration (`V19`). Depends on: TASK-407 (confirms the need before building). Files: `V19__enable_pg_trgm_and_add_trigram_index.sql`. Acceptance: Story 4.2b AC1.
**TASK-409** Title: `is_identifier_like()` + `trigram_search()`, appended to `indexing.py`. Depends on: TASK-408. Acceptance: Story 4.2b AC2–AC3.
**TASK-410** Title: Fix orchestrator `READY` gating (§11) if not already present — **cross-epic task, coordinate with Epic 5's plan**. Depends on: Epic 5's graph-completion signal.
**TASK-411** Title: New tests for TASK-409's functions, appended to `test_indexing.py`.

---

## 25. Epic Definition of Done

- [x] Stories 4.1–4.2 implemented
- [x] Business rule BR-401 implemented
- [x] Database changes implemented (embedding column populated, GIN index created)
- [ ] APIs — **N/A**
- [ ] Events — **N/A**
- [x] Error handling, logging, tests implemented
- [x] Cross-epic dependency to Epic 6 documented
- [ ] **The §11 READY-gating fix is not fully closeable by this epic alone** — needs Epic 5's plan to acknowledge the same fix
- [ ] No critical open questions remain — **3 remain open** (§26)

---

## 26. Open Questions

- Should Epic 0's migration V10 be revised now to specify `vector(1024)` explicitly, given this epic resolves that dimension?
- Is `simple` text-search config sufficient for AC2's identifier-precision requirement, or will real reference-number formats need a `pg_trgm` fallback once tested?
- What embedding batch size is appropriate given actual hardware (CPU vs. GPU, per BRD §15's open deployment question)?

## 27. Assumptions

- BGE-M3 produces 1024-dimensional embeddings (a fact about the named model, not a project decision).
- Empty/whitespace chunks are skipped, not embedded.
- `simple` (not `english`) text-search config is used for the GIN index.
- `websearch_to_tsquery` is used for fault-tolerant query parsing.
- Embedding batch failure gets one retry before failing the document.

## 28. Design Gaps

- **Significant, carried at top of §11:** the ingestion diagram's `READY` gate omits the embedding/indexing branch — corrected in this plan, but `03_architecture.md` itself should be updated to match.
- Epic 0's migration for `document_chunk.embedding` may need a dimension-size amendment now that this epic resolves the ambiguity Epic 0 flagged.

## 29. Risks

- **The READY-gating gap is the most consequential finding in this epic's plan** — if implemented exactly as originally diagrammed, a document could appear fully ready in the UI while being silently unsearchable by vector search, which is the kind of "confidently wrong" failure mode this whole project's accuracy focus is specifically trying to eliminate. This should be confirmed and fixed before Checkpoint 1, not discovered during the checkpoint's own smoke test.
- Full-text precision for exact identifiers (§3 Story 4.2) carries real tuning risk — flagged with a documented fallback (`pg_trgm`) rather than assumed to just work.
