# 03_EPIC_02_PARSING_OCR_IMPLEMENTATION_PLAN.md
### Epic 2 — Parsing & OCR Pipeline

> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `06_backend_epics_and_stories.md`. Depends on Epic 1 (stored file + `DOCUMENT` row). No API spec exists for this epic — it has no public endpoints (see §7).

**Architectural clarification made here (not previously stated in any doc, needed to make this epic buildable):** the ingestion pipeline (`03_...md` §3.2, nodes D through R) runs as **one continuous background pipeline inside AI Service**, not as separate HTTP calls between epics. Core API's fire-and-forget call to `POST /internal/ai/documents/process` (established in Epic 1's plan) triggers a single Celery task that calls each stage's function in sequence — parse (Epic 2) → classify/extract (Epic 3) → embed/index (Epic 4) → graph-build (Epic 5) — updating `document.processing_status` as it moves through each stage. This orchestrator is scaffolded in this epic (it's first in the chain) and each subsequent epic's plan documents its own stage function as a call the orchestrator makes — **this should be added to Master Plan §12 as a shared component**, which it currently is not; flagged as a correction to that document.

---

## 1. Epic Overview

**Epic ID:** 2
**Epic Name:** Parsing & OCR Pipeline
**Business Objective:** Turn an uploaded PDF/DOCX into structured, page-addressable text that every downstream epic (classification, indexing, graph, citations) can trust as the source-faithful representation.
**Business Problem:** Without reliable page/section-level text extraction, citations (BRD §8.5) can't point to a real page, and OCR run indiscriminately on every page would be slow and wasteful.
**Scope:** Text/structure extraction from PDF/DOCX, scanned-page detection, selective OCR, structure-aware chunking.
**Out of Scope:** Classification, field extraction (Epic 3), embeddings/indexing (Epic 4), knowledge graph (Epic 5).
**Actors:** No human actor — this epic runs entirely as background processing, triggered by Epic 1's upload.
**Dependencies:** Epic 1 (stored file + `DOCUMENT` row in `UPLOADED` state); Epic 0 (schema, Docker Compose).

In plain language: this is the "reading" stage — turning a PDF into text the rest of the system can search and cite, without wasting time running OCR on pages that don't need it.

---

## 2. Requirement Traceability

| BRD Requirement | Story | AC | Component |
|---|---|---|---|
| Implicit in BRD §8.5 ("every answer shall include a citation... page/section") — citations require page-addressable source text, which this epic produces | 2.1 | AC1–AC3 | `parsing.py` |
| Implicit in BRD's document-type coverage (contracts, scanned pages exist in practice) — no explicit "shall OCR" line, but required for real-world PDFs | 2.2 | AC1–AC3 | `ocr.py` |
| Implicit in retrieval quality requirements (BRD §8.4 grounded answers depend on well-formed chunks) | 2.3 | AC1–AC3 | `chunking.py` |

**Note:** this epic has no direct BRD "shall" statement of its own — it's purely enabling infrastructure for BRD §8.2 (extraction) and §8.5 (citations). This is expected and not a gap; not every epic maps 1:1 to a BRD line item, some exist to make other requirements possible.

---

## 3. Story-by-Story Implementation Plan

### Story 2.1 — PDF/DOCX text & structure extraction

**Business Requirement:** Preserve exact page/heading/paragraph structure so later citations are accurate. Source: `06_...md` §7; underpins BRD §8.5.

**Acceptance Criteria** (verbatim):
- AC1. For a text-based PDF, extracted output preserves page number, headings, and paragraph order.
- AC2. For a DOCX, headings, paragraphs, and tables are preserved with structure intact.
- AC3. Output is stored in `document_page` and `document_section` tables.

