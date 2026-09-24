# 06_EPIC_05_KNOWLEDGE_GRAPH_IMPLEMENTATION_PLAN.md
### Epic 5 — Knowledge Graph Construction

> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `06_backend_epics_and_stories.md`. This is the project's core differentiator (BRD §1, §8.3) and its highest-risk epic (`01_project_knowledge.md` decision log, `07_realistic_timeline_and_task_plan.md` §3). No public API. **Two significant technical decisions made in this plan that aren't spelled out anywhere else — flagged clearly below, not silently assumed.**

---

## 1. Epic Overview

**Epic ID:** 5
**Epic Name:** Knowledge Graph Construction
**Business Objective:** Build a structured, queryable map of entities and relationships that lets the system cross-check answers against facts (not just retrieved text) and catch contradictions between documents — the mechanism BRD §1 names as the reason this system should hallucinate less than plain RAG.
**Business Problem:** Text retrieval alone can't verify that "Acme Corp signed Contract X" and "Contract X expires 31 March 2027" are consistent facts, or notice that an amendment changed that date — a graph can.
**Scope:** Entity extraction, relationship extraction, Neo4j writing, cross-document entity resolution, contradiction detection — all **strictly workspace-isolated**.
**Out of Scope:** Using the graph at query time to answer questions (Epic 6/7 consume it); vector/keyword indexing (Epic 4).
**Actors:** No human actor — background processing, triggered by the orchestrator after Epic 3.
**Dependencies:** Epic 3 (extracted fields + source text); Epic 0 (Neo4j container, schema).

In plain language: this is where the system stops just "having text" and starts "knowing facts" — who signed what, when it expires, and whether two documents disagree with each other.

---

## 2. Requirement Traceability

| BRD Requirement (§8.3, verbatim) | Story | AC |
|---|---|---|
| "The system shall build a knowledge graph from extracted entities... both within a single document and across documents in the same workspace." | 5.1, 5.2, 5.3 | 5.1 AC1–AC2, 5.2 AC1–AC3, 5.3 AC1–AC3 |
| "The system shall use the knowledge graph, in addition to standard text search, when answering a question..." | — | Consumed by Epic 6/7, not this epic |
| "The system shall be able to detect and surface direct contradictions between documents where the knowledge graph shows conflicting facts..." | 5.4 | AC1–AC4 |
| "The system shall strictly isolate workspaces from one another... never share knowledge-graph facts, citations, or contradiction results, even if they contain identically-named modules or mention the same real-world people/organisations." | 5.1, 5.2, 5.3, 5.4 | Every AC in this epic touches this requirement — it's not one story's job, it's a cross-cutting constraint on all four |

BRD §9 "Data isolation (highest priority, alongside accuracy)" applies to this epic more than any other in the system — this is where the guarantee is actually enforced at the data layer.

---

## 3. Two decisions this plan makes that aren't specified anywhere else

Before the story-by-story detail, two things had to be resolved to make this epic buildable, neither pre-decided in any source document:

**Decision A — the model-provider abstraction is built HERE, not in Epic 7.** Master Plan §12 already flagged this ambiguity ("Model-provider abstraction | Epic 7 (implicit)... used from Epic 5 too") without resolving it. Since Epic 5 runs *before* Epic 7 in the actual pipeline (extraction happens during ingestion, generation happens at chat time) and both are on the same developer's track (Senior Dev, Track A, `07_...md` §3), **Epic 5 builds the minimal `llm_provider.py` interface first, and Epic 7 extends/reuses it rather than rebuilding it.** This should be reflected as a correction to Master Plan §12 (owner: Epic 5, not Epic 7).

**Decision B — `SimpleKGPipeline`'s own lexical-graph feature (auto-created `:Chunk` nodes) is disabled.** The `neo4j-graphrag-python` library, by default, builds two graphs: a "lexical graph" (mirroring input text as `:Document`/`:Chunk` nodes inside Neo4j) and the domain/entity graph we actually want (`:Organization`, `:Person`, etc.). Our own schema (`04_...md` §3) has **no `:Chunk` node label** — because chunk text already lives in Postgres (`document_chunk`), and `03_architecture.md` §1 principle 3 explicitly keeps "source-faithful extracted text" and "knowledge graph facts" as separate representations, not duplicated into a second store. **This plan configures the pipeline to skip its own lexical-graph chunk creation**, and instead has each extracted entity carry `source_chunk_id`/`source_page` as plain properties pointing back to the real chunk in Postgres — consistent with the architecture's existing "three representations" principle, not a new one invented here.

---

## 4. Story-by-Story Implementation Plan

### Story 5.1 — Entity extraction via SimpleKGPipeline

**Business Requirement:** BRD §8.3 bullet 1.

