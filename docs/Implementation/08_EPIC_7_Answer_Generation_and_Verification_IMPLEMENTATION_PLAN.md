# EPIC 7 — Answer Generation & Verification — Implementation Plan
### Pod 3: Document Extractor + Chatbot (POC)

> This plan is one part of a multi-document set. It assumes the reader also has access to:
> `BRD_Pod3_DocumentExtractor_Chatbot.docx`, `01_project_knowledge.md`, `02_requirements_and_user_journeys.md`,
> `03_architecture.md`, `04_db_mapping_and_er_diagram.md`, `05_api_specs.md`,
> `06_backend_epics_and_stories.md`, `08_epic_interlinking_and_architecture_map.md`.
> This document does not repeat those in full — it cross-references them by section.

---

## 1. EPIC OVERVIEW

**Epic ID:** Epic 7
**Epic Name:** Answer Generation & Verification
**Owner (recommended skill fit):** Senior Developer (`06_backend_epics_and_stories.md` §3)
**Total estimate:** 3.5 dev-days (Story 7.1: 1.5d, Story 7.2: 1.5d, Story 7.3: 0.5d)

**Business Objective**
Turn a ranked, reranked evidence package (text passages + graph facts) into a natural-language answer that is (a) generated *only* from that evidence, never from the model's general knowledge, and (b) checked, claim-by-claim, against the evidence and the knowledge graph before it is ever shown to the user. This is the mechanism that directly delivers BRD Primary Objective (§3) and POC Exit Criterion 1 (§4): proving that graph-grounded verification measurably reduces hallucination versus plain retrieval.

**Business Problem**
General-purpose AI chat tools "state something confidently that is not actually in the source document" (BRD §2). Epic 7 is the last line of defense against that failure mode before an answer reaches the user — it is where the "accuracy-first" premise of the whole POC is either honored or broken.

**Scope**
- Generate a grounded answer strictly from the evidence package handed off by Epic 6.
- Support a swappable LLM provider (local Ollama or hosted API) via one config value.
- Verify every factual claim in the draft answer against the evidence and the graph.
- Strip unsupported claims, or downgrade the whole answer to "not found," rather than let an unverified claim through.
- Produce the final answer object (text, mode, confidence, isNotFound flag) that Epic 8 streams to the user.

**Out of Scope (belongs to other epics)**
- Retrieval, reranking, evidence balancing → Epic 6.
- Question classification / query rewriting → Epic 6 (Story 6.1).
- Contradiction detection query itself → Epic 5 (Story 5.4) — Epic 7 *consumes* its output during verification, does not implement it.
- SSE transport, session/scope resolution, citation persistence, message history → Epic 8.
- Running this pipeline twice per question in two modes and scoring the diff → Epic 9.