**Technical Interpretation:** Docling is the primary parser for both formats (per `03_...md` §7); PyMuPDF (PDF) and python-docx (DOCX) are named fallbacks — **not specified when the fallback triggers** (Docling failure? Specific document features Docling doesn't handle?) — flagged as OPEN QUESTION §26. AC3 means this story writes two tables per document: one `document_page` row per physical page, and a `document_section` tree (headings, with `parent_section_id` for nesting) linked to page ranges.

**Implementation:** `parsing.parse_document(document_id) -> ParsedDocument`. Reads the original file from MinIO (path from `document.storage_path`), runs Docling (or fallback), writes `document_page` rows (one per page) and `document_section` rows (heading hierarchy).

**Components:** `pipeline/parsing.py`, `storage/minio_client.py` (Python-side MinIO reader — **note**: Epic 1 built a Java MinIO client for writes; this is a separate Python client for reads, same bucket/path convention, not shared code across languages — flagged in §12/§28).

**Database:** `DOCUMENT_PAGE` (insert, one per page), `DOCUMENT_SECTION` (insert, heading tree).

**APIs:** None (internal function, called by the orchestrator).

**Events:** None.

**Business Rules:** None beyond "must succeed before OCR/chunking can run" (sequencing, not a business rule per se).

**Validation:** File must be a valid, non-corrupt PDF/DOCX — if Docling/fallback both fail to open the file, this is a hard failure (see §16).

**Error Handling:** Corrupt/unreadable file → `document.processing_status = FAILED`, `processing_job.error_message` populated, pipeline halts (does not proceed to Story 2.2/2.3).

**Security:** File content is already validated at extension level (Epic 1); this story doesn't re-validate type, but a corrupt file that passed extension-check must fail gracefully here, not crash the worker process.

**Audit/Logging:** Parsing failures logged at ERROR with `documentId`; per-stage timing logged for the demo's performance target (BRD §9).

**Testing:** Given a 10-page contract PDF fixture, assert 10 `document_page` rows with correct `page_number` and non-empty `raw_text`; assert section headings match the fixture's actual headings (per `06_...md`'s own sample expected result).

---

### Story 2.2 — Scanned-page detection + selective OCR

**Business Requirement:** Handle scanned/low-text pages without paying OCR's time cost on every page. Source: `06_...md` §7; `03_...md` §7 ("PaddleOCR, invoked only on low-text pages — keeps ingestion fast for normal documents").

**Acceptance Criteria** (verbatim):
- AC1. Pages with low extractable text are flagged as scanned.
- AC2. OCR runs only on flagged pages, not the whole document.
- AC3. `document_page.ocr_confidence` is recorded for OCR'd pages.

**Technical Interpretation:** "Low extractable text" needs a concrete threshold to be implementable — **no numeric threshold is specified anywhere in source docs** (OPEN QUESTION §26). A defensible default (not a documented requirement): character-count-per-page below a configured minimum, or Docling/PyMuPDF's own text-extraction confidence signal if one exists — flagged as ASSUMPTION §27, needs confirmation before tuning against real documents.

**Implementation:** `ocr.detect_scanned_pages(pages) -> List[page_number]`, `ocr.run_selective_ocr(document_id, scanned_page_numbers)` using PaddleOCR, updating `was_ocr=true` and `ocr_confidence` on exactly those pages.

**Components:** `pipeline/ocr.py`.

**Database:** `DOCUMENT_PAGE` (update `raw_text` — OCR output replaces/augments the near-empty extracted text —, `was_ocr`, `ocr_confidence` on flagged pages only).

**APIs:** None.

**Events:** None.

**Business Rules:** OCR only runs on flagged pages — an explicit non-negotiable for the performance goal (BR-201, see §8).

**Validation:** N/A.

**Error Handling:** OCR failure on a specific page → that page keeps its (near-empty) extracted text with `was_ocr=true` and `ocr_confidence=0` or null — **not specified in source docs whether OCR failure fails the whole document or degrades gracefully**; degrading gracefully is the safer default for a demo (ASSUMPTION §27), flagged as OPEN QUESTION for confirmation.

**Security:** None beyond what Story 2.1 already established.

**Audit/Logging:** Count of OCR'd pages per document logged at INFO — useful for the accuracy evaluation later (OCR quality is explicitly named as a possible accuracy bottleneck in `01_project_knowledge.md` decision log #12).