**Acceptance Criteria** (verbatim):
- AC1. `SimpleKGPipeline` configured with our schema identifies people, organizations, dates, amounts, topics from extracted fields + source text.
- AC2. Every extracted entity is written with `workspace_id`, `document_id`, and `source_chunk_id` populated — **no node is ever created without a `workspace_id`.**

**Technical Interpretation:** "From extracted fields + source text" means this story's input is **both** Epic 3's structured `EXTRACTED_FIELD` rows (a head start — a date already identified as "Effective Date" doesn't need to be re-discovered from raw text) **and** the raw chunk text (to catch entities/relationships Epic 3's business-field extraction wasn't specifically looking for, e.g. a person mentioned in passing). AC2's "no node is ever created without a `workspace_id`" is the literal enforcement point for BRD's isolation guarantee — this must be true even for the pipeline's own internal node creation, not just our wrapper code, which is exactly why the schema configuration (not just post-hoc filtering) is where this gets enforced (per `03_architecture.md` §1 principle 6: "enforced at write time... not by hoping downstream filters catch it").

**Implementation:** `kg.extract_entities(document_id) -> List[Entity]` — configures `SimpleKGPipeline` with our node-label schema (`kg_schema.py`), runs it per-chunk (not once on the full document — see §14) against chunk text plus the corresponding `EXTRACTED_FIELD` rows for that document, with `workspace_id` injected into every node's properties at the schema/config level, not added afterward.

**Components:** `pipeline/kg.py`, `pipeline/kg_schema.py`, `pipeline/llm_provider.py` (Decision A above).

**Database (Neo4j):** Creates `:Organization`, `:Person`, `:DateFact`, `:Amount`, `:Topic` nodes (per `04_...md` §3's node table) — and a `:Document` node representing the current document (needed as the anchor for relationships in Story 5.2), all with `workspace_id`, `source_chunk_id`, `source_page` properties.

**APIs:** None.

**Events:** None.

**Business Rules:** BR-501 (see §8, the core isolation rule).

**Validation:** Every node write must include a non-null `workspace_id` — this is a hard precondition on the write function itself (§14), not a soft check.

**Error Handling:** LLM extraction failure on a chunk → skip that chunk's entities, continue with the rest (partial extraction is better than failing the whole document over one bad chunk — **ASSUMPTION §27**, not specified in source docs, but consistent with how Epic 3 handles per-field extraction gaps).

**Security:** No new surface; the isolation guarantee itself *is* this story's security-relevant behavior.

**Audit/Logging:** Entity count per document, per type, logged — useful diagnostic for evaluating whether the graph is actually being built with reasonable coverage.

**Testing:** Per `06_...md`'s sample: run entity extraction on a contract's extracted fields from Workspace A → entities include `Organization: Acme Corp (workspace_id: A)`, `DateFact: 2027-03-31 (workspace_id: A)`, each with a valid `source_chunk_id`.

---

### Story 5.2 — Relationship extraction + Neo4j writer

**Business Requirement:** BRD §8.3 bullet 1 (relationships, not just entities).

**Acceptance Criteria** (verbatim):
- AC1. Relationships (`SIGNED`, `EXPIRES_ON`, `AMENDS`, `MENTIONS`, `HAS_VALUE`) are written as edges via the pipeline's writer.
- AC2. Every node and edge is queryable by `document_id` and `workspace_id`.
- AC3. Writing is idempotent — reprocessing a document doesn't duplicate nodes/edges.

**Technical Interpretation:** AC1's 5 relationship types are the complete, exact list from `04_...md` §3 — no others exist in this epic's scope (`CONTRADICTS` is a 6th type, but it's Story 5.4's output, written later, not part of this story's extraction pass). AC3's idempotency requirement means every write must use Cypher `MERGE` (upsert), never plain `CREATE` — this is the same mechanism that will later support Story 5.3's cross-document resolution (a `MERGE` keyed on `(workspace_id, normalized_name)` naturally prevents both same-document reprocessing duplicates *and* cross-document duplicate entities, in one mechanism).

**Implementation:** `kg.extract_relationships(document_id) -> List[Relationship]` — same pipeline call as 5.1 (the library extracts entities and relationships together, not as two separate LLM calls, per how `SimpleKGPipeline` actually works), writing edges via `MERGE` patterns keyed appropriately per relationship type.

**Components:** `pipeline/kg.py` (same module, same function call as 5.1 — these two stories are really one pipeline invocation, split into two ACs for planning clarity, not two separate function calls).

**Database (Neo4j):** Creates `SIGNED`, `EXPIRES_ON`, `AMENDS`, `MENTIONS`, `HAS_VALUE` edges.

**APIs:** None. **Events:** None.

**Business Rules:** BR-502 (idempotent writes, see §8).

**Validation:** An edge must connect two nodes that both already have `workspace_id` set (enforced by construction, since 5.1 and 5.2 happen in the same pipeline pass — an edge can never reference a workspace-less node because none can exist per 5.1's AC2).

**Error Handling:** Same per-chunk graceful degradation as 5.1.

**Security:** Same as 5.1.

**Audit/Logging:** Edge count per relationship type, per document.

**Testing:** Per `06_...md`'s sample: reprocess the same document twice → Neo4j node/edge count for that document is identical after both runs (no duplicates) — this is the direct test of the `MERGE`-based idempotency.

---

### Story 5.3 — Cross-document entity resolution — strictly workspace-scoped

**Business Requirement:** BRD §8.3 bullet 1 ("across documents in the same workspace") + BRD §9 Data Isolation.

**Acceptance Criteria** (verbatim):
- AC1. The same organization/person mentioned in two documents **in the same workspace** resolves to one graph node, not two.
- AC2. Resolution query matches on `(workspace_id, normalized_name)` — **never on `normalized_name` alone.**
- AC3. The same entity name in a **different** workspace never resolves to, links to, or is discoverable from the first workspace's node, under any circumstance.

**Technical Interpretation:** As noted in Story 5.2's interpretation, this is implemented via the same `MERGE` mechanism, not a separate batch job run after the fact — resolution happens **at write time**, per entity, not as a periodic "go find duplicates and merge them" cleanup process. **Normalization algorithm — not specified in any source doc**, resolved here as a defensible baseline (ASSUMPTION §27): lowercase, trim whitespace, collapse internal whitespace. **This baseline will NOT catch every real-world variation** — "Acme Corp." vs "Acme Corporation" vs "Acme" would remain three distinct nodes under this simple normalization, since legal-suffix stripping and fuzzy/semantic matching are meaningfully harder problems than the 1.8-day story estimate budgets for. This is a known, accepted accuracy limitation for the POC, not a silently-introduced gap — flagged explicitly in §26/§29, not fixed beyond scope here.

**Implementation:** `kg.resolve_entity(workspace_id, entity_type, name) -> node_id` — called during the write step of 5.1/5.2, before creating a node: normalize the name, `MATCH` on `(workspace_id, normalized_name)`; if found, reuse that node's ID for the new relationship; if not, proceed with `MERGE`/create.

**Components:** `pipeline/kg.py` (same module, a helper function called during the write path — not a separate story-3 function invoked independently).

**Database (Neo4j):** Composite index on `(workspace_id, normalized_name)` for `:Organization` and `:Person` (per `04_...md` §4) — **this index is the actual enforcement mechanism for AC2/AC3**, not just a performance optimization; without it, a resolution query scanning by `normalized_name` alone (even if the application code intends to filter by `workspace_id` too) has no guaranteed boundary if that filter is ever accidentally omitted in a future code change. The index's *shape* — composite, workspace-first — makes the isolated query the natural/fast one and a cross-workspace query the unnatural one.

**APIs:** None. **Events:** None.

**Business Rules:** BR-503 (the core isolation guarantee, see §8 — this is the single most important business rule in the entire system).

**Validation:** A resolution match query must always include `workspace_id` as a filter — **this should be enforced by never exposing a resolution function that omits it as a parameter** (an API-design-level safeguard, not just a runtime check — see §14).

**Error Handling:** N/A beyond the general per-chunk graceful degradation.

**Security:** This story's entire purpose is a security/correctness guarantee — see §17.

**Audit/Logging:** Every resolution decision (new node vs. matched-existing) logged, since this is exactly the kind of behavior worth being able to audit if a workspace-isolation bug is ever suspected.

**Testing:** Per `06_...md`'s sample, verbatim as the explicit automated test this project requires: upload a document mentioning "Acme Corp" into a Finance workspace, and a separate document also mentioning "Acme Corp" into a Governance workspace → two completely separate `:Organization` nodes exist, one per workspace, with **zero relationship path between them** — verified as an explicit automated test (a Cypher `MATCH path = (a)-[*]-(b) WHERE a.workspace_id <> b.workspace_id RETURN path` returning zero rows is the concrete test query), not just informally observed.

---

### Story 5.4 — Contradiction detection query — scope-bounded

**Business Requirement:** BRD §8.3 bullet 3.

**Acceptance Criteria** (verbatim):
- AC1. Detects conflicting `DateFact`/`Amount` values across related documents **within the same workspace** (e.g. two expiry dates for contract + amendment).
- AC2. When a chat session is scoped to a module or a single document, the contradiction check is bounded to that scope's induced subgraph — a contradiction that only involves documents outside the current scope must not surface.
- AC3. Returns both conflicting facts with their source documents/pages.
- AC4. Contradictions are **never** detected or reported across two different workspaces, even if the same real-world entity name appears in both (see 5.3).

**Technical Interpretation — a real design decision this plan resolves, not pre-specified:** the schema (`04_...md` §3) lists `CONTRADICTS` as a genuine relationship type with a concrete example, implying a *stored* edge — but AC2's "bounded to that scope" language implies the check must vary *per chat session's scope*, which a single precomputed edge can't do on its own. **Resolution: `CONTRADICTS` edges are written once, proactively, whenever a new document is processed** (comparing its facts against every existing document already in the same workspace's graph — not just within the new document alone), **and a separate query-time filter** (used later by Epic 6/7, but the filter logic is documented here since this epic owns the concept) narrows which `CONTRADICTS` edges are *surfaced* to only those where both connected documents fall within the current chat's resolved scope. Writing happens once (ingestion-time, this epic); scope-filtering happens per-question (query-time, Epic 6/7) — the edge itself is workspace-wide, its *visibility* is scope-narrowed on read.

**Implementation:** `kg.detect_contradictions(document_id, workspace_id) -> List[Contradiction]` — after 5.1–5.3 write the new document's facts, this function queries all `:DateFact`/`:Amount` nodes in the *same workspace* sharing the same `label` (e.g., "expiry date") but connected (via `EXPIRES_ON`/`AMENDS` chains) to related documents with **different values**, and writes `CONTRADICTS` edges between them.

**Components:** `pipeline/kg.py`.

**Database (Neo4j):** Creates `CONTRADICTS` edges (`:DateFact`↔`:DateFact` or `:Amount`↔`:Amount`).

**APIs:** None (the scope-filtered read query is documented here as a contract Epic 6/7 will implement against, not built as a public endpoint in this epic).

**Events:** None.

**Business Rules:** BR-504 (see §8).

**Validation:** A `CONTRADICTS` edge must never connect nodes from different `workspace_id` values — enforced by construction, since the detection query itself is workspace-scoped from the start (never a global cross-workspace scan).

**Error Handling:** N/A beyond general pipeline error handling.

**Security:** Same isolation-guarantee framing as 5.3.

**Audit/Logging:** Contradictions found, logged per document — genuinely useful for the demo narrative (BRD §1's core value proposition made visible).

**Testing:** Per `06_...md`'s sample: query contradictions scoped to "Module A" only, where the real contradiction actually involves a document in "Module B" of the same workspace → no contradiction surfaced for the Module-A-scoped query; the same query run at workspace scope does surface it. **This test exercises the query-time filter described above, not the write step** — both need separate test coverage (§19).

---

## 5. End-to-End Flow

```
orchestrator (Epic 3 hand-off, EXTRACTING complete, status → INDEXING)
 ↓
kg.build_knowledge_graph(document_id, workspace_id)   — runs 5.1+5.2 together (one pipeline call)
 ↓ for each chunk:
 ↓   SimpleKGPipeline extracts entities + relationships (lexical-graph chunk creation DISABLED, per Decision B)
 ↓   for each entity: resolve_entity(workspace_id, type, normalized_name) — MERGE, not CREATE (5.3)
 ↓   write edges via MERGE (5.2, idempotent)
 ↓ (success)
kg.detect_contradictions(document_id, workspace_id)    — Story 5.4, compares against existing workspace graph
 ↓ (success)
orchestrator proceeds — Epic 5's completion is one of the two conditions (alongside Epic 4's) gating READY, per Epic 4's plan §11
```

**Failure branches:** LLM extraction failure on a chunk → skip, continue (§4 Story 5.1). A Neo4j write failure (connection issue, constraint violation) → `FAILED`, consistent with every other epic's severity model. **Cross-workspace leak is not a "failure branch" in the error-handling sense** — it should be architecturally impossible given Decision B's indexing/`MERGE` design, not something caught and handled after the fact; if the automated isolation test (§4 Story 5.3) ever fails, that's a build-blocking defect, not a runtime error to gracefully degrade around.

---

## 6. Architecture Mapping

| Component | Responsibility | Input | Output | Dependencies |
|---|---|---|---|---|
| `llm_provider.py` | Swappable LLM client (Decision A) | Config (`ollama`/`hosted`) | LLM client instance | Ollama or hosted API |
| `kg_schema.py` | Pipeline schema config | — | `SimpleKGPipeline` config object | `neo4j-graphrag-python` |
| `kg.py` (extraction) | Entity+relationship extraction, resolution, writing | Chunks + extracted fields | Neo4j nodes/edges | `SimpleKGPipeline`, Neo4j driver |
| `kg.py` (contradiction) | Contradiction detection | Workspace graph | `CONTRADICTS` edges | Neo4j driver |

Maps to `03_architecture.md` §2's `KGBUILD["KG Build (neo4j-graphrag SimpleKGPipeline)"]` box, and §5's detailed diagram (B→C→D→E→F→G/H nodes) — this epic implements that diagram exactly, including its explicit note that entity resolution and contradiction detection are custom, not library-provided.

---

## 7. Database Implementation (Neo4j)

Full schema already defined in `04_...md` §3 — this epic writes to it, doesn't redefine it. Per `04_...md` §4's indexing plan: composite index on `(workspace_id, normalized_name)` for `:Organization`/`:Person`, index on `:Document(document_id)`, `:Document(workspace_id)`, `:Document(group_id)` — **all created at AI Service startup via Cypher `CREATE INDEX IF NOT EXISTS`, not via Flyway** (Neo4j has no relational-style migration tool in this stack, per Master Plan §20).

**CREATE (via MERGE):** all node types, all relationship types except `CONTRADICTS`.
**CREATE (via MERGE, separate pass):** `CONTRADICTS` edges (Story 5.4).
**READ:** entity resolution matching (Story 5.3), contradiction-query scope filtering (documented here, executed by Epic 6/7).
**UPDATE/DELETE:** none in this epic — Epic 1's Story 1.4 (document soft-delete) raised an open question about what happens to a deleted document's graph nodes (`02_EPIC_01_...md` §28) that remains unresolved here too — this epic does not implement graph-node cleanup on document deletion.

---

## 8. Business Rules

**BR-501:** No graph node is ever created without a `workspace_id` property. Source: BRD §9, Story 5.1 AC2. Enforced in: the node-write function's signature itself requires `workspace_id` as a non-optional parameter (§14) — not a validated-but-skippable field.

**BR-502:** All graph writes are idempotent (`MERGE`, never bare `CREATE`). Source: Story 5.2 AC3. Enforced in: `kg.py`'s Cypher templates.

**BR-503 (the core project guarantee):** Entity resolution matches only within `(workspace_id, normalized_name)` — two workspaces never share a node, path, or discoverable relationship, regardless of name collisions. Source: BRD §9, Story 5.3 AC2/AC3. Enforced in: the composite Neo4j index + the resolution query's mandatory `workspace_id` parameter (§7, §14).

**BR-504:** Contradictions are detected and stored within a single workspace only; never across workspaces. Source: Story 5.4 AC4. Enforced in: `detect_contradictions()`'s query, which is always parameterized by a single `workspace_id`, never a global scan.

---

## 9. State Machines

This epic contributes to `INDEXING→READY`, jointly with Epic 4 — see the corrected gating condition established in `05_EPIC_04_...md` §11: `READY` requires overview/summary (Epic 3), fields (Epic 3), embeddings (Epic 4), **and** graph-build (this epic) all complete, not a subset.

---

## 10. Events and Integrations

None — no event bus. The `neo4j-graphrag-python` library and the LLM provider are dependencies, not integrations in the BRD §5.2 sense (both are already-decided internal tooling, not external systems).

---

## 11. Cross-Epic Dependencies

| Dependency | Dependent Epic | Providing Epic | Contract |
|---|---|---|---|
| Extracted fields + chunk text | Epic 5 | Epic 3 | `EXTRACTED_FIELD` rows, `document_chunk` text |
| `llm_provider.py` (Decision A) | Epic 7 | **Epic 5** | Reuse, don't rebuild — correction to Master Plan §12's ownership |
| Graph (nodes/edges, `CONTRADICTS` included) | Epic 6 | Epic 5 | Neo4j graph, scope-bounded query contract documented in §4 Story 5.4 |
| Graph-build completion signal | Epic 4 (jointly gates `READY`) | Epic 5 | Orchestrator's success/failure of `build_knowledge_graph()` |

---

## 12. Shared Components

**Owned by this epic (correcting Master Plan §12):** the LLM provider abstraction (Decision A). **Consumed from elsewhere:** pipeline orchestrator (Epic 2), extracted fields (Epic 3).

---

## 13. File / Module Implementation Plan

**CREATE:**
```
/ai-service/app/pipeline/
  llm_provider.py — get_llm_client(config) -> LLM client, Ollama or hosted, one swappable interface (Decision A; Epic 7 will import and extend this, not duplicate it).
  kg_schema.py — SimpleKGPipeline schema config: node labels (Organization, Person, DateFact, Amount, Topic, Document), relationship types (SIGNED, EXPIRES_ON, AMENDS, MENTIONS, HAS_VALUE), lexical-graph chunk creation DISABLED (Decision B).
  kg.py — build_knowledge_graph(document_id, workspace_id), resolve_entity(...), detect_contradictions(document_id, workspace_id).
  neo4j_client.py — Neo4j driver session management.
  neo4j_schema_init.py — startup script, `CREATE INDEX IF NOT EXISTS` statements per `04_...md` §4, run once when `ai-service` starts.

/ai-service/tests/pipeline/
  test_kg.py — including the explicit cross-workspace isolation test from Story 5.3.
```

**MODIFY:** `ai-service/app/pipeline/orchestrator.py` — add the `build_knowledge_graph()` call and contribute to the corrected `READY` gating (joint with Epic 4, per `05_EPIC_04_...md` §11).

**MODIFY:** `01_project_knowledge.md` §12 — recommend correcting the shared-component ownership note once this plan is reviewed.

---

## 14. Method-Level Implementation Details

### `kg.build_knowledge_graph(document_id: UUID, workspace_id: UUID) -> None`
Purpose: extract entities/relationships for one document and write them, workspace-isolated.
Inputs: `document_id`, `workspace_id` — **both required, `workspace_id` is never optional or inferred implicitly from `document_id` alone inside this function**, even though it technically *could* be looked up — passing it explicitly is a deliberate defense-in-depth choice so the function's signature itself makes a workspace-less call impossible to write by accident.
Business logic:
1. Load chunks + `EXTRACTED_FIELD` rows for `document_id`.
2. Ensure a `:Document` node exists (`MERGE` on `document_id`, set `workspace_id`, `group_id`, `title`, `document_type`).
3. For each chunk: run `SimpleKGPipeline` (configured per `kg_schema.py`, lexical-graph disabled per Decision B) to extract candidate entities/relationships.
4. For each candidate entity: `resolve_entity(workspace_id, entity_type, name)` → get-or-create node ID.
5. Write relationships (`SIGNED`/`EXPIRES_ON`/`AMENDS`/`MENTIONS`/`HAS_VALUE`) via `MERGE`, connecting the resolved entity nodes to the `:Document` node.
Exceptions: per-chunk extraction failure is caught and logged, does not abort the whole document (§4 Story 5.1 ASSUMPTION); a Neo4j write failure is not caught here, propagates to the orchestrator → `FAILED`.

### `kg.resolve_entity(workspace_id: UUID, entity_type: str, name: str) -> str`
Purpose: the core isolation-guarantee function (BR-503).
1. `normalized = name.strip().lower()` (collapse internal whitespace too — §4 Story 5.3's baseline normalization).
2. Cypher: `MERGE (n:{entity_type} {workspace_id: $workspace_id, normalized_name: $normalized}) ON CREATE SET n.name = $name, n.source_chunk_id = $chunk_id, n.source_page = $page RETURN n`.
3. Return the node's internal ID.
**Note:** because this is a `MERGE` keyed on `(workspace_id, normalized_name)`, this single function correctly handles three cases at once: brand-new entity, same-document re-extraction (idempotency, BR-502), and cross-document resolution within the same workspace (BR-503/AC1) — while the `workspace_id` key prevents the fourth case (cross-workspace collision, BR-503/AC3) by construction.

### `kg.detect_contradictions(document_id: UUID, workspace_id: UUID) -> None`
1. For each `:DateFact`/`:Amount` node newly created/touched by this document's processing, find other nodes in the **same workspace** (never cross-workspace — BR-504) sharing the same `label` but reachable via a document-relationship chain (e.g. `AMENDS`) with a **different `value`**.
2. `MERGE (a)-[:CONTRADICTS]-(b)` for each conflicting pair found.
Exceptions: propagates to orchestrator → `FAILED` on Neo4j error, same as above.

### Query-time contradiction filter (documented here, implemented by Epic 6/7)
Given a resolved chat scope (`resolvedDocumentIds`, from `03_architecture.md` §4.1): `MATCH (a)-[:CONTRADICTS]-(b) WHERE a.document_id IN $resolvedDocumentIds AND b.document_id IN $resolvedDocumentIds RETURN a, b` — a contradiction only surfaces if **both** its endpoints' source documents are inside the current scope (satisfies Story 5.4 AC2's module-scoping example directly).

---

## 15. Transaction and Consistency

Each document's graph-build runs as its own logical unit — a failure partway through (e.g., chunk 5 of 10 fails) leaves chunks 1–4's entities/relationships written (Neo4j doesn't require rolling this back, since `MERGE`'s idempotency means a retry via Story 1.4 safely re-processes without duplication). **Concurrency note:** if two documents in the *same workspace* are processed concurrently (two Celery workers, two documents, same workspace) and both extract "Acme Corp" at the same moment, there's a theoretical race on the `MERGE` — Neo4j's `MERGE` is not inherently atomic across concurrent transactions without a uniqueness constraint backing it. **Recommend adding a Neo4j uniqueness constraint** on `(workspace_id, normalized_name)` per entity label (stronger than just an index) to make this race-safe — **not explicitly specified in `04_...md`, which only lists an index, not a constraint** — flagged as ASSUMPTION §27/OPEN QUESTION §26, worth resolving before assuming concurrent document processing is safe.

---

## 16. Error Handling

| Condition | Result |
|---|---|
| Per-chunk LLM extraction failure | Skip chunk, continue (partial extraction) |
| Neo4j write failure | `FAILED`, propagates to orchestrator |
| Concurrent same-entity writes (§15) | **Currently unguarded** — a real risk, not just theoretical, until a uniqueness constraint is added |

---

## 17. Security

This epic's entire *raison d'être* is a data-isolation guarantee, so "security" here means correctness of the isolation boundary, not authentication/authorization (no user-facing surface exists). The explicit automated test in Story 5.3 (§4) is this epic's actual security test — a passing test suite that doesn't include that specific zero-path-between-workspaces assertion should not be considered sufficient coverage for this epic, regardless of how many other tests pass.

---

## 18. Observability

Entity/relationship/contradiction counts logged per document. Resolution decisions (new vs. matched) logged per §4 Story 5.3 — valuable both for debugging and as evidence the isolation guarantee is behaving as designed, ahead of any incident, not just after one.

---

## 19. Test Implementation Plan

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 5.1 | AC1–AC2 | Extract entities from a contract's fields | Integration | Organization/DateFact nodes with `workspace_id`, `source_chunk_id` |
| 5.2 | AC1 | Extract relationships | Integration | `SIGNED`/`EXPIRES_ON`/etc. edges created |
| 5.2 | AC3 | Reprocess same document twice | Integration | Identical node/edge count both times |
| 5.3 | AC1 | Two documents, same workspace, same entity name | Integration | One node, not two |
| 5.3 | AC2 | Inspect resolution query | Unit | Confirms `(workspace_id, normalized_name)` used, never `normalized_name` alone |
| 5.3 | AC3 | **The explicit isolation test** — same entity name, two different workspaces | Integration (release-blocking) | Two separate nodes, zero relationship path (`MATCH path=(a)-[*]-(b) WHERE a.workspace_id<>b.workspace_id` returns 0 rows) |
| 5.4 | AC1 | Contract + amendment with different expiry dates | Integration | `CONTRADICTS` edge created |
| 5.4 | AC2 | Query contradictions at Module-A scope vs. workspace scope | Integration | Not surfaced at Module A; surfaced at workspace scope |
| 5.4 | AC4 | Same entity name, contradicting dates, different workspaces | Integration (release-blocking) | No `CONTRADICTS` edge ever created across the workspace boundary |

The three "release-blocking" tests above are this epic's actual definition of success — everything else is important but these three are non-negotiable per BRD §9.

---

## 20. Non-Functional Requirements

Data isolation is this epic's top NFR (BRD §9), on equal footing with accuracy. Performance: not a priority at POC scale (BRD §9 Scalability) — contradiction detection comparing a new document against an entire workspace's existing graph is acceptable to be slow at POC document counts, not optimized here.

---

## 21. Configuration

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` (`ollama`\|`hosted`) + related keys | Decision A's provider config |
| `KG_ENTITY_NORMALIZATION_STRATEGY` | Placeholder for §4 Story 5.3's baseline (lowercase/trim/collapse) — tunable if legal-suffix stripping is added later |

---

## 22. Deployment

Requires the Neo4j container (Epic 0) and, if `LLM_PROVIDER=ollama`, the optional `ollama` service (Epic 0's Docker Compose) with a model pulled — same GPU/deployment open item tracked at the BRD level (§15), now directly relevant since extraction quality and speed both depend on it.

---

## 23. Implementation Order

1. `llm_provider.py` (Decision A) — needed before anything else in this epic can call an LLM.
2. `neo4j_client.py`, `neo4j_schema_init.py` — Neo4j connectivity + indexes.
3. `kg_schema.py` — pipeline configuration (Decision B).
4. `kg.resolve_entity()` — can be unit-tested in isolation against a test Neo4j instance before the full pipeline is wired.
5. `kg.build_knowledge_graph()` (Stories 5.1/5.2) — depends on 1–4, can build against fixture extracted fields immediately (non-blocking, per `06_...md`'s stated pattern).
6. **The explicit cross-workspace isolation test (§19)** — write this test early, not last, so it acts as a guardrail during the rest of this epic's development, not just a final check.
7. `kg.detect_contradictions()` (Story 5.4) — depends on 5.
8. Wire orchestrator call + contribute to the corrected `READY` gate.

---

## 24. Coding Agent Task Breakdown

**TASK-501** Title: `llm_provider.py`. Depends on: None. Acceptance: returns a working LLM client for both `ollama` and `hosted` config values.
**TASK-502** Title: `neo4j_client.py` + `neo4j_schema_init.py`. Depends on: Epic 0's Neo4j container. Acceptance: indexes exist on startup.
**TASK-503** Title: `kg_schema.py`. Depends on: TASK-501. Acceptance: `SimpleKGPipeline` configured, lexical-graph chunk creation confirmed disabled.
**TASK-504** Title: `kg.resolve_entity()`. Depends on: TASK-502. Acceptance: Story 5.3 AC2, unit-tested against a live test Neo4j instance.
**TASK-505** Title: **The cross-workspace isolation test** (write before TASK-506, per §23's guardrail reasoning). Depends on: TASK-504.
**TASK-506** Title: `kg.build_knowledge_graph()` (5.1/5.2). Depends on: TASK-503, TASK-504, fixture extracted fields. Acceptance: Story 5.1 AC1–AC2, Story 5.2 AC1–AC3, and TASK-505 passing.
**TASK-507** Title: `kg.detect_contradictions()`. Depends on: TASK-506. Acceptance: Story 5.4 AC1, AC3, AC4.
**TASK-508** Title: Query-time contradiction scope filter (documented for Epic 6/7 to implement, this task just confirms the Cypher pattern from §14 works against real data). Depends on: TASK-507.
**TASK-509** Title: Neo4j uniqueness constraint for the concurrency gap (§15) — **new, not in the original story list, added by this plan's own risk analysis**. Depends on: TASK-502.
**TASK-510** Title: Wire orchestrator call + `READY` gating contribution. Depends on: TASK-506, TASK-507, Epic 4's TASK-410.
**TASK-511** Title: Full test suite, including all three release-blocking tests from §19.

---

## 25. Epic Definition of Done

- [x] Stories 5.1–5.4 implemented
- [x] Business rules BR-501–504 implemented
- [x] Database changes implemented (all node/relationship types, indexes)
- [ ] APIs — **N/A**
- [ ] Events — **N/A**
- [x] Error handling, logging, tests implemented
- [x] **All three release-blocking isolation tests pass** (§19) — this is the actual bar for this epic, more than the general checklist
- [x] Cross-epic dependencies verified, including the Decision A correction to Master Plan §12
- [ ] No critical open questions remain — **3 remain open** (§26)

---

## 26. Open Questions

- Should a Neo4j **uniqueness constraint** (not just an index) be added on `(workspace_id, normalized_name)` to close the concurrency race identified in §15?
- What's the exact entity-name normalization strategy beyond the baseline (lowercase/trim/collapse) — is legal-suffix stripping ("Corp"/"Inc"/"Ltd") worth the added complexity for this POC, or an accepted limitation?
- What happens to a document's graph nodes/edges when it's soft-deleted (Epic 1 Story 1.4)? Carried forward from `02_EPIC_01_...md` §28, still unresolved here.

## 27. Assumptions

- Decision A: `llm_provider.py` owned by this epic, not Epic 7.
- Decision B: `SimpleKGPipeline`'s lexical-graph chunk creation is disabled; chunk provenance is tracked via plain properties instead.
- Per-chunk extraction failures are skipped, not fatal to the whole document.
- Entity normalization: lowercase + trim + collapse whitespace, no suffix-stripping or fuzzy matching.
- `CONTRADICTS` edges are written proactively at ingestion time; scope-filtering happens at query time (not the only valid interpretation of the ACs, but the one used here).

## 28. Design Gaps

- No uniqueness constraint backing the isolation-critical index (§15/§26).
- Graph cleanup behavior on document soft-delete is undefined (carried from Epic 1).
- Legal-suffix/fuzzy entity matching is out of scope — a known, not hidden, accuracy ceiling.

## 29. Risks

- **This is the highest-risk epic in the entire system**, both technically (per `01_project_knowledge.md`'s own risk log — "KG timeboxed... may not be fully tunable in 4 weeks") and now schedule-wise (`07_...md` §3 — Track A confirmed over its 10-day budget, and this epic is a large share of that track). The three release-blocking tests in §19 exist specifically to make sure schedule pressure never trades away the isolation guarantee — if time runs short, cut normalization sophistication (§27) or contradiction-detection thoroughness before ever cutting corners on those three tests.
- **The concurrency gap (§15)** is a real, not theoretical, risk once ingestion happens for real documents rather than one-at-a-time fixtures — worth resolving (TASK-509) before Checkpoint 1, not treated as a nice-to-have.
- **Naive entity normalization** (§27) means the demo's accuracy story could be weakened by "Acme Corp" and "Acme Corporation" appearing as separate nodes in the same workspace — worth stress-testing against the actual evaluation document set (Epic 9) early enough to know if this matters in practice, not assumed away.