**Actors**
- Business User (indirect — receives the final answer via Epic 8's stream).
- QA/Evaluator (indirect — Epic 9 calls this epic's logic twice per test question, in `retrieval_only` and `retrieval_plus_graph` modes).
- System/internal caller: Core API's AI Orchestration layer, via the internal AI Service contract.

**Dependencies**
| Depends on | What is consumed | Direction |
|---|---|---|
| Epic 6 — Hybrid Retrieval & Reranking | The compact, reranked, balanced evidence package (text passages + graph facts) | Epic 7 consumes Epic 6's output |
| Epic 5 — Knowledge Graph (Story 5.4, contradiction detection) | Scope-bounded contradiction query, used during claim verification | Epic 7 consumes Epic 5's output |
| Epic 0 — Foundation | Model-provider interface/adapter scaffold (see §12 Shared Components — flagged as a DESIGN GAP on exact ownership) | Epic 7 depends on the adapter existing |
| Epic 8 — Chat API & Citations | *Consumes* Epic 7's output (the reverse direction) | Epic 8 depends on Epic 7 |
| Epic 9 — Evaluation | *Consumes* Epic 7 (called twice per test question, once per mode) | Epic 9 depends on Epic 7 |

**Where this sits in the interlinking map** (`08_epic_interlinking_and_architecture_map.md` §3, §5):
```
EP6 (Hybrid Retrieval) --RR--> EP7: GA (Generate) --> CV (Verify) --> NFq{Supported?}
                                                         |Yes -> CI (Attach citations) -----> EP8: ST (stream)
                                                         |No  -> NFH (Return "not found") ---> EP8: ST (stream)
```
Built against a **fixture evidence package** until **Checkpoint 2 (Day 8)**, at which point Epic 6's real evidence output is wired in. Epic 7's own output is consumed by Epic 8's chat endpoint from a **stub generator** until the same Checkpoint 2 wiring event (`08_epic_interlinking_and_architecture_map.md` §1, Checkpoint 2 row).

---

## 2. REQUIREMENT TRACEABILITY

| BRD Requirement | Epic | Story | Acceptance Criterion | Component | Implementation |
|---|---|---|---|---|---|
| §8.4 "answer using only information found within the selected scope... not from the AI model's general knowledge" | Epic 7 | 7.1 | AC1 | Answer Generation Service | Evidence-only prompt construction; no general-knowledge fallback path |
| §8.4 "clearly state when a question cannot be answered from the available documents" | Epic 7 | 7.3 | AC1 | Not-Found Handler | Explicit `isNotFound: true` response with reason |
| §8.3 "use the knowledge graph...to check that an answer's facts and relationships are actually supported" | Epic 7 | 7.2 | AC1 | Claim Verification Service | Per-claim check against evidence text + graph facts |
| §8.6 "record whether an answer was generated using retrieval only or retrieval plus knowledge graph" | Epic 7 | 7.1 | AC2 (indirectly, via mode param) | Answer object / `CHAT_MESSAGE.answer_mode` | `mode` passed through from caller into generation & persisted by Epic 8 |
| §9 NFR "Accuracy... must be evaluated and tuned...before speed or additional features" | Epic 7 | 7.1, 7.2 | All | Whole epic | Verification step is mandatory, not optional/skippable |
| §10.1 "the system checks the answer against this structured map [graph] as well as the raw text" | Epic 7 | 7.2 | AC1 | Claim Verification Service | Dual check: evidence text AND graph |
| Architecture §1 principle 2 "Keep the LLM provider swappable" | Epic 7 | 7.1 | AC2 | Model Provider Adapter | One config value switches Ollama ↔ hosted API |
| Architecture §4.2 steps K–O | Epic 7 | 7.1, 7.2, 7.3 | All | Generate → Verify → Supported? → Attach citations / Not found | Directly implements this flow |

No BRD requirement in §8.4–§8.6 or §9/§10 that pertains to answer generation/verification is left untraced.

---

## 3. STORY-BY-STORY IMPLEMENTATION PLAN

### Story 7.1 — Grounded answer generation

**Business Requirement**
The system must produce a natural-language answer using *only* the evidence it was given — no filling gaps from the model's training data. This is the foundational trust guarantee of the whole product (BRD §2, §8.4).

**Acceptance Criteria** (verbatim from `06_backend_epics_and_stories.md` §12)
- AC1. Answer is generated strictly from the provided evidence package — no general-knowledge fallback.
- AC2. LLM provider is swappable (local vs. hosted) via one config value, no code change.

**Technical Interpretation**
- AC1 means the prompt sent to the LLM must (a) contain the evidence package as the only source material, (b) contain an explicit system instruction to answer *only* from what's provided and never from prior/general knowledge, and (c) constrain the model's behavior so that when the evidence is empty or irrelevant, the model does not attempt an answer — it hands control to Story 7.3's not-found path (verification in 7.2 is the net that catches anything that slips through anyway).
- AC2 means the LLM call must go through a provider-agnostic interface (`ModelProvider`) with two implementations (`OllamaProvider`, `HostedApiProvider`), selected by a single environment/config value (e.g. `LLM_PROVIDER=ollama|hosted`), with no branching logic anywhere else in the codebase.

**Implementation**
1. Accept the evidence package (produced by Epic 6, or the fixture before Checkpoint 2) plus the question, `workspaceId`, `resolvedDocumentIds`, and `mode` (`retrieval_only` | `retrieval_plus_graph`).
2. Build a structured prompt: system instruction (evidence-only, cite-what-you-use, decline-if-insufficient) + the evidence package (passages with document/page/section tags + graph facts, when `mode = retrieval_plus_graph`) + the user's question.
3. Call the selected `ModelProvider` implementation to get a draft answer, structured so each sentence/claim can later be mapped back to a specific evidence item (e.g. the model is asked to tag each claim with the evidence ID it relied on).
4. Return the draft answer + claim-to-evidence mapping to Story 7.2 for verification. **The draft answer is never shown to the user directly — it always passes through verification first (architecture §4.2, step L is mandatory, not conditional).**
5. In `retrieval_only` mode, the graph-fact portion of the evidence package (and downstream graph verification in 7.2) is simply absent/empty by construction — the *same* generation code path runs, only the *evidence package's contents* differ. This is what makes the Epic 9 A/B comparison a fair test of the graph's contribution rather than a test of two different code paths.

**Components**
- `AnswerGenerationService` (AI Service, Python/FastAPI) — orchestrates prompt build → provider call → draft answer.
- `ModelProviderInterface` (Python `Protocol`/ABC) + `OllamaProvider` + `HostedApiProvider` (see §12 Shared Components).
- `PromptBuilder` — assembles the evidence-only prompt from the evidence package.
- Internal AI Service endpoint consumer: `POST /internal/ai/chat/answer` (owned by Epic 8's Core API caller; Epic 7 implements the handler logic behind it — see §11 Cross-Epic Dependencies).

**Database**
- **Reads:** none directly (evidence package is passed in-memory from Epic 6; no independent DB read by Story 7.1).
- **Writes:** none directly — the persisted `CHAT_MESSAGE` row (including `answer_mode`) is written by Epic 8 once the final (verified) answer comes back. Story 7.1 only *produces* the `mode` value that Epic 8 will persist.
- Relevant downstream table: `CHAT_MESSAGE.answer_mode` (`04_db_mapping_and_er_diagram.md` §1, §2) — enum `retrieval_only` / `retrieval_plus_graph`, exactly the two modes this story must support identically.

**APIs**
- Internal only. `POST /internal/ai/chat/answer` request shape, per `05_api_specs.md` §10:
```json
{
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "question": "What's different between the termination clauses?",
  "documentIds": ["uuid-1", "uuid-2"],
  "mode": "retrieval_plus_graph"
}
```
- Story 7.1 does not own this endpoint's routing (that's Epic 8/Core API's orchestration call into the AI service) but owns the generation logic invoked once evidence resolution (Epic 6) has completed inside the AI service for this request.

**Events:** None — this pipeline is synchronous request/response within a single SSE-backed chat turn, not event-driven.

**Business Rules**
- BR (from BRD §8.4): "the system shall answer using only information found within the selected scope... not from the AI model's general knowledge." Enforced by prompt design + evidence-only construction (this story) and re-enforced by verification (Story 7.2).
- BR (Architecture §1 principle 2): LLM provider must be swappable without a code change — a config-value switch only.
- BR (Architecture §4.1): the evidence package Story 7.1 receives has already been scope-bounded to `workspace_id` and `resolvedDocumentIds` upstream (Epic 6/8) — Story 7.1 must not re-broaden scope, e.g. must not let the LLM "fill in" from training data about entities it recognizes (like a real company name) — this is exactly the hallucination risk the whole epic exists to prevent.

**Validation**
- Evidence package must not be empty when constructing the prompt; if it is empty, skip straight to Story 7.3's not-found path rather than calling the LLM at all (saves a wasted call and removes any chance of the model improvising).
- `mode` must be one of the two documented enum values; reject/ log anything else (defensive — Epic 6/8 should never send an invalid mode, but Epic 7 should not silently accept one).

**Error Handling**
- LLM provider timeout/failure → do not crash the request; return a system-level error distinct from "not found" (a not-found is a *correct* answer about the documents; a provider failure is an *infrastructure* failure) so Epic 8 can surface it differently (e.g. "answer generation temporarily unavailable" vs. "not found in your documents").
- Malformed/unparseable draft answer from the provider (e.g. missing claim-to-evidence tags) → treat as a failed generation attempt with one retry, then fall back to the not-found path rather than pass an unverifiable draft to Story 7.2.

**Security**
- No new authn/authz surface — this runs inside the already-authenticated request chain (Core API validated the user/workspace membership before calling the AI service; AI service re-validates `workspaceId` per `05_api_specs.md` §10, "defense-in-depth on top of the Core API's own scope check").
- The evidence package must never include content the caller isn't scoped to — Story 7.1 must not query anything itself; it only uses what Epic 6 handed it, which is itself already scope-bounded.

**Audit / Logging**
- Log (structured, per Epic 10 conventions once available): `requestId`, `sessionId`, `mode`, evidence-item count, provider used, generation latency. Do **not** log full evidence text or full answer text at INFO level (sensitivity: BRD §15 data-sensitivity is still an open item) — log at DEBUG only, gated by environment.

**Testing**
- Unit: prompt builder produces evidence-only prompt with no leaked general-knowledge instructions; provider selection switches correctly via config with no code branch elsewhere.
- Integration: with a fixture evidence package containing 0 relevant items → generation is skipped and control passes to not-found path (7.3), not to the LLM.
- Integration: with a fixture evidence package containing an out-of-scope fact injected on purpose → confirm the draft answer, even before verification, does not incorporate it if the prompt was scoped correctly (defense-in-depth check, complements 7.2's verification test).

---

### Story 7.2 — Claim verification against evidence + graph

**Business Requirement**
Even a well-prompted LLM can hallucinate. The system must independently check every factual claim in the draft answer against the actual evidence and the knowledge graph before the answer is trusted (BRD §8.3, §10.1) — this is the mechanism the whole POC's accuracy hypothesis is measured against (BRD §4, Exit Criterion 1).

**Acceptance Criteria** (verbatim)
- AC1. Each factual claim in the answer is checked against the evidence and the graph before being returned.
- AC2. Unsupported claims are stripped or the whole answer is downgraded to "not found."

**Technical Interpretation**
- AC1 requires decomposing the draft answer into discrete factual claims (using the claim-to-evidence tagging produced in Story 7.1) and, for each claim, confirming: (a) the cited evidence passage actually contains/supports that claim (text-level check), and (b) when `mode = retrieval_plus_graph`, the claim is consistent with the graph — i.e. it does not conflict with a `CONTRADICTS` relationship or an unrelated graph fact for the same entity within the current scope (Epic 5 Story 5.4's contradiction query, called here, not re-implemented here).
- AC2 requires a deterministic policy: if a claim fails verification, either (a) remove just that claim/sentence and re-check the answer still reads coherently and is still substantively responsive, or (b) if removing it guts the answer's usefulness (e.g. it was the only concrete fact requested), downgrade the entire answer to "not found" (Story 7.3) rather than return a partial, potentially misleading answer.

**Implementation**
1. Parse the draft answer into a list of `(claimText, citedEvidenceId)` pairs, per the tagging scheme from 7.1.
2. For each claim: fetch the cited evidence item's raw text (from the evidence package, not a re-query) and run a text-entailment-style check ("does this passage support this claim?").
3. When `mode = retrieval_plus_graph`: for claims involving entities/dates/amounts, cross-check against the graph — query Epic 5's contradiction-detection logic (Story 5.4) bounded to the same `workspace_id`/`resolvedDocumentIds` as the current chat scope (never re-widen scope during verification — this is the same isolation guarantee from Architecture §1 principle 6, now applied at generation time, not just retrieval time).
4. Aggregate a per-claim `supported: true/false` result and an overall confidence score (e.g. proportion of claims supported, weighted by centrality to the answer).
5. Apply the AC2 policy: strip unsupported claims; if the remaining answer is empty, near-empty, or no longer answers the question, hand off to Story 7.3.
6. Attach confidence and pass the (now-verified) answer + its surviving claim→evidence links downstream, ready for Epic 8 to turn each into a persisted `ANSWER_CITATION` row.

**Components**
- `ClaimVerificationService` (AI Service) — orchestrates claim decomposition, text-entailment check, and graph cross-check.
- `GraphContradictionClient` — thin client into Epic 5's Story 5.4 contradiction-detection Cypher query (Epic 7 does not implement Cypher itself here — it calls the existing scope-bounded query).
- `EvidenceTextMatcher` — the text-level "is this claim supported by this passage" check (can be a smaller/cheaper LLM call, a lightweight NLI model, or a rule-based lexical overlap check for the POC — see ASSUMPTION below).

**Database**
- **Reads (via Epic 5's existing query, not new SQL/Cypher written by this story):** `:DateFact`, `:Amount` nodes and `CONTRADICTS` edges in Neo4j, bounded by `workspace_id` and the resolved document/module scope (`04_db_mapping_and_er_diagram.md` §3).
- **Writes:** none. Verification is a pure check step; persistence of the final message/citations remains Epic 8's responsibility (`CHAT_MESSAGE`, `ANSWER_CITATION` tables).

**APIs:** None new — this is an internal step inside the same `/internal/ai/chat/answer` handler as Story 7.1; no separate HTTP surface.

**Events:** None.

**Business Rules**
- BR (BRD §8.3): "use the knowledge graph, in addition to standard text search, when answering a question — using it to check that an answer's facts and relationships are actually supported by the documents." This story is the literal implementation of that sentence.
- BR (Architecture §9): "Every answer must be traceable: citations always resolve to the source-faithful text representation, never directly to an LLM-generated summary." Enforced here by requiring every surviving claim to keep its link to a real evidence item, never to the model's own prose.
- BR (workspace isolation, Architecture §1 principle 6 / DB doc §3 / Story 5.4 AC2): the contradiction check invoked in verification must stay bounded to the current chat session's resolved scope — a contradiction or fact from outside that scope (even same workspace, different module) must not be pulled in, and must never cross a workspace boundary.

**Validation**
- Every claim must have a non-null cited evidence ID before verification runs; a claim generated without one is auto-failed (cannot be verified against nothing) — this also guards against a provider that ignores the tagging instruction from Story 7.1.

**Error Handling**
- Graph query failure (Neo4j unavailable) during a `retrieval_plus_graph` verification → do not silently treat all claims as "supported." Fail closed: either retry once, or downgrade the affected claims to "unsupported" (favoring under-answering over over-trusting, consistent with the accuracy-first NFR).
- If verification cannot complete for any reason, the safe default is always "not found," never "return the unverified draft."

**Security**
- Same workspace/scope boundaries as Story 7.1 — verification must never expand the set of documents/entities considered beyond what the session was scoped to at creation (`05_api_specs.md` §7 strict scope rule).

**Audit / Logging**
- Log per-message: total claims, claims supported, claims stripped, final confidence, whether graph check was used (mode). This is exactly the data Epic 9's evaluation report needs conceptually (though Epic 9 computes correctness against its own expected answers independently) and is valuable for debugging accuracy issues during the POC's tuning phase (BRD §9, Accuracy is highest priority).

**Testing**
- Unit: a claim whose cited evidence text does not actually contain the claimed fact is correctly marked unsupported and stripped.
- Unit: a claim that conflicts with a `CONTRADICTS`-linked graph fact in scope is marked unsupported even if the cited text passage superficially supports it (this is the core "graph catches what text search misses" test case referenced in BRD §10.1).
- Integration (workspace isolation regression, tying to Story 5.4 AC4 / 5.3 AC3): verification for a session scoped to Workspace A must never be influenced by a graph fact that only exists in Workspace B, even for an identically-named entity — this must be an explicit automated test, not an informal check, per `06_backend_epics_and_stories.md` §16 "Summary — what done looks like."
- Integration (module-scope boundary, tying to Story 5.4 AC2 / 6.2 AC4): verification for a session scoped to Module A must not surface a contradiction/fact that only involves a document in Module B of the *same* workspace.

---

### Story 7.3 — "Not found" handling

**Business Requirement**
When the documents genuinely don't contain the answer, the system must say so plainly rather than guess (BRD §8.4, §2 "hallucination"). This is treated as a *correct* outcome, not a failure — the DB schema even marks it as such (`CHAT_MESSAGE.is_not_found`, `04_db_mapping_and_er_diagram.md` notes: "True when the system correctly declines to answer — tracked as its own metric, not a failure").

**Acceptance Criteria** (verbatim)
- AC1. When evidence is insufficient, response explicitly states the question can't be answered from the documents.

**Implementation**
1. Triggered from three possible upstream points: (a) Story 7.1 found the evidence package empty/irrelevant before ever calling the LLM, (b) Story 7.1's draft generation failed and retried unsuccessfully, or (c) Story 7.2's verification stripped so much of the draft that nothing substantive remains.
2. Produce a standard not-found response object: `{ "isNotFound": true, "reason": "No supporting evidence found in the selected documents.", "confidence": null }` — matching the SSE `done` event contract exactly (`05_api_specs.md` §7).
3. Pass this object downstream to Epic 8 exactly as it would pass a normal verified answer — Epic 8's streaming/persistence logic must handle both shapes uniformly (no special-casing needed beyond the `isNotFound` flag and null `confidence`).

**Components**
- `NotFoundHandler` (AI Service) — small, stateless; converts any of the three trigger conditions above into the single canonical response shape.

**Database**
- No direct writes. `CHAT_MESSAGE.is_not_found = true` and `confidence = null` are persisted by Epic 8 when it writes the message row, using the value this story produced.

**APIs**
- Internal — same `/internal/ai/chat/answer` response, distinguished by `isNotFound: true`. Matches the documented SSE contract:
```
event: done
data: {"messageId": "uuid", "answerMode": "retrieval_plus_graph", "confidence": null, "isNotFound": true, "reason": "No supporting evidence found in the selected documents."}
```

**Business Rules**
- BR (BRD §8.4): "The system shall clearly state when a question cannot be answered from the available documents, rather than guessing." — this story is the direct, literal fulfillment of that requirement.

**Error Handling**
- Distinguish a genuine "not found in the documents" (a *correct*, expected outcome) from an *infrastructure* failure (LLM provider down, DB unreachable) — these must **not** share the same response shape, or Epic 9's hallucination/correctness scoring would be corrupted by conflating "documents don't have it" with "the system broke." (See Story 7.1 Error Handling — infra failures are a distinct error path.)

**Audit / Logging**
- Log every not-found outcome with its trigger reason (empty evidence / generation failure / verification stripped too much) — this breakdown is valuable input for tuning retrieval (Epic 6) vs. generation (Epic 7) during the POC's accuracy-tuning weeks (BRD §16, Week 3–4).

**Testing**
- Unit: empty evidence package → not-found response produced without ever calling the LLM provider (asserted via a mock/spy on the provider call).
- Integration: a genuinely out-of-scope question (BRD's own example: "What's the weather today?" against uploaded contracts, per Story 7.3's sample action) against real/fixture uploaded contracts → `isNotFound: true` with the documented reason string.
- Integration: verify the not-found response is never persisted with a non-null `confidence` (schema-level and application-level check).

---

## 4. END-TO-END FLOW

**Happy path (mode = retrieval_plus_graph):**
```
Epic 8: Chat session (scope resolved) + question
   ↓
Epic 6: Classify → rewrite → vector+keyword+graph search → merge → rerank → balance
   ↓  (evidence package)
Epic 7 / Story 7.1: Build evidence-only prompt → call ModelProvider (Ollama or hosted, per config)
   ↓  (draft answer + claim→evidence tags)
Epic 7 / Story 7.2: Decompose claims → check each against evidence text → check against graph
                     (via Epic 5 Story 5.4, scope-bounded) → strip unsupported claims
   ↓
Supported enough? ──Yes──> attach surviving claim→evidence links as citation candidates
   │                            ↓
   │                       Epic 8: persist CHAT_MESSAGE + ANSWER_CITATION rows, stream via SSE
   │
   └──No / insufficient──> Epic 7 / Story 7.3: build canonical "not found" response
                                ↓
                           Epic 8: persist CHAT_MESSAGE (is_not_found=true), stream via SSE
```

**Validation failure:** an invalid `mode` value reaching Story 7.1 is rejected before any LLM call (defensive; upstream Epic 8/Core API should already prevent this per `05_api_specs.md` scope validation).

**Business failure (evidence present but claims don't hold up):** handled entirely inside Story 7.2 → 7.3, described above — this is the *expected*, designed-for failure mode of the epic, not an edge case.

**Not found:** Story 7.3, as above — a first-class, intentional outcome.

**Unauthorized / scope violation:** not re-checked inside Epic 7 (already enforced at session-creation time by Epic 8 Story 8.5, and re-validated by the AI service boundary per `05_api_specs.md` §10) — Epic 7 trusts the `workspaceId`/`documentIds` it is given but must never widen them during generation or verification (see Story 7.2 Security).

**External failure (LLM provider unreachable/timeout):** Story 7.1 error path — retried once, then surfaced as a distinct infrastructure error, not conflated with "not found" (see Story 7.1 & 7.3 Error Handling).

**Retry:** one retry on a malformed/failed LLM generation call (Story 7.1); no retry on verification logic itself (it's deterministic given its inputs — a retry would produce the same result).

**Rollback / partial failure:** Epic 7 has no DB writes of its own, so there is nothing for Epic 7 to roll back; if verification fails partway, the safe default (not-found) is returned rather than a half-verified answer.

---

## 5. ARCHITECTURE MAPPING

Per `03_architecture.md` §4.2 and `08_epic_interlinking_and_architecture_map.md` §3:

| Component | Responsibility | Input | Output | Dependencies | Business logic | DB interaction | External interaction |
|---|---|---|---|---|---|---|---|
| `AnswerGenerationService` | Build evidence-only prompt, call LLM | Evidence package, question, mode | Draft answer + claim tags | `ModelProviderInterface`, `PromptBuilder` | Evidence-only construction, no general-knowledge fallback | None | LLM provider (Ollama/hosted) |
| `ClaimVerificationService` | Check each claim against evidence + graph | Draft answer, evidence package, mode, scope | Verified answer (claims stripped as needed) + confidence | `GraphContradictionClient`, `EvidenceTextMatcher` | Per-claim support check, strip/downgrade policy | Neo4j read (via Epic 5's query, scope-bounded) | None directly |
| `NotFoundHandler` | Canonicalize the "insufficient evidence" outcome | Trigger reason | `{isNotFound, reason, confidence:null}` | None | Distinguish correct-decline vs. infra failure | None | None |
| `ModelProviderInterface` + impls | Abstract LLM calls | Prompt | Completion | Config (`LLM_PROVIDER`) | Swap without code change | None | Ollama (local) or hosted LLM API |

This exactly mirrors architecture §4.2 nodes **K (Generate)**, **L (Verify)**, **M (Supported? branch)**, **N (Attach citations)**, **O (Not found)** — no redesign; Epic 7 is a direct, unmodified implementation of that flow.

---

## 6. DATABASE IMPLEMENTATION

Epic 7 is **read-mostly / write-none** at the database layer — this is a deliberate architectural property, not an oversight: persistence of the outcome is Epic 8's responsibility, keeping Epic 7 a stateless generation/verification service that Epic 9 can call twice per question without any transactional side effects to worry about.

| Entity | Table/Store | Purpose in this epic | PK | FK | Relevant columns touched | Read/Write |
|---|---|---|---|---|---|---|
| Document Chunk | `DOCUMENT_CHUNK` (Postgres) | Source of evidence passage text, already fetched by Epic 6 — Epic 7 does not re-query it | `id` | `document_id`, `section_id` | `chunk_text`, `page_number` (read via in-memory evidence package, not a fresh query) | None (indirect, via Epic 6's output) |
| DateFact / Amount / relevant graph nodes | Neo4j | Cross-check claims for contradictions | `workspace_id` + business key | — | `CONTRADICTS` edges | Read (via Epic 5 Story 5.4 query, scope-bounded) |
| Chat Message | `CHAT_MESSAGE` (Postgres) | Ultimately stores `answer_mode`, `confidence`, `is_not_found` — Epic 7 *produces* these values | `id` | `session_id` | `answer_mode`, `confidence`, `is_not_found` | Write happens in **Epic 8**, not here — Epic 7 only supplies the values |
| Answer Citation | `ANSWER_CITATION` (Postgres) | Ultimately stores each surviving claim's evidence link — Epic 7 produces the claim→evidence mapping | `id` | `message_id`, `document_id`, `chunk_id` | `page_number`, `section_heading`, `source_excerpt` | Write happens in **Epic 8**, not here |

**No CREATE/UPDATE/DELETE operations are owned by Epic 7.** This is called out explicitly because it is easy for a coding agent to over-scope this epic into writing to `CHAT_MESSAGE`/`ANSWER_CITATION` directly — that would duplicate Epic 8's ownership of those tables (see §12 Shared Components and §11 Cross-Epic Dependencies).

---

## 7. API IMPLEMENTATION

Epic 7 exposes **no public API**. It implements the internal logic behind one internal contract, owned end-to-end by the AI Service and called by Core API's orchestration layer.

### `POST /internal/ai/chat/answer` (internal, not public — `05_api_specs.md` §10)

**Purpose:** Given a question, workspace, resolved document IDs, and mode, return a grounded, verified answer with claim→evidence links (or a canonical not-found result).
**Caller:** Core API's AI Orchestration component (Epic 8's server-side chat-message handler), after Epic 6's retrieval has already run inside the same AI-service request.
**Authentication/Authorization:** Not separately authenticated at this internal boundary (internal service-to-service call within the same trust domain); `workspaceId` is re-validated by the AI service per `05_api_specs.md` §10 as defense-in-depth, not as a new authz mechanism Epic 7 must design.

**Request** (as documented):
```json
{
  "sessionId": "uuid",
  "workspaceId": "uuid",
  "question": "What's different between the termination clauses?",
  "documentIds": ["uuid-1", "uuid-2"],
  "mode": "retrieval_plus_graph"
}
```
*(Note: the evidence package itself is not shown in this documented request shape — it is produced inside the AI service by Epic 6's retrieval step, upstream of Epic 7's handler, within the same internal call. `OPEN QUESTION` below flags this.)*

**Validation:** `mode` ∈ `{retrieval_only, retrieval_plus_graph}`; `documentIds` non-empty (an empty resolved scope should have been rejected earlier by Epic 8's scope resolution, Story 8.5 — Epic 7 does not re-implement that check, only trusts it).

**Business validation:** none beyond what's described in Stories 7.1–7.3 (evidence sufficiency, claim support).

**Processing:** Story 7.1 → 7.2 → 7.3, as described in §4.

**Database operations:** none (see §6).

**Downstream calls:** `ModelProviderInterface` (LLM), Epic 5's contradiction-detection query (Neo4j, via `GraphContradictionClient`).

**Events:** none.

**Response (conceptual — the exact response object is what Epic 8 turns into SSE `token`/`citation`/`done` events, per `05_api_specs.md` §7):**
```json
{
  "answerText": "...",
  "claims": [ { "text": "...", "evidenceId": "chunk-uuid", "supported": true } ],
  "mode": "retrieval_plus_graph",
  "confidence": 0.88,
  "isNotFound": false,
  "reason": null
}
```
or, for the not-found path:
```json
{ "isNotFound": true, "reason": "No supporting evidence found in the selected documents.", "confidence": null, "mode": "retrieval_plus_graph" }
```

**HTTP status:** Internal call — not a public HTTP contract with documented status codes in `05_api_specs.md`. **DESIGN GAP:** the internal contract's response schema is not fully specified in the API doc (only the request is shown). This plan's response shape above is an `ASSUMPTION` derived from the SSE `done` event contract in §7 of `05_api_specs.md`, which Epic 8 clearly needs *something* like this from Epic 7 to build. This should be confirmed/frozen with the team before implementation, since Epic 8 and Epic 7 must agree on it independently of this document.

**Errors:** LLM provider failure → distinct internal error (not the same shape as `isNotFound`); see Story 7.1/7.3 Error Handling.

**Logging / Audit:** see Stories 7.1–7.3 individually.

**Idempotency / Retry / Timeout:** Story 7.1 retries once internally on a malformed generation; no idempotency key is needed since this is a synchronous, non-mutating call (no DB writes to duplicate).

---

## 8. BUSINESS RULES

| ID | Description | Source | Where enforced | Validation | Failure | Test scenarios |
|---|---|---|---|---|---|---|
| BR-701 | Answers must be generated strictly from the provided evidence package — never from the model's general/training knowledge. | BRD §8.4; `01_project_knowledge.md` §1 | `PromptBuilder` (7.1) + `ClaimVerificationService` (7.2, as the enforcement backstop) | Prompt inspection tests; claim-support tests | An unsupported claim reaching the user | See Story 7.1 & 7.2 testing |
| BR-702 | The system must explicitly decline (not guess) when evidence is insufficient. | BRD §8.4 | `NotFoundHandler` (7.3) | Response shape check (`isNotFound: true`) | A guessed answer returned instead of a decline | See Story 7.3 testing |
| BR-703 | The knowledge graph must be used, in addition to text search, to check that facts/relationships are actually supported. | BRD §8.3; Architecture §10.1 | `ClaimVerificationService` graph cross-check (7.2) | Contradiction-query integration test | A claim contradicted by the graph is returned as supported | See Story 7.2 testing (contradiction test case) |
| BR-704 | LLM provider must be swappable via one config value, with no code change elsewhere. | Architecture §1 principle 2 | `ModelProviderInterface` (7.1) | Config-switch integration test | A provider switch requires touching generation/verification logic | See Story 7.1 testing |
| BR-705 | Verification must remain bounded to the current chat session's resolved scope (`workspace_id` + `resolvedDocumentIds`) at all times — never widened during generation or verification. | Architecture §1 principle 6; §4.1; DB doc §3 | `ClaimVerificationService`, `GraphContradictionClient` (7.2) | Cross-workspace and cross-module isolation tests | A fact/contradiction from outside scope influences the answer | See Story 7.2 testing (isolation regression cases) |
| BR-706 | A "not found" outcome and an infrastructure failure must never share the same response shape. | Derived from BRD §8.4 + Epic 9's need for clean accuracy scoring (`06_backend_epics_and_stories.md` §14) | `AnswerGenerationService` error path (7.1) vs. `NotFoundHandler` (7.3) | Distinct-shape assertion test | Epic 9's hallucination/correctness metrics get corrupted by conflating the two | See Story 7.1 & 7.3 testing |

---

## 9. STATE MACHINES

Epic 7 does not own a persisted entity with its own status column (that's `CHAT_MESSAGE`, owned by Epic 8). It does, however, drive a **logical outcome state** for a single answer-generation attempt, which Epic 8 then persists:

```
[Evidence received]
        │
        ▼
  Evidence non-empty? ──No──> [NOT_FOUND: empty_evidence]
        │Yes
        ▼
  Generate draft answer ──(LLM failure after 1 retry)──> [ERROR: generation_failed]  (distinct from NOT_FOUND)
        │success
        ▼
  Verify claims (text + graph, per mode)
        │
        ▼
  Enough claims survive? ──No──> [NOT_FOUND: verification_insufficient]
        │Yes
        ▼
  [ANSWERED: verified, with surviving claims + confidence]
```
- **Trigger:** every inbound `POST /internal/ai/chat/answer` call.
- **Who triggers transitions:** entirely internal to the AI service's synchronous handling of one request — no external trigger, no background job.
- **Database changes:** none inside Epic 7 (see §6) — Epic 8 maps this outcome state onto `CHAT_MESSAGE.is_not_found` / `answer_mode` / `confidence` when it persists the message.
- **Events:** none.
- **Failure behaviour:** any path not explicitly listed above (e.g. an exception inside `ClaimVerificationService`) must fail closed into `[ERROR: generation_failed]`-equivalent, never fall through to `[ANSWERED]` with an unverified draft.

---

## 10. EVENTS AND INTEGRATIONS

**Integrations**

| Source | Target | Purpose | Protocol | Auth | Timeout/Retry | Failure |
|---|---|---|---|---|---|---|
| `AnswerGenerationService` (Epic 7) | LLM Provider (Ollama local, or hosted LLM API) | Generate draft answer | HTTP (provider-specific, abstracted) | Local: none/internal network; Hosted: API key (config-held, never logged) | 1 retry on malformed/failed response; explicit timeout per `09` NFR "first response within a few seconds" | Surfaced as a distinct infra error, not `isNotFound` |
| `GraphContradictionClient` (Epic 7) | Neo4j (via Epic 5's Story 5.4 query) | Cross-check claims for contradictions | Cypher over Bolt (internal, within AI service) | Internal, no separate auth | Fail closed → treat affected claims as unsupported on query failure | See Story 7.2 Error Handling |

**Events:** None produced or consumed by Epic 7 — the whole system, per `05_api_specs.md` and `03_architecture.md`, uses synchronous internal calls + SSE for the chat path, not an async event bus, for this flow. (Redis/Celery is used for document *ingestion* jobs, Epics 1–5, not for the query-time path Epic 7 sits in — see `03_architecture.md` §2, §7.)

---

## 11. CROSS-EPIC DEPENDENCIES

**Epic 7 consumes Epic 6 (Hybrid Retrieval & Reranking)**
- What is consumed: the merged, reranked, evidence-balanced package of text passages + graph facts.
- Contract: an in-process/in-request data structure (evidence package), not a persisted table or public API — both epics run inside the same AI-service request lifecycle.
- Ownership: Epic 6 owns retrieval/ranking; Epic 7 must not re-retrieve or re-rank — it trusts the package it receives.
- Implementation order: Epic 6 must be functionally complete (even if fixture-backed) before Epic 7 can be meaningfully tested end-to-end; both can be *built* in parallel against fixtures from Day 1 (`06_backend_epics_and_stories.md` §4), wired together at **Checkpoint 2**.
- Failure behaviour: if Epic 6 returns an empty evidence package, Epic 7's Story 7.1/7.3 path handles it as "insufficient evidence" — Epic 7 does not treat this as its own error.

**Epic 7 consumes Epic 5 (Knowledge Graph, specifically Story 5.4 — Contradiction Detection)**
- What is consumed: the scope-bounded contradiction-detection Cypher query/result.
- Contract: a query interface bounded by `workspace_id` and (when applicable) the resolved document/module scope — Epic 7 must pass the *same* scope it was given for the chat session, never a broader one.
- Ownership: Epic 5 owns the Cypher/graph logic and the workspace-isolation guarantee at the query level; Epic 7 owns *when and how* the result is used during claim verification.
- Do not duplicate: Epic 7 must not write its own contradiction-detection logic — that would risk a second, inconsistent implementation of the workspace-isolation guarantee that Epic 5 Story 5.3/5.4 was specifically built (and tested) to enforce.
- Implementation order: Epic 5's Story 5.4 should be functionally available (fixture or real) before Story 7.2's graph cross-check can be meaningfully tested; per Epic 7's own AC dependency note (`06_backend_epics_and_stories.md` §12, Story 7.2 "Depends on 7.1, 5.4").

**Epic 8 (Chat API & Citations) consumes Epic 7**
- What is consumed: Epic 7's final answer object (verified answer + claim→evidence links, or the canonical not-found object).
- Contract: the internal response object described in §7 of this plan (flagged as an `OPEN QUESTION`/`ASSUMPTION` needing sign-off, since `05_api_specs.md` only documents the *request* shape of `/internal/ai/chat/answer`, not the response).
- Ownership: Epic 7 owns generation/verification; Epic 8 owns persistence (`CHAT_MESSAGE`, `ANSWER_CITATION`) and SSE streaming — Epic 7 must not attempt to persist or stream anything itself.
- Implementation order: per `08_epic_interlinking_and_architecture_map.md` §1, Epic 8's chat endpoint is built first against a **stub answer generator**, then wired to Epic 7's real output at **Checkpoint 2** — this means Epic 7 can be developed without waiting for Epic 8's SSE plumbing to exist, and vice versa.

**Epic 9 (Evaluation) consumes Epic 7 (indirectly, via the whole query pipeline)**
- What is consumed: the entire Epic 6→7→8 pipeline, called twice per test question (once per mode), per `08_epic_interlinking_and_architecture_map.md` §4.
- Contract: Epic 9 does not call Epic 7 directly — it calls Epic 8's chat endpoint in both modes and records the `answer_mode`/`confidence`/`is_not_found`/correctness that Epic 7 ultimately produced and Epic 8 persisted.
- Ownership: Epic 7 must guarantee that switching `mode` produces a genuinely different evidence-and-verification path (graph check included or excluded) — otherwise Epic 9's A/B comparison (the primary evidence for POC Exit Criterion 1, BRD §4) is not measuring anything real. This is the single most business-critical correctness property this epic must protect.
- Implementation order: Epic 9's harness/scoring logic is built against a stub chat response until **Checkpoint 3**, so it does not block Epic 7's development, but Epic 7's mode-fidelity is a hard prerequisite for Epic 9's output to be meaningful.

```
EPIC 6 (evidence package)
   └── consumed by → EPIC 7 (generate + verify)
EPIC 5 Story 5.4 (contradiction query)
   └── consumed by → EPIC 7 Story 7.2 (verification)
EPIC 7 (answer object)
   └── consumed by → EPIC 8 (persist + stream)
EPIC 6→7→8 (whole pipeline, both modes)
   └── consumed by → EPIC 9 (evaluation, called twice per question)
```

---

## 12. SHARED COMPONENTS

| Component | Owner | Purpose | Contract | Used by | Notes |
|---|---|---|---|---|---|
| `ModelProviderInterface` (Ollama / hosted LLM adapter) | **DESIGN GAP — not explicitly assigned to an epic in `06_backend_epics_and_stories.md`.** `ASSUMPTION`: Epic 7 implements the concrete interface + both provider implementations, since it is the most complex/streaming consumer, and other epics (3, 5, 6) reuse it rather than each building their own LLM client. | Abstract away Ollama vs. hosted LLM API behind one interface, switchable by config (Architecture §1 principle 2) | Python `Protocol`/ABC: `generate(prompt, ...) -> completion` | Epic 3 (classification, field extraction), Epic 5 (`SimpleKGPipeline`'s underlying LLM calls), Epic 6 (question classification), **Epic 7** (answer generation) | This should be confirmed with the team — if another epic is meant to own it, Epic 7 should depend on it rather than build it. Flagging explicitly per this plan's "shared functionality has one owner" requirement. |
| Graph contradiction query (Story 5.4) | **Epic 5** | Detect conflicting `DateFact`/`Amount` values, scope-bounded | Cypher query, bounded by `workspace_id` + resolved scope | Epic 7 (verification), Epic 6 (retrieval's own graph query, a related but separate concern) | Epic 7 calls it; does not re-implement it. |
| Evidence package structure | **Epic 6** | Common shape for reranked/balanced text + graph evidence | In-process data structure (documented informally in Architecture §4.2, not yet a frozen schema — see Open Questions) | Epic 7 (consumes) | Schema should be frozen jointly by Epic 6 and Epic 7 owners before Day 1 fixture-building, since both build against it from Day 1. |
| `CHAT_MESSAGE` / `ANSWER_CITATION` persistence | **Epic 8** | Store the final, verified answer and its citations | `answer_mode`, `confidence`, `is_not_found` columns; `ANSWER_CITATION` rows | Epic 7 (produces the values, does not write them) | Epic 7 must not write to these tables directly — see §6. |

---

## 13. FILE / MODULE IMPLEMENTATION PLAN

**Repository structure is not provided in the source documentation set** (no existing codebase/file-tree document was supplied). Per instruction, file paths below are a **logical proposal** based on the documented tech stack (`03_architecture.md` §7: Python + FastAPI for the AI service) and the component boundaries in §5 above — a coding agent should adapt these to the actual repository layout once available, but the module boundaries and responsibilities themselves should not change.

**CREATE**

`ai-service/app/generation/answer_generation_service.py`
Purpose: Story 7.1 — build evidence-only prompt, call `ModelProviderInterface`, return draft answer + claim tags.
Responsibility: no general-knowledge fallback; mode-agnostic (identical code path for both modes; only the evidence package content differs).
Dependencies: `prompt_builder.py`, `model_provider/*`.

`ai-service/app/generation/prompt_builder.py`
Purpose: assemble the evidence-only system + user prompt from the evidence package.
Responsibility: enforce BR-701 at the prompt-construction level.
Dependencies: evidence package schema (owned jointly with Epic 6 — see §12).

`ai-service/app/generation/model_provider/base.py`
Purpose: `ModelProviderInterface` (Protocol/ABC).
Responsibility: single abstraction point for BR-704.
Dependencies: none.

`ai-service/app/generation/model_provider/ollama_provider.py`
Purpose: local Ollama implementation of `ModelProviderInterface`.
Dependencies: `base.py`, Ollama client library/HTTP call.

`ai-service/app/generation/model_provider/hosted_provider.py`
Purpose: hosted LLM API implementation of `ModelProviderInterface`.
Dependencies: `base.py`, hosted provider's SDK/HTTP client; API key from config (never logged, per §21 Configuration).

`ai-service/app/verification/claim_verification_service.py`
Purpose: Story 7.2 — decompose claims, run text-entailment check, run graph cross-check, apply strip/downgrade policy.
Dependencies: `evidence_text_matcher.py`, `graph_contradiction_client.py`.

`ai-service/app/verification/evidence_text_matcher.py`
Purpose: text-level "is claim supported by this passage" check.
Dependencies: `ModelProviderInterface` (if implemented as a cheap LLM call) or a standalone NLI/lexical component — see `ASSUMPTION` below.

`ai-service/app/verification/graph_contradiction_client.py`
Purpose: thin client wrapping Epic 5's Story 5.4 Cypher query; enforces that the same `workspace_id`/scope is always passed through unmodified.
Dependencies: Epic 5's Neo4j query module (do not duplicate its Cypher).

`ai-service/app/generation/not_found_handler.py`
Purpose: Story 7.3 — canonicalize the insufficient-evidence outcome.
Dependencies: none.

`ai-service/app/internal_api/chat_answer_handler.py`
Purpose: the handler behind `POST /internal/ai/chat/answer`, orchestrating 7.1 → 7.2 → 7.3 in sequence, after receiving Epic 6's evidence package.
Dependencies: `answer_generation_service.py`, `claim_verification_service.py`, `not_found_handler.py`.

**MODIFY**

None identified — Epic 7 is new functionality with no described change to existing components in the source documentation. (No pre-existing codebase files were provided to this planning exercise; this section will need revisiting once the actual repository is available, per the instructions governing this document.)

**DELETE**

None.

---

## 14. METHOD-LEVEL IMPLEMENTATION DETAILS

**`AnswerGenerationService.generate_answer(question, evidence_package, mode, scope)`**
- Purpose: produce a draft, evidence-grounded answer with per-claim evidence tags.
- Inputs: `question: str`, `evidence_package: EvidencePackage`, `mode: Literal["retrieval_only","retrieval_plus_graph"]`, `scope: {workspace_id, resolved_document_ids}`.
- Outputs: `DraftAnswer { text, claims: [{text, evidence_id}] }` or `None` (triggers not-found).
- Preconditions: `evidence_package` has been produced by Epic 6 for this exact `scope`.
- Validation: `mode` is a supported enum value; `evidence_package` is non-empty (else return `None` immediately — do not call the LLM).
- Business logic: build prompt via `PromptBuilder` (evidence-only instruction + tagged evidence items + question) → call `ModelProviderInterface.generate(prompt)` → parse response into `DraftAnswer`, retry once on parse failure.
- Database operations: none.
- External calls: `ModelProviderInterface.generate(...)`.
- Exceptions: `ProviderTimeoutError`, `ProviderUnavailableError` → propagate as a distinct infra error (not not-found).
- Transaction: none (stateless).
- Logging: `requestId`, `mode`, evidence-item count, provider name, latency (see Story 7.1 Audit/Logging).

**`ClaimVerificationService.verify(draft_answer, evidence_package, mode, scope)`**
- Purpose: check every claim, strip unsupported ones, decide supported-enough vs. not-found.
- Inputs: `draft_answer: DraftAnswer`, `evidence_package`, `mode`, `scope`.
- Outputs: `VerifiedAnswer { text, citations: [...], confidence }` or triggers not-found.
- Preconditions: `draft_answer` is non-null (7.1 already screened for empty evidence).
- Validation: every claim has a non-null `evidence_id` (else auto-fail that claim, per Story 7.2 Validation).
- Business logic:
  1. For each claim, call `EvidenceTextMatcher.supports(claim.text, evidence_item.text) -> bool`.
  2. If `mode == retrieval_plus_graph`, call `GraphContradictionClient.check(claim, scope) -> bool` (bounded strictly to `scope`).
  3. A claim is "supported" only if it passes both applicable checks.
  4. Strip unsupported claims; recompute whether the remaining answer is still substantively responsive (a simple heuristic threshold for the POC — e.g. at least one supported claim remains and the question's core ask is still addressed — is acceptable; exact thresholding is an `ASSUMPTION`/tuning parameter, not a fixed business rule from the source docs).
  5. If not substantively responsive, return `None` (triggers `NotFoundHandler`).
- Database operations: Neo4j read via `GraphContradictionClient` (delegates to Epic 5's query — no new Cypher written here).
- External calls: none beyond the above.
- Exceptions: `GraphQueryError` → fail closed (treat affected claims as unsupported, per Story 7.2 Error Handling), do not propagate as if all claims passed.
- Transaction: none.
- Logging: total/supported/stripped claim counts, final confidence, mode (see Story 7.2 Audit/Logging).

**`NotFoundHandler.build(reason: str) -> NotFoundResponse`**
- Purpose: single canonical construction point for the not-found outcome.
- Inputs: `reason` (one of a small fixed set of internal reason codes — empty evidence / generation failed after retry / verification insufficient — mapped to the single user-facing reason string documented in `05_api_specs.md` §7).
- Outputs: `{ isNotFound: true, reason: <user-facing string>, confidence: null }`.
- Preconditions: none.
- Business logic: pure mapping, no branching on anything that could confuse "correct decline" with "infra failure" (see BR-706).
- Exceptions: none expected.
- Logging: internal reason code (for debugging/tuning), distinct from the single user-facing string (for consistency with the documented API contract).

---

## 15. TRANSACTION AND CONSISTENCY

- Epic 7 performs **no database writes**, so there are no transaction boundaries, rollback semantics, or locking concerns owned by this epic.
- **Idempotency:** the internal handler is naturally idempotent — calling it twice with the same question/evidence/mode produces (LLM non-determinism aside) an equivalent verified answer or not-found result, with no side effects to duplicate. This property is exactly what makes it safe for Epic 9 to call the pipeline repeatedly during evaluation without special dedup logic on Epic 7's side.
- **Concurrency:** multiple concurrent chat sessions/questions are independent, stateless invocations of this epic's services — no shared mutable state, no locking required.
- **Consistency with the graph:** the contradiction check (Story 7.2) reads Neo4j at verification time; if the graph is updated (new document processed) between retrieval and verification within the same request, that's a sub-second window in practice for the POC and is not treated as a consistency risk requiring special handling — flagged here as an `ASSUMPTION` given POC scale/NFRs (`02_requirements_and_user_journeys.md` §7: scalability "not a priority").

---

## 16. ERROR HANDLING

| Condition | Error | HTTP status (at internal boundary) | Error code | Message | Logging | Recovery |
|---|---|---|---|---|---|---|
| Evidence package empty | Not an error — expected path | N/A (success response, `isNotFound: true`) | — | "No supporting evidence found in the selected documents." | INFO | None needed — this is correct behavior |
| LLM provider timeout/unreachable | Infra error | 500-equivalent at internal boundary (Core API surfaces its own appropriate status to the client) | `LLM_PROVIDER_UNAVAILABLE` | "Answer generation temporarily unavailable." | ERROR, include provider name, latency-to-failure | Retry once; if still failing, surface distinct error (never mislabel as not-found) |
| Draft answer malformed (missing claim tags) | Generation error | Internal error | `GENERATION_PARSE_FAILED` | Internal only — not surfaced verbatim to user | WARN, include raw response length (not full content, per data-sensitivity caution) | Retry once, then fall back to not-found path |
| Graph query failure during verification | Verification error, fails closed | Internal error, does not propagate as "all supported" | `GRAPH_VERIFICATION_UNAVAILABLE` | Affected claims marked unsupported; may result in not-found | WARN | Fail closed per BR-703/BR-705 intent (accuracy over availability) |
| Claim missing `evidence_id` | Validation error | Internal — claim auto-failed | — | — | DEBUG | Claim stripped; does not fail the whole request unless it guts the answer |
| Invalid/unrecognized `mode` value | Validation error | 400-equivalent at internal boundary | `INVALID_ANSWER_MODE` | Internal only | WARN | Reject before any LLM call |

Cross-cutting principle (BR-706): the table above deliberately keeps "not found" (a correct, expected outcome) structurally and semantically separate from every genuine error row — this must be preserved by whoever implements Epic 8's consumption of Epic 7's output too.

---

## 17. SECURITY

- No new authentication mechanism — this epic runs entirely inside an already-authenticated, already-scope-validated request chain (Core API → AI Service, per `05_api_specs.md` §1, §7, §10).
- **Authorization boundary Epic 7 must respect, not implement:** the `workspace_id` and `resolvedDocumentIds` passed into this epic have already been validated (Epic 8 Story 8.5) to belong to the requesting user's session scope. Epic 7's sole security obligation is to **never widen** that scope during generation or verification (BR-705) — this is the query-time enforcement half of the workspace-isolation guarantee whose write-time half lives in Epic 5 (`03_architecture.md` §1 principle 6).
- **Sensitive data handling:** evidence text and full answer text should not be logged at INFO level (data sensitivity is still an open BRD §15 item) — see Audit/Logging notes throughout §3.
- **LLM provider credentials:** hosted API key held in configuration/secrets management, never logged, never included in prompts sent for debugging.

---

## 18. OBSERVABILITY

- **Logs (structured JSON, per Epic 10 conventions once defined):** `requestId`, `sessionId`, `mode`, evidence-item count, provider used, generation latency, claim counts (total/supported/stripped), final confidence, outcome (`ANSWERED` / `NOT_FOUND` / `ERROR`) and not-found/error reason code.
- **Metrics (useful for the POC's own accuracy-tuning loop, BRD §16 Week 3–4, even though formal metrics infra isn't separately scoped):** not-found rate by mode, claim-strip rate by mode, LLM latency distribution, provider error rate.
- **Correlation:** every log line carries the same `requestId`/`sessionId` used across Epic 6 (retrieval) and Epic 8 (streaming), enabling a single trace across the whole question-answering flow, per Epic 10's cross-cutting logging story (`06_backend_epics_and_stories.md` §15, Story 10.1).
- **Audit events:** the audit entry for "a question was asked and answered" is Epic 8's responsibility (`QUESTION_ASKED`, per Story 10.2) — Epic 7 does not write its own separate audit record, to avoid duplicate/conflicting audit trails.

---

## 19. TEST IMPLEMENTATION PLAN

### Unit Tests
- `PromptBuilder` never includes a general-knowledge instruction; always includes the evidence-only directive.
- `ModelProviderInterface` selection switches correctly on config value with zero code changes elsewhere (parametrized test over both providers).
- `ClaimVerificationService` correctly marks a claim unsupported when its cited text doesn't contain the claim.
- `ClaimVerificationService` correctly marks a claim unsupported when it conflicts with a `CONTRADICTS`-linked graph fact.
- `NotFoundHandler` always returns `confidence: null` and `isNotFound: true`.

### Integration Tests
- End-to-end (within AI service, using fixture evidence): empty evidence → not-found, LLM never called.
- End-to-end: evidence present, all claims verifiable → `ANSWERED` with correct citations mapped back to real evidence items.
- End-to-end: evidence present, some claims fail verification → those claims stripped, answer still returned if substantively responsive.
- End-to-end: evidence present, verification strips essentially everything → downgraded to not-found.
- Mode-fidelity test (business-critical, see §11): running the *same* question/evidence in `retrieval_only` vs. `retrieval_plus_graph` produces a measurably different verification outcome when a graph-only contradiction is planted in the fixture — this is the test that proves Epic 9's A/B comparison will be meaningful.

### API Tests
- N/A as a public contract (internal only) — covered by integration tests against the internal handler directly.

### Event Tests
- N/A — no events produced/consumed by this epic.

### Database Tests
- N/A for writes (epic owns none). Read-path test: `GraphContradictionClient` correctly passes through `workspace_id` + resolved scope unmodified to Epic 5's query (no scope-widening regression).

### End-to-End Tests (cross-epic, at Checkpoint 2 and beyond)
- Real Epic 6 evidence + real Epic 7 generation/verification + real Epic 8 streaming/persistence, for one representative question, both modes.

### Negative Tests
- LLM provider timeout → distinct error surfaced, not conflated with not-found.
- Graph query failure → fails closed (claims marked unsupported), not silently treated as verified.
- Cross-workspace isolation regression (see below).

### Regression Tests
- **Workspace isolation (mandatory, per `06_backend_epics_and_stories.md` §16 "what done looks like"):** two workspaces with an identically-named entity — verification for a Workspace-A-scoped session must never be affected by a Workspace-B graph fact, even indirectly through the contradiction check.
- **Module-scope boundary:** verification for a module-scoped session must not surface a contradiction/fact that only involves a document in a different module of the *same* workspace (mirrors Story 5.4 AC2 / 6.2 AC4 at the generation/verification layer).

| Story | AC | Test | Test Type | Expected Result |
|---|---|---|---|---|
| 7.1 | AC1 | Prompt inspection — no general-knowledge instruction present | Unit | Prompt contains only evidence-only directive + evidence + question |
| 7.1 | AC2 | Provider switch via config, no code change | Unit/Integration | Both providers produce a valid `DraftAnswer` shape from the same interface call |
| 7.1 | AC1 (empty evidence) | Empty evidence package | Integration | LLM never called; control passes to not-found path |
| 7.2 | AC1 | Claim vs. unsupportive text | Unit | Claim marked unsupported |
| 7.2 | AC1 | Claim vs. contradictory graph fact | Unit | Claim marked unsupported despite supportive text |
| 7.2 | AC2 | Answer with some unsupported claims | Integration | Unsupported claims stripped; remaining answer returned if still responsive |
| 7.2 | AC2 | Answer where nothing survives verification | Integration | Whole answer downgraded to not-found |
| 7.3 | AC1 | Out-of-scope question (e.g. "What's the weather today?") against real contracts | Integration | `isNotFound: true` with documented reason string |
| — | Isolation | Cross-workspace identical entity | Integration/Regression | Verification unaffected by other workspace's data |
| — | Isolation | Cross-module (same workspace) contradiction | Integration/Regression | Contradiction from out-of-scope module not surfaced |
| — | Mode fidelity | Same question, both modes, planted graph-only contradiction | Integration | `retrieval_plus_graph` catches it; `retrieval_only` does not |

---

## 20. NON-FUNCTIONAL REQUIREMENTS

| Area | Applicability to Epic 7 |
|---|---|
| Accuracy (BRD §9, highest priority) | This epic is the primary mechanism by which accuracy is protected — verification is mandatory, never bypassed, and both modes must be genuinely comparable (see §11). |
| Performance (BRD §9: "first response within a few seconds for a typical question") | Generation + verification together must fit within this budget alongside Epic 6's retrieval time; provider choice (local Ollama vs. hosted) directly affects this — flagged for tuning, not a fixed number in source docs. |
| Usability | Indirect — Epic 7 must produce answer text and reasons clear enough for Epic 8/UI to present without further rewriting. |
| Security | See §17 — no new surface, scope must never widen. |
| Reliability (BRD §9: "reliably complete a demo run") | LLM provider failure handling (retry once, fail gracefully) directly supports this. |
| Scalability | Not a priority (`02_requirements_and_user_journeys.md` §7) — no special scaling design required for the POC. |
| Auditability | Basic logging only (§18) — full audit trail is Epic 8/10's responsibility, Epic 7 supplies the data. |

---

## 21. CONFIGURATION

- `LLM_PROVIDER` = `ollama` | `hosted` — single switch per Architecture §1 principle 2 / BR-704.
- Ollama-specific: local endpoint URL, model name.
- Hosted-provider-specific: API base URL, API key (secret, never logged), model name.
- Verification thresholds (e.g. minimum supported-claim ratio before downgrading to not-found) — **`ASSUMPTION`**: exact threshold is a tuning parameter, not specified in source docs; should be configurable, not hard-coded, so it can be adjusted during the POC's Week 3–4 accuracy-tuning phase (BRD §16) without a code change.
- Retry count for malformed LLM generation (default: 1, per Story 7.1 implementation) — configurable.
- No queue/topic configuration (no event bus used by this epic).
- No new database configuration beyond what Epics 4/5 already establish for pgvector/Neo4j connectivity, which Epic 7 reuses read-only.

---

## 22. DEPLOYMENT

- No database migration owned by this epic (no new tables/columns).
- Service deployment: part of the existing `ai-service` (FastAPI) container per `03_architecture.md` §6 Docker Compose deployment view — no new service/container required.
- Infrastructure dependency: requires Ollama (if `LLM_PROVIDER=ollama`) or network access to the hosted LLM API to be available at startup/request time; requires Neo4j reachable for graph verification in `retrieval_plus_graph` mode.
- Startup dependency: none beyond the AI service's existing startup sequence (Epic 0 Foundation).
- Backward compatibility: N/A — new functionality, no prior version to remain compatible with in this POC.
- Rollback: stateless service with no DB writes — rollback is a simple container/image rollback, no data migration to reverse.

---

## 23. IMPLEMENTATION ORDER

1. `ModelProviderInterface` + at least one concrete provider (Ollama, since it has no external dependency) — unblocks everything else in this epic.
2. `PromptBuilder` against a hand-built fixture evidence package (Day 1, per `06_backend_epics_and_stories.md` §4 — does not wait for Epic 6).
3. `AnswerGenerationService` (Story 7.1) end-to-end against the fixture.
4. `EvidenceTextMatcher` (text-level claim support check).
5. `GraphContradictionClient` wrapping Epic 5's Story 5.4 query (can be built against a fixture graph before Epic 5 is fully real — same Checkpoint-1/2 pattern).
6. `ClaimVerificationService` (Story 7.2), integrating 4 and 5.
7. `NotFoundHandler` (Story 7.3) — small, can be built alongside or slightly before 6, since 7.1 already needs an empty-evidence path into it.
8. `chat_answer_handler.py` orchestrating 3 → 6 → 7 behind the internal `/internal/ai/chat/answer` contract.
9. Unit tests for each component (can and should be written alongside 1–8, not deferred).
10. Integration tests against fixture evidence + fixture graph (pre-Checkpoint 2).
11. **Checkpoint 2 (Day 8):** wire real Epic 6 evidence package in; wire Epic 7's real output into Epic 8's chat endpoint (replacing Epic 8's stub generator).
12. Post-checkpoint regression suite: isolation tests, mode-fidelity test, end-to-end smoke test.

Dependencies: steps 1–7 have no hard dependency on Epic 6 or Epic 8 being real (fixture-driven, consistent with `06_backend_epics_and_stories.md` §1 "every story...builds against a stub/fixture first"); step 11 is the hard synchronization point with both epics.

---

## 24. CODING AGENT TASK BREAKDOWN

**TASK-701**
Title: Define `ModelProviderInterface` and fixture/test doubles
Depends on: None
Files: `ai-service/app/generation/model_provider/base.py`
Implementation: Define the Protocol/ABC with a single `generate(prompt: Prompt) -> Completion` method; define `Prompt`/`Completion` data classes.
Acceptance: Interface compiles; a trivial in-memory fake implementation satisfies it for use in unit tests.
Tests: Type-check / interface-compliance test for the fake implementation.

**TASK-702**
Title: Implement `OllamaProvider`
Depends on: TASK-701
Files: `ai-service/app/generation/model_provider/ollama_provider.py`
Implementation: Concrete implementation calling local Ollama per Architecture §7/§2.
Acceptance: Given a prompt, returns a `Completion` from a running local Ollama instance (or a mocked HTTP layer in CI).
Tests: Unit test against a mocked Ollama HTTP endpoint.

**TASK-703**
Title: Implement `HostedApiProvider`
Depends on: TASK-701
Files: `ai-service/app/generation/model_provider/hosted_provider.py`
Implementation: Concrete implementation calling the configured hosted LLM API.
Acceptance: Given a prompt, returns a `Completion`; API key read from config/secret, never logged.
Tests: Unit test against a mocked hosted-API HTTP endpoint.

**TASK-704**
Title: Config-driven provider selection
Depends on: TASK-702, TASK-703
Files: `ai-service/app/generation/model_provider/factory.py` (or equivalent DI wiring)
Implementation: Read `LLM_PROVIDER` config value; return the corresponding implementation; no other module branches on provider type.
Acceptance: Switching the config value changes provider with zero code change elsewhere (BR-704).
Tests: Parametrized test over both provider values.

**TASK-705**
Title: `PromptBuilder` (evidence-only prompt construction)
Depends on: None (can run parallel to 701–704)
Files: `ai-service/app/generation/prompt_builder.py`
Implementation: Build system instruction (evidence-only, decline-if-insufficient, tag-claims-with-evidence-id) + serialize evidence package + question.
Acceptance: Output prompt contains no general-knowledge instruction; every evidence item is tagged with a stable ID the model is asked to reference.
Tests: Snapshot/unit test of prompt structure against a fixture evidence package.

**TASK-706**
Title: `AnswerGenerationService` (Story 7.1)
Depends on: TASK-704, TASK-705
Files: `ai-service/app/generation/answer_generation_service.py`
Implementation: Orchestrate empty-evidence short-circuit → prompt build → provider call → parse into `DraftAnswer` with claim tags → 1 retry on parse failure → propagate distinct error on provider failure.
Acceptance: Story 7.1 AC1, AC2 satisfied; empty-evidence path never calls the provider.
Tests: Unit + integration tests per §19.

**TASK-707**
Title: `EvidenceTextMatcher`
Depends on: None (can run parallel)
Files: `ai-service/app/verification/evidence_text_matcher.py`
Implementation: Given a claim and an evidence passage, return supported/not-supported (POC approach — lightweight LLM call, NLI model, or lexical-overlap heuristic; document the chosen approach as an `ASSUMPTION` in code comments since source docs don't prescribe the technique).
Acceptance: Correctly distinguishes a claim that is/isn't textually supported, on a small hand-built test set.
Tests: Unit tests with clearly supported/unsupported claim-passage pairs.

**TASK-708**
Title: `GraphContradictionClient`
Depends on: Epic 5 Story 5.4's query being available (fixture acceptable pre-Checkpoint 1/2)
Files: `ai-service/app/verification/graph_contradiction_client.py`
Implementation: Thin wrapper calling Epic 5's contradiction query, passing `workspace_id` + resolved scope through unmodified — never construct a broader query.
Acceptance: Scope passed to Epic 5's query exactly matches the scope this client received (no widening).
Tests: Unit test asserting scope pass-through fidelity; integration test against fixture graph pre-Checkpoint 1, real graph after.

**TASK-709**
Title: `ClaimVerificationService` (Story 7.2)
Depends on: TASK-706, TASK-707, TASK-708
Files: `ai-service/app/verification/claim_verification_service.py`
Implementation: Per-claim text check + (mode-conditional) graph check → strip unsupported → responsiveness check → return `VerifiedAnswer` or `None`.
Acceptance: Story 7.2 AC1, AC2 satisfied, including workspace/module isolation regression tests.
Tests: Unit + integration + regression tests per §19.

**TASK-710**
Title: `NotFoundHandler` (Story 7.3)
Depends on: None (small, can be built early and reused by both 706 and 709's empty/insufficient paths)
Files: `ai-service/app/generation/not_found_handler.py`
Implementation: Canonical response builder per §14.
Acceptance: Story 7.3 AC1 satisfied; response shape matches the documented SSE `done` event contract fields.
Tests: Unit tests per §19.

**TASK-711**
Title: Internal handler orchestration (`/internal/ai/chat/answer` logic)
Depends on: TASK-706, TASK-709, TASK-710
Files: `ai-service/app/internal_api/chat_answer_handler.py`
Implementation: Sequence 7.1 → 7.2 → 7.3 as described in §4/§14; validate `mode` before any downstream call.
Acceptance: End-to-end fixture test (§19) passes for all documented scenarios (answered, not-found via each trigger, error).
Tests: Full integration suite per §19; this is the task that should be run against Epic 9's stub-response consumer for early Epic 8 integration.

**TASK-712**
Title: Checkpoint 2 wiring
Depends on: TASK-711, and Epic 6's real evidence package + Epic 8's real chat endpoint being ready
Files: wiring/config only — no new business logic
Implementation: Replace fixture evidence package with Epic 6's real output; confirm Epic 8 consumes Epic 7's real output instead of its stub generator.
Acceptance: One real document, one real question, both modes, produces a plausible answer with citations (or a correct not-found) — per `06_backend_epics_and_stories.md` §4, "Run one real question through the real pipeline end-to-end."
Tests: Manual/checkpoint smoke test + the automated integration suite re-run against real components.

---

## 25. EPIC DEFINITION OF DONE

- [ ] Story 7.1 implemented: evidence-only generation, swappable provider (AC1, AC2)
- [ ] Story 7.2 implemented: per-claim text + graph verification, strip/downgrade policy (AC1, AC2)
- [ ] Story 7.3 implemented: canonical not-found response (AC1)
- [ ] All business rules BR-701 through BR-706 implemented and tested
- [ ] No direct database writes introduced by this epic (persistence remains Epic 8's)
- [ ] Internal `/internal/ai/chat/answer` handler orchestrates 7.1→7.2→7.3 correctly, including the mode-agnostic code-path guarantee needed for Epic 9's A/B comparison
- [ ] Error handling implemented: infra failures distinct from not-found outcomes (BR-706)
- [ ] Security: scope never widened during generation/verification (BR-705)
- [ ] Logging implemented per §18, with sensitive content gated below INFO level
- [ ] Audit: none owned here by design — confirmed Epic 8 covers `QUESTION_ASKED`
- [ ] Unit tests implemented for every component in §13/§24
- [ ] Integration tests implemented for every scenario in §19, including workspace-isolation and mode-fidelity regression tests
- [ ] Checkpoint 2 wiring completed and verified against real Epic 6 evidence and real Epic 8 consumption
- [ ] Cross-epic dependencies verified: Epic 5 Story 5.4 query reused (not duplicated); Epic 6 evidence package contract honored; Epic 8 response contract honored
- [ ] Architecture compliance verified against `03_architecture.md` §4.2 flow (K–O)
- [ ] No critical open questions remain unresolved (see §26) before Checkpoint 2

---

## 26. OPEN QUESTIONS

- **OPEN QUESTION:** The internal `/internal/ai/chat/answer` response schema is documented only partially in `05_api_specs.md` §10 (request shown, response not). This plan assumes a response shape derived from the SSE `done` event contract (§7 of the same doc) — needs sign-off jointly with Epic 8's owner before implementation, since both epics depend on agreeing this contract independently.
- **OPEN QUESTION:** The evidence package's exact schema (produced by Epic 6, consumed by Epic 7) is described narratively in `03_architecture.md` §4.2 but not formally specified as a data contract anywhere in the provided docs. Should be frozen jointly by Epic 6 and Epic 7 owners on Day 1, since both build against fixtures of it immediately.
- **OPEN QUESTION:** The exact technique for `EvidenceTextMatcher` (Story 7.2's text-level claim-support check) is not specified in any source document — options include a small/cheap LLM call, a lexical-overlap heuristic, or a dedicated NLI model. Left as an implementation choice; should be confirmed with the team, especially given the "zero-spend goal" noted in `01_project_knowledge.md` decision #12 (Azure Document Intelligence rejection) — a technique with per-call cost implications (e.g. a second hosted-LLM call per claim) should be evaluated against that constraint.
- **OPEN QUESTION:** The exact threshold for "substantively responsive after stripping" (used to decide strip-and-return vs. downgrade-to-not-found, Story 7.2 AC2) is not specified numerically anywhere in the source docs — treated as a tunable config value (§21), but the initial default should be agreed with QA/Evaluator stakeholders before Epic 9's baseline evaluation run, since it directly affects the correctness/hallucination metrics that are POC Exit Criterion 1's evidence.

## 27. ASSUMPTIONS

- **ASSUMPTION:** Epic 7 owns the concrete `ModelProviderInterface` implementation (Ollama + hosted), since no epic in `06_backend_epics_and_stories.md` is explicitly assigned this cross-cutting component, and Epic 7 is its most complex consumer (see §12, flagged as a DESIGN GAP for team confirmation).
- **ASSUMPTION:** `EvidenceTextMatcher`'s technique is an implementation detail left open by the source docs (see Open Questions) — this plan does not prescribe one, to avoid inventing an unstated requirement.
- **ASSUMPTION:** The "substantively responsive" threshold for Story 7.2 AC2's strip-vs-downgrade decision is a tunable parameter, not a fixed rule, consistent with the POC's Week 3–4 accuracy-tuning intent (BRD §16) — no fixed default is asserted here as a requirement.
- **ASSUMPTION:** Graph-verification latency and LLM-provider latency together must fit within the BRD §9 "first response within a few seconds" target, but no fixed millisecond budget per stage is specified in source docs, so none is invented here.
- **ASSUMPTION:** Epic 7 has no independent audit-log-writing responsibility — Epic 8's Story 10.2 `QUESTION_ASKED` audit entry is assumed to cover the "a question was asked and answered" audit requirement end-to-end, per BRD §9 "basic logging of uploads, questions, and answers."

## 28. DESIGN GAPS

- **DESIGN GAP:** No epic explicitly owns the shared `ModelProviderInterface`/provider-adapter component, even though Architecture §1 principle 2 clearly requires it and at least four epics (3, 5, 6, 7) depend on an LLM call of some kind. This plan assigns it to Epic 7 as the most defensible owner but flags it for explicit team confirmation to avoid duplicate implementations across epics (violating the "shared functionality has one owner" principle).
- **DESIGN GAP:** The internal AI-service response schema for `/internal/ai/chat/answer` is not fully specified in `05_api_specs.md` (only the request is documented) — see Open Questions.
- **DESIGN GAP:** The evidence package's formal schema (Epic 6 → Epic 7 contract) is not written down as a data contract anywhere in the provided documentation set, only described narratively — see Open Questions.

## 29. RISKS

- **Risk:** Mode-fidelity failure — if `retrieval_only` and `retrieval_plus_graph` accidentally share more logic than intended (e.g. the graph check silently runs in both modes, or evidence-package construction differs for reasons unrelated to the graph), Epic 9's A/B comparison stops being a fair test, undermining POC Exit Criterion 1 (BRD §4) — the single most consequential risk this epic carries. *Mitigation:* the mode-fidelity integration test in §19 must be treated as P0, not optional.
- **Risk:** LLM provider latency/availability (especially if GPU access is unresolved per BRD §15 Open Items) could blow the "few seconds" performance NFR and destabilize the live demo (BRD §9, §4 Exit Criterion 2). *Mitigation:* swappable provider (BR-704) plus a hosted-API fallback path, already designed into Architecture §6/§7.
- **Risk:** Verification threshold mistuning (too strict → excessive false "not found"; too lenient → hallucinations leak through) directly affects the accuracy numbers used as evidence for the funding decision. *Mitigation:* keep the threshold configurable (§21, §26) and tune during BRD §16 Week 3–4, using Epic 9's own comparison report as feedback.
- **Risk (shared with Epic 5/6):** any bug in scope pass-through during verification (BR-705) is a *silent correctness failure* exactly as characterized in `03_architecture.md` §9 — "worse than a missed feature." *Mitigation:* the isolation regression tests in §19 are mandatory, not optional, per `06_backend_epics_and_stories.md` §16.
- **Risk:** Team-availability risk carried over from BRD §14 ("mixed skill coverage across Java, Python/AI, and frontend in a small team") applies directly here — Epic 7 requires Python/AI depth (prompt engineering, claim verification design) and is senior-recommended; if senior bandwidth is consumed disproportionately by Epic 5/6, Epic 7 could be the epic that slips, given its position late in the query pipeline and its Checkpoint-2 dependency on both.

---
*This plan corresponds to Epic 7 in `06_backend_epics_and_stories.md` §12 and the Epic 7 boxes in `08_epic_interlinking_and_architecture_map.md` §3, §5. It should be read alongside the Master System Implementation Plan and the Epic 5, 6, and 8 plans for full cross-epic context.*