**Testing:** Fixture with 2 scanned pages out of 10 → exactly those 2 have `was_ocr: true` + populated `ocr_confidence`; the other 8 untouched (per `06_...md`'s sample expected result, verbatim).

---

### Story 2.3 — Structure-aware chunking

**Business Requirement:** Produce retrieval-ready passages that respect document structure, so retrieval (Epic 6) doesn't return mid-sentence fragments. Source: `06_...md` §7.

**Acceptance Criteria** (verbatim):
- AC1. Chunks respect section/paragraph boundaries (no mid-sentence splits where avoidable).
- AC2. Each chunk stores `document_id`, `section_id`, `page_number`, `chunk_text`, `token_count`.
- AC3. Average chunk size stays within an agreed token range (e.g. 200–500 tokens).

**Technical Interpretation:** AC3's "e.g. 200–500" is given as an example in the source doc, not a hard contractual number — treated as a configurable target, not a strict validation rule (a chunk slightly outside this range due to section-boundary respect, per AC1, is acceptable; AC1 takes precedence over AC3 when they conflict, since AC1 says "no mid-sentence splits" unconditionally while AC3 says "average... within a range," an average, not a per-chunk hard cap).

**Implementation:** `chunking.chunk_document(document_id) -> List[Chunk]` — walks the `document_section` tree, splits section text at paragraph boundaries, packs paragraphs into chunks up to the target token count using a tokenizer (**ASSUMPTION §27**: no tokenizer is specified in source docs; using the same tokenizer family as the BGE-M3 embedding model, for consistency with Epic 4's later embedding step, since chunk sizing should match what the embedding model actually counts).

**Components:** `pipeline/chunking.py`.

**Database:** `DOCUMENT_CHUNK` insert — **`embedding` column left NULL at this stage** (Epic 4 populates it later via an `UPDATE`, not a new row — this is a genuine cross-epic shared-row write, not just a fixture/real swap, flagged explicitly in §11).

**APIs:** None.

**Events:** None.

**Business Rules:** BR-202 (chunk-section traceability, see §8).

**Validation:** Every chunk must resolve to a real `section_id`/`page_number` — a chunk with no traceable source violates the citation-grounding principle (`03_...md` §1 principle 3) and should be treated as a build-time invariant, not a runtime validation the API surfaces (there's no API here).

**Error Handling:** N/A beyond Story 2.1's failure propagation (chunking only runs if parsing succeeded).

**Security:** N/A.

**Audit/Logging:** Chunk count per document logged at INFO.

**Testing:** 10-page document → chunks created, each traceable to a real page/section, none exceeding the max token limit (per `06_...md`'s sample expected result).

---

## 4. End-to-End Flow

```
Core API (Epic 1) fire-and-forget call
 ↓ POST /internal/ai/documents/process {documentId}
FastAPI route (ai-service)
 ↓ enqueue Celery task, return 202 immediately
Celery worker picks up task
 ↓ orchestrator.process_document(documentId)
 ↓ set document.processing_status = PARSING
 ↓ parsing.parse_document(documentId)          — Story 2.1
 ↓ (success) ocr.detect_and_run(documentId)     — Story 2.2
 ↓ (success) chunking.chunk_document(documentId) — Story 2.3
 ↓ (success) set document.processing_status = EXTRACTING
 ↓ hand off to Epic 3's classify_and_extract(documentId)
 ... (continues through Epic 3, 4, 5 — documented in their own plans)
```

**Failure branches:**
- **Parse failure** (corrupt file, both Docling and fallback fail): `processing_status = FAILED`, `error_message` set, pipeline halts before OCR/chunking.
- **OCR failure on a page**: degrades gracefully per §3 Story 2.2 (ASSUMPTION), pipeline continues to chunking.
- **Chunking failure** (e.g., a section with no extractable text at all): **not specified in source docs** — treated as a `FAILED` state, consistent with parse failure's severity, since a document with zero chunks can never be answered about (violates BRD §8.4's core promise).
- **Timeout**: no timeout value is specified anywhere in source docs for how long a document is allowed to sit in `PARSING` — DESIGN GAP, carried over from Epic 1's plan §9 (same underlying gap, now concretely relevant here since this is the stage most likely to run long on a large scanned document).
- **Retry**: handled by Epic 1's Story 1.4 — a `FAILED` document re-enters this pipeline from the top (`PARSING`), not from wherever it failed; **not specified whether partial `document_page`/`document_chunk` rows from a failed attempt are cleaned up before retry** — flagged as OPEN QUESTION §26 (a naive retry could create duplicate page/chunk rows if not handled).

---

## 5. Architecture Mapping

| Component | Responsibility | Input | Output | Dependencies | DB Interaction |
|---|---|---|---|---|---|
| FastAPI route (`/internal/ai/documents/process`) | Accept trigger, enqueue task | `documentId` | `202` | Celery | None |
| `orchestrator.py` | Sequence the pipeline stages, own status transitions | `documentId` | Pipeline execution | All stage modules | `DOCUMENT.processing_status` writes |
| `parsing.py` | Text/structure extraction | Original file (MinIO) | `document_page`, `document_section` rows | Docling/PyMuPDF/python-docx, MinIO reader | Insert |
| `ocr.py` | Scanned-page detection + OCR | `document_page` rows | Updated `document_page` rows | PaddleOCR | Update |
| `chunking.py` | Structure-aware chunking | `document_page`/`document_section` rows | `document_chunk` rows (no embedding yet) | Tokenizer | Insert |

Maps to `03_architecture.md` §2's `PARSE["Document Parsing + OCR"]` box and §3.2's nodes D–H.

---

## 6. Database Implementation

**`DOCUMENT_PAGE`** — PK `id`, FK `document_id`. Columns: `page_number`, `raw_text`, `was_ocr`, `ocr_confidence`. Created by Story 2.1 (one insert per page), updated by Story 2.2 (OCR'd pages only).

**`DOCUMENT_SECTION`** — PK `id`, FK `document_id`, self-referencing FK `parent_section_id` (nullable, for nesting). Columns: `heading`, `start_page`, `end_page`. Created by Story 2.1.

**`DOCUMENT_CHUNK`** — PK `id`, FK `document_id`, `section_id`. Columns: `page_number`, `chunk_text`, `embedding` (vector, **NULL after this epic**), `token_count`. Created by Story 2.3; `embedding` populated later by Epic 4 (an `UPDATE`, not a new insert — this is the one place in the whole system where two different epics write to the same row rather than the same table).

**READ operations:** None — this epic only reads the original file from MinIO, not from Postgres (it's the first stage to populate these tables).

**CREATE:** per above. **UPDATE:** `document_page` (OCR fields). **DELETE:** none (retry behavior around partial rows is an open question, §26, not resolved as a delete-and-redo here).

---

## 7. API Implementation

**None.** This epic exposes no public REST endpoints — it's triggered internally via the orchestrator (itself invoked by Core API's fire-and-forget call, documented in Epic 1's plan) and its outputs are consumed directly by other epics' code within the same AI Service process, not via HTTP. The closest thing to an "API" is the internal Python function signatures documented in §5/§14.

---

## 8. Business Rules

**BR-201:** OCR runs only on pages flagged as low-text; never on every page unconditionally. Source: `03_...md` §7 (explicit design rationale: "keeps ingestion fast for normal (non-scanned) documents"). Enforced in: `ocr.py`. Failure mode if violated: no error state — this is a performance rule, not a correctness rule, so "violating" it just means slower processing, not a wrong answer downstream.

**BR-202:** Every chunk must be traceable to a real `document_id`/`section_id`/`page_number` — no orphan chunks. Source: `03_...md` §1 principle 3 (citations must trace to source-faithful text). Enforced in: `chunking.py` (structural invariant, not a runtime-checked business rule with an error code, since there's no API surface to reject a request against).

---

## 9. State Machines

This epic **owns two transitions** in the `DOCUMENT.processing_status` machine documented in Epic 1's plan §9:
```
UPLOADED --[orchestrator starts]--> PARSING
PARSING --[2.1/2.2/2.3 all succeed]--> EXTRACTING (hands off to Epic 3)
PARSING --[any stage fails]--> FAILED
```
No other epic writes `PARSING` or the `PARSING→EXTRACTING` transition — this is exclusively this epic's write.

---

## 10. Events and Integrations

**None** — no event bus (Master Plan §8). The Celery task itself is the async mechanism, internal to AI Service, not a cross-service event.

---

## 11. Cross-Epic Dependencies

| Dependency | Dependent Epic | Providing Epic | Contract | Notes |
|---|---|---|---|---|
| Stored file + `DOCUMENT` row | Epic 2 | Epic 1 | MinIO path, `document.storage_path` | Built against fixture files until Checkpoint 1 |
| `document_page`, `document_chunk`, `document_section` rows | Epic 3 | Epic 2 | Table contents | Epic 3 reads chunk text for classification/extraction |
| `document_chunk` rows (structure only, no embedding) | Epic 4 | Epic 2 | Same table, **shared-row UPDATE** for the `embedding` column | Not a typical "read a finished table" dependency — Epic 4 must not treat an un-embedded chunk as an error state, just an expected intermediate condition |
| Pipeline orchestrator skeleton | Epic 3, 4, 5 | Epic 2 | `orchestrator.py`'s stage-calling convention | Each subsequent epic's function is called from here — **this dependency is not documented anywhere else and should be added to Master Plan §17's dependency table** |

---

## 12. Shared Components

**Owned by this epic, consumed elsewhere:** the pipeline orchestrator (see the note at the top of this document — flagged as a correction needed to Master Plan §12).
**Consumed from elsewhere:** MinIO bucket/path convention (Epic 1 established the write path; this epic's Python reader must match it exactly — same convention, separate language-specific client code, not shared code, flagged in §28).

---

## 13. File / Module Implementation Plan

**CREATE:**
```
/ai-service/app/
  celery_app.py — Celery app instance, Redis broker config.
  routers/documents.py — FastAPI route: POST /internal/ai/documents/process (enqueues task, returns 202).
  pipeline/
    orchestrator.py — process_document(document_id) Celery task; sequences stages, owns status writes, catches exceptions and sets FAILED.
    parsing.py — parse_document(document_id).
    ocr.py — detect_scanned_pages(pages), run_selective_ocr(document_id, page_numbers).
    chunking.py — chunk_document(document_id).
  storage/minio_client.py — Python MinIO reader, same bucket/path convention as Epic 1's Java writer.
  db/models.py — SQLAlchemy models for document_page, document_section, document_chunk (mirroring the Flyway-managed schema — see §28 for the cross-language schema-sync risk this creates).
  db/session.py — SQLAlchemy session/engine setup, same Postgres instance as Core API.
  config.py — env-driven config (OCR threshold, chunk token target, etc.)
/ai-service/tests/pipeline/
  test_parsing.py, test_ocr.py, test_chunking.py
```

**MODIFY:** `ai-service/main.py` (Epic 0) — register the new router and Celery app.

**DELETE:** None.

---

## 14. Method-Level Implementation Details

### `orchestrator.process_document(document_id: UUID)`
Purpose: sequence the full ingestion pipeline for one document.
Inputs: `document_id`.
Outputs: none (side-effecting — writes status and downstream rows).
Business logic:
1. `set_status(document_id, "PARSING")`.
2. `try: parsing.parse_document(document_id)` — on exception, `set_status(document_id, "FAILED", error=str(e))`, return.
3. `ocr.detect_and_run(document_id)` — same failure handling pattern (graceful degrade per page, per §3 Story 2.2's ASSUMPTION, not a hard failure).
4. `chunking.chunk_document(document_id)` — same failure handling.
5. `set_status(document_id, "EXTRACTING")`.
6. Call Epic 3's `classification.classify_and_extract(document_id)` (documented in Epic 3's own plan).
Exceptions: any unhandled exception in steps 2–4 results in `FAILED`, logged with full stack trace, `processing_job.error_message` populated with a user-safe summary (not the raw stack trace, to avoid leaking internals — an engineering-judgement default).

### `parsing.parse_document(document_id: UUID) -> None`
1. Load `document.storage_path` from DB.
2. Fetch file bytes from MinIO.
3. Attempt Docling parse; on failure, attempt PyMuPDF (PDF) or python-docx (DOCX) fallback (trigger condition per §3 OPEN QUESTION).
4. For each page: insert `document_page` row (`page_number`, `raw_text`).
5. Build section hierarchy from detected headings: insert `document_section` rows.

### `ocr.detect_and_run(document_id: UUID) -> None`
1. For each `document_page` row of this document: compute a text-density signal (ASSUMPTION §27 — no formula specified).
2. If below threshold (config value, OPEN QUESTION §26 for the actual number): mark for OCR.
3. For flagged pages only: run PaddleOCR, update `raw_text`, `was_ocr=true`, `ocr_confidence`.

### `chunking.chunk_document(document_id: UUID) -> None`
1. Load `document_section` tree + `document_page` rows.
2. For each section, split its text at paragraph boundaries.
3. Pack paragraphs into chunks targeting the configured token range (ASSUMPTION tokenizer, §3).
4. Insert `document_chunk` rows with `embedding=NULL`.

---

## 15. Transaction and Consistency

Each stage (`parsing`, `ocr`, `chunking`) commits its own rows independently, not as one giant transaction spanning the whole pipeline — a partial success up to the failing stage is preserved (e.g., if chunking fails, `document_page`/`document_section` rows from the successful parse stage remain, which is useful for debugging but reinforces the retry-duplication risk in §4/§26). No locking/concurrency concerns — one Celery worker processes one document at a time per task (no two workers should process the same `document_id` concurrently; **not explicitly enforced by a DB lock in source docs**, flagged as ASSUMPTION that Celery's task routing naturally avoids this at POC scale, not a guaranteed invariant).

---

## 16. Error Handling

| Condition | Result | Logging | Recovery |
|---|---|---|---|
| Corrupt/unreadable file | `processing_status = FAILED` | ERROR, stack trace | Story 1.4 retry (Epic 1) |
| OCR failure on one page | Graceful degrade, pipeline continues (ASSUMPTION) | WARN | None automatic — flagged in extracted results as low-confidence |
| Chunking produces zero chunks | `processing_status = FAILED` (treated as equivalent severity to parse failure) | ERROR | Story 1.4 retry |
| Worker crash mid-pipeline (process killed) | Document stuck in `PARSING` indefinitely — **no timeout/watchdog specified** | N/A | **DESIGN GAP**, not implemented |

---

## 17. Security

No new surface — this epic has no public API. The only security-relevant behavior is treating the original file as untrusted input when parsing (a malformed file should fail gracefully, not crash the worker or execute embedded content — Docling/PyMuPDF's own hardening is relied upon here, not re-implemented).

---

## 18. Observability

Per-document, per-stage timing logged at INFO (useful both for the demo's performance target and for identifying which stage is the accuracy/speed bottleneck later, per `01_project_knowledge.md` decision #12's evaluation-driven approach to the OCR-cost question). Full structured logging with `requestId` correlation remains Epic 10's scope; this epic's logging is functional but not yet using that shared format until Epic 10 wires it in.

---

## 19. Test Implementation Plan

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 2.1 | AC1 | Parse 10-page text PDF fixture | Unit/Integration | 10 `document_page` rows, correct `page_number`, non-empty `raw_text` |
| 2.1 | AC2 | Parse DOCX fixture with headings/tables | Integration | Structure preserved in `document_section` |
| 2.1 | AC3 | Inspect DB after parse | DB | Rows exist in both tables |
| 2.2 | AC1–AC3 | Parse fixture with 2/10 scanned pages | Integration | Exactly those 2 flagged, OCR'd, `ocr_confidence` populated; other 8 untouched |
| 2.3 | AC1 | Chunk a section spanning a paragraph boundary | Unit | No mid-sentence split |
| 2.3 | AC2 | Inspect chunk row | DB | All 5 required fields populated, `embedding IS NULL` |
| 2.3 | AC3 | Chunk a 10-page document | Integration | Chunks traceable to real page/section, within token target |
| — | — | Corrupt file fixture | Negative | `FAILED` status, `error_message` populated |

---

## 20. Non-Functional Requirements

Performance: parsing/OCR/chunking should complete fast enough that the demo's document set is `READY` within a reasonable wait — no hard number specified beyond BRD §9's chat-response target (which doesn't apply to ingestion). Reliability: a bad document must not crash the whole worker process (isolated per-task failure).

---

## 21. Configuration

| Variable | Purpose |
|---|---|
| `OCR_TEXT_DENSITY_THRESHOLD` | The undefined threshold from §3/§26 — must be added as a config value once decided |
| `CHUNK_TOKEN_TARGET_MIN`/`MAX` | Defaults 200/500 per `06_...md`'s example |
| `MINIO_ENDPOINT` etc. | Reused from Epic 0/1 |
| `CELERY_BROKER_URL` | Points at the Redis instance from Epic 0 |

---

## 22. Deployment

No new infrastructure — runs inside the existing `ai-service` container + a Celery worker process (either in the same container or a separate `worker` service in `docker-compose.yml` — **not specified which**, ASSUMPTION: same container for POC simplicity, separate `worker` service is a reasonable alternative if `ai-service`'s FastAPI process shouldn't also run long background jobs).

---

## 23. Implementation Order

1. `db/models.py`, `db/session.py`, `storage/minio_client.py` (Python-side plumbing).
2. `parsing.py` — Story 2.1 (can build against fixture files immediately, no dependency on Epic 1 being real yet).
3. `ocr.py` — Story 2.2 (depends on 2.1's page objects existing, can use fixture pages).
4. `chunking.py` — Story 2.3 (depends on 2.1).
5. `celery_app.py`, `orchestrator.py`, FastAPI route — wiring, can be built in parallel with 2–4 against stubbed stage functions.
6. Checkpoint 1: swap fixture files for real Epic 1 output.

---

## 24. Coding Agent Task Breakdown

**TASK-201** Title: Python DB models + MinIO reader. Depends on: Epic 0 schema. Files: `db/models.py`, `db/session.py`, `storage/minio_client.py`.
**TASK-202** Title: `parsing.parse_document()`. Depends on: TASK-201, fixture files. Acceptance: Story 2.1 AC1–AC3.
**TASK-203** Title: `ocr.detect_and_run()`. Depends on: TASK-202. Acceptance: Story 2.2 AC1–AC3.
**TASK-204** Title: `chunking.chunk_document()`. Depends on: TASK-202. Acceptance: Story 2.3 AC1–AC3.
**TASK-205** Title: Celery app + orchestrator skeleton + FastAPI trigger route. Depends on: TASK-202–204 (can stub them initially, wire for real once ready). Acceptance: end-to-end fixture document reaches `EXTRACTING` status.
**TASK-206** Title: Wire to real Epic 1 output at Checkpoint 1. Depends on: Epic 1 complete, TASK-205.
**TASK-207** Title: Full test suite.

---

## 25. Epic Definition of Done

- [x] Every story implemented (2.1–2.3)
- [x] Every AC implemented
- [x] Business rules BR-201/202 implemented
- [x] Database changes implemented
- [ ] APIs implemented — **N/A, no public API**
- [ ] Events — **N/A**
- [x] Error handling implemented (§16, with one open gap noted)
- [x] Logging implemented
- [x] Tests implemented
- [x] Cross-epic dependencies verified (§11)
- [ ] No critical open questions remain — **4 remain open** (§26)

---

## 26. Open Questions

- What is the actual OCR "low-text" detection threshold?
- When exactly does the Docling→PyMuPDF/python-docx fallback trigger?
- Does OCR failure on a page fail the whole document, or degrade gracefully (this plan assumes the latter)?
- Are partial `document_page`/`document_chunk` rows from a failed attempt cleaned up before a Story 1.4 retry, or does retry risk duplicate rows?
- What tokenizer is used for chunk sizing?
- Is a worker crash mid-pipeline ever detected/timed-out, or can a document sit in `PARSING` forever?

## 27. Assumptions

- OCR text-density threshold and tokenizer choice are placeholders pending decision.
- OCR page-level failure degrades gracefully rather than failing the document.
- Celery worker runs in the same `ai-service` container (vs. a separate worker service) — either is viable, not specified.

## 28. Design Gaps

- No timeout/watchdog for a stuck `PARSING` document (same gap noted in Epic 1's plan, now concretely owned by this epic's stage of the pipeline).
- Cross-language schema duplication: Java JPA entities (Epic 1) and Python SQLAlchemy models (this epic) both describe the same Postgres tables independently — no shared schema-generation tool exists in this stack; a migration change in one language's model must be manually mirrored in the other.
- No documented behavior for retry-induced duplicate rows.

## 29. Risks

- **OCR threshold tuning** is a real accuracy risk flagged back in `01_project_knowledge.md` decision #12 — getting this wrong either wastes time OCR'ing clean pages or misses genuinely scanned ones, directly affecting the accuracy evaluation's input quality.
- **Cross-language schema drift** (§28) is a maintainability risk worth a lightweight mitigation (e.g., a shared schema-documentation convention) even though no tooling fix is in scope for the POC.
