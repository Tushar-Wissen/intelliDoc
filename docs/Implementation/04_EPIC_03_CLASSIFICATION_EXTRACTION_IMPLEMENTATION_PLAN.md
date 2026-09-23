# 04_EPIC_03_CLASSIFICATION_EXTRACTION_IMPLEMENTATION_PLAN.md
### Epic 3 — Classification & Field Extraction

> Source priority: BRD > `03_architecture.md` > `04_db_mapping_and_er_diagram.md` > `05_api_specs.md` > `06_backend_epics_and_stories.md`. Depends on Epic 2 (chunks) and the orchestrator established there. **One significant DESIGN GAP found and resolved by scope extension, flagged explicitly below — not silently invented.**

---

## 1. Epic Overview

**Epic ID:** 3
**Epic Name:** Classification & Field Extraction
**Business Objective:** Automatically figure out what kind of document was uploaded and pull out the facts a business user actually cares about, without requiring a pre-built template per document type.
**Business Problem:** Manually reading every document to find dates, parties, and obligations is exactly the pain BRD §2 describes; this epic is the core of "automatic document understanding."
**Scope:** Document-type classification, universal field extraction, type-specific field extraction, field review/correction, field export.
**Out of Scope:** Knowledge graph construction (Epic 5 consumes this epic's output but builds the graph itself), retrieval/chat (Epic 6/7/8).
**Actors:** Business User (reviews/corrects fields, exports); the orchestrator (triggers this epic automatically).
**Dependencies:** Epic 2 (chunk text to classify/extract from); Epic 0 (schema, auth for the correction/export endpoints, since those *are* user-facing).

In plain language: this is where the system reads a document and tells you "this is a contract, signed by Acme Corp and Beta Ltd, effective January 1st, with a 30-day termination notice" — instead of you reading all 18 pages yourself.

---

## 2. Requirement Traceability

| BRD Requirement (§8.2, verbatim) | Story | AC | Component |
|---|---|---|---|
| "The system shall automatically identify the type of each uploaded document... without the user specifying it in advance." | 3.1 | AC1–AC2 | `classification.py` |
| "The system shall generate a short overview and summary for each document." | **3.1 (extended — see DESIGN GAP below)** | — | `classification.py` |
| "The system shall extract universal fields present in most documents: title, parties/organisations involved, key dates, monetary amounts, reference numbers, and key topics." | 3.2 | AC1–AC3 | `extraction.py` |
| "The system shall extract additional fields relevant to the specific type of document detected..." | 3.3 | AC1–AC2 | `extraction.py` |
| "The system shall record, for every extracted field, where it came from (document, page) and a confidence level." | 3.2 | AC2 | `EXTRACTED_FIELD` schema |
| "The system shall let a user review, correct, or remove an extracted field." | 3.4 | AC1–AC2 | `FieldController` |

**DESIGN GAP (significant, resolved here):** the BRD requires overview/summary generation, `04_...md` has `document.overview`/`document.summary` columns for it, and `03_...md` §3.2's diagram shows it as pipeline node J — but **no story in `06_backend_epics_and_stories.md` Epic 3 (3.1–3.5) explicitly implements it.** This is a real gap between the BRD, the ERD, the architecture diagram, and the actual backlog. Resolution used in this plan: fold overview/summary generation into Story 3.1's implementation, since it's the same LLM call point (classify + summarize can share one prompt for efficiency) — **this expands Story 3.1's scope beyond its two published ACs**, flagged here rather than silently added, and `06_...md` should be updated to reflect it (an explicit "AC3" for Story 3.1 covering overview/summary is the clean fix).

---

## 3. Story-by-Story Implementation Plan

### Story 3.1 — Document type classification (extended to include overview/summary — see §2 DESIGN GAP)

**Business Requirement:** BRD §8.2 bullets 1 and 2.

**Acceptance Criteria** (verbatim, plus the extension noted above):
- AC1. Returns one of the supported types (contract, proposal, financial report, policy, other) with a confidence score.
- AC2. Low-confidence classifications (< 0.5) are flagged, not silently accepted.
- **AC3 (added, not in original story — see §2).** Generates a short overview and a summary for the document, populating `document.overview`/`document.summary`.

**Technical Interpretation:** AC1's type list is exactly 5 values (`contract, proposal, financial_report, policy, other`) — this is the authoritative list; the earlier, broader informal list from pre-BRD exploration (invoice, investment memo, marketing report, BRD/spec) is **not** in scope per the actual backlog AC, and is not reintroduced here even though it appeared in earlier project conversation. AC2's `< 0.5` threshold is an explicit, already-decided number — no ambiguity here, unlike Epic 2's OCR threshold.

**Implementation:** `classification.classify_and_summarize(document_id) -> ClassificationResult`. One LLM call (or two, if summary quality benefits from separation — **ASSUMPTION §27**, source docs don't specify single vs. dual call) against the document's full chunk text (or a representative subset, if the document exceeds the model's context window — **OPEN QUESTION §26**, no truncation/chunked-classification strategy is specified for long documents).

**Components:** `pipeline/classification.py`.

**Database:** `DOCUMENT` update — `document_type`, `classification_confidence`, `overview`, `summary`.

**APIs:** None directly (internal pipeline stage) — but the *result* is exposed read-only via Epic 1's `GET /documents/{documentId}` (already specified in `05_...md` §5, which includes `overview`/`summary`/`documentType`/`classificationConfidence` in its example response).

**Events:** None.

**Business Rules:** BR-301 (low-confidence flagging, see §8).

**Validation:** Result must be schema-validated against the 5-value enum — an LLM response outside that set is a hard failure, not silently accepted as a 6th type (consistent with BRD §8.2's "extraction returns structured JSON... never free text," which is stated for Story 3.2 but applies equally here).

**Error Handling:** Malformed/unparseable LLM response → retry once (ASSUMPTION, standard resilience pattern, not specified in source docs), then `processing_status = FAILED` if still malformed.

**Security:** No new surface.

**Audit/Logging:** Classification confidence logged for every document — this becomes evaluation-relevant data later (Epic 9 compares accuracy across runs).

**Testing:** Per `06_...md`'s sample: classify a sample contract → `documentType: "contract"`, `classificationConfidence: 0.93`.

---

### Story 3.2 — Universal field extraction

**Business Requirement:** BRD §8.2 bullets 3 and 5.

**Acceptance Criteria** (verbatim):
- AC1. Extracts title, parties, key dates, amounts, reference numbers, topics for every document type.
- AC2. Each field stores `source_page`, `source_chunk_id`, and `confidence`.
- AC3. Extraction returns structured JSON (schema-validated), never free text.

**Technical Interpretation:** "For every document type" means this story runs regardless of what Story 3.1 classified — universal fields are extracted even for `document_type: "other"`. AC2's `source_chunk_id` requirement means this extraction must operate per-chunk (or at least track which chunk each fact came from), not as one blind full-document LLM call with no traceability — this is the mechanism that makes field-level citations possible later.

**Implementation:** `extraction.extract_universal_fields(document_id) -> List[FieldResult]` — iterates relevant chunks, extracts candidate fields with page/chunk provenance, schema-validates the LLM's JSON output against a fixed field schema (title, parties[], dates[], amounts[], reference_numbers[], topics[]).

**Components:** `pipeline/extraction.py`.

**Database:** `EXTRACTED_FIELD` insert, one row per extracted fact, `field_category = "universal"`, `status = "AI_GENERATED"` (per `04_...md` table notes — this status enum is fully documented, unlike some other gaps in this project).

**APIs:** Results exposed via `GET /documents/{documentId}/fields` (`05_...md` §6).

**Events:** None.

**Business Rules:** BR-302 (mandatory provenance, see §8).

**Validation:** Schema-validated JSON per AC3 — reject/retry on malformed output, same pattern as Story 3.1.

**Error Handling:** A field the model can't confidently locate is simply omitted, not returned with a null value (consistent with Story 3.3's AC2 principle, applied here too even though not explicitly stated for 3.2 — an inference from the sibling story's stated pattern, flagged as ASSUMPTION §27).

**Security:** No new surface.

**Audit/Logging:** Field count + average confidence per document, logged for evaluation purposes.

**Testing:** Per `06_...md`'s sample: extract from a signed service agreement → `Effective Date: 2026-01-01 (confidence 0.97, page 1)`, `Parties: Acme Corp, Beta Ltd`.

---

### Story 3.3 — Document-type-specific field extraction

**Business Requirement:** BRD §8.2 bullet 4.

**Acceptance Criteria** (verbatim):
- AC1. Contract → obligations, termination terms. Financial report → revenue, forecasts. Etc. (per BRD table).
- AC2. Fields not applicable to a type are simply omitted, not returned as null noise.

**Technical Interpretation:** "Per BRD table" refers to a type→fields mapping that exists in the pre-BRD exploratory chat document (proposal→customer/offering/price; contract→parties/duration/obligations/termination/penalties; financial report→period/revenue/profit/EBITDA/debt/forecasts; policy→not explicitly detailed anywhere) — **the current formal BRD text only gives two worked examples (contract, financial report) explicitly**; the full mapping for `proposal` and `policy` types is **not formally specified in the current BRD**, only implied by the older exploratory document, which is context, not the approved requirement source per this project's own source-priority rules. **OPEN QUESTION §26:** what are the exact type-specific fields for `proposal` and `policy`? Using the older chat document's suggestions as a *starting point* would be reasonable engineering judgement, but should be confirmed, not silently treated as approved scope.

**Implementation:** `extraction.extract_type_specific_fields(document_id, document_type) -> List[FieldResult]` — a type→field-schema lookup, dispatching to a type-specific prompt/schema.

**Components:** `pipeline/extraction.py` (same module as 3.2, different function).

**Database:** `EXTRACTED_FIELD` insert, `field_category = "{document_type}_specific"`.

**APIs:** Same as 3.2 — `GET /documents/{documentId}/fields`.

**Events:** None.

**Business Rules:** BR-303 (no null-noise, see §8).

**Validation:** Same schema-validation discipline as 3.2, scoped to the type-specific schema.

**Error Handling:** Same pattern as 3.2.

**Security:** No new surface.

**Audit/Logging:** Same as 3.2.

**Testing:** Per `06_...md`'s sample: financial report → `Revenue`, `EBITDA`, `Forecast Period` present; no `Termination Terms` field.

---

### Story 3.4 — Field review & correction API

**Business Requirement:** BRD §8.2 bullet 6.

**Acceptance Criteria** (verbatim):
- AC1. `PATCH /fields/{id}` updates value and sets `status: CORRECTED`.
- AC2. `DELETE /fields/{id}` removes a field, keeping an audit record of who removed it.

**Technical Interpretation:** AC1 is a standard update. **AC2 has a gap** (see §28): `EXTRACTED_FIELD.corrected_by` (FK to `user_account`) is the only field capturing "who," but there's no timestamp column tracking *when* a correction/removal happened beyond `created_at` (which is the *creation* time, not the modification time), and Epic 10's audit trail (Story 10.2) is explicitly scoped to "uploads, questions, and answers" only — field corrections/removals are not in that story's documented scope either. This story implements what the schema and API spec actually support (`corrected_by` populated on both PATCH and DELETE), but "keeping an audit record" as a full audit-trail concept is only partially satisfiable with what's currently defined.

**Implementation:** `FieldController.patch()`, `.delete()`; `FieldService` (in Core API, not AI Service — this is a user-facing CRUD endpoint, consistent with Core API owning "everything with a clear owner, a status" per Master Plan §5, unlike the AI-driven extraction itself).

**Components:** `core-api/.../field/FieldController.java`, `FieldService.java`, `ExtractedFieldRepository.java`.

**Database:** `EXTRACTED_FIELD` update (`field_value`, `status`, `corrected_by`) on PATCH; update (`status = "REMOVED"`, `corrected_by`) on DELETE — a **soft** removal (status change), not a hard row delete, since `04_...md`'s `REMOVED` enum value only makes sense if the row persists to be marked as such.

**APIs:** `PATCH /fields/{fieldId}`, `DELETE /fields/{fieldId}` (`05_...md` §6).

**Events:** None.

**Business Rules:** BR-304 (see §8).

**Validation:** Field must exist and belong to a document the caller's workspace membership permits access to (reuses Epic 1's membership pattern, traversed through `document.workspace_id`).

**Error Handling:** Nonexistent field → `404`. Correcting an already-`REMOVED` field → **not specified**, treated as allowed (a removed field can be un-removed by correcting it — ASSUMPTION §27, not stated either way in source docs).

**Security:** Standard JWT + workspace membership (via the field's parent document).

**Audit/Logging:** `corrected_by` is the closest thing to an audit trail this story has, per the gap noted above.

**Testing:** Per `06_...md`'s sample: `PATCH /fields/{id} {"fieldValue":"45 days","status":"CORRECTED"}` → field value updates, `GET` shows `status: CORRECTED`.

---

### Story 3.5 — Field export

**Business Requirement:** Not a formal BRD §8 "shall" statement — sourced from the MVP scope list in the earlier project exploration ("Export extracted fields as CSV/JSON") and carried into the backlog as P1.

**Acceptance Criteria** (verbatim):
- AC1. `GET /documents/{id}/fields/export?format=csv|json` returns all fields in the requested format.

**Technical Interpretation:** Straightforward — reuse Story 3.2/3.3/3.4's data (whatever the current state of `EXTRACTED_FIELD` is, including corrections, excluding `REMOVED` fields — **ASSUMPTION §27**, not explicitly stated whether removed fields are included in export; excluding them is the more defensible default since they were explicitly removed by a user).

**Implementation:** `FieldController.export()` — query all fields for a document, serialize to CSV or JSON per the `format` param.

**Components:** Same controller/service as 3.4.

**Database:** `EXTRACTED_FIELD` read-only query.

**APIs:** `GET /documents/{documentId}/fields/export?format=csv|json` (`05_...md` §6).

**Events:** None. **Business Rules:** None beyond the exclusion assumption above. **Validation:** `format` must be `csv` or `json`, else `400`. **Error Handling:** standard. **Security:** same membership check. **Audit/Logging:** not required. **Testing:** per `06_...md`'s sample — CSV export, one row per field, columns matching name/value/confidence/source page.

---

## 4. End-to-End Flow

```
orchestrator (Epic 2 hand-off, EXTRACTING status already set)
 ↓
classification.classify_and_summarize(document_id)      — Story 3.1
 ↓ (success)
extraction.extract_universal_fields(document_id)         — Story 3.2
 ↓ (success)
extraction.extract_type_specific_fields(document_id, type) — Story 3.3
 ↓ (success)
orchestrator hands off to Epic 4/5 (both consume this epic's output, in parallel — see §11)
```

**Failure branches:** malformed LLM JSON on any stage → retry once → `FAILED` if still malformed (§3). A `< 0.5` confidence classification (AC2) does **not** halt the pipeline — it's a flag for the user to review, not an error state; extraction proceeds using whatever type was returned, even if low-confidence, since "other" is always a valid fallback and blocking the pipeline over uncertainty would contradict BRD §8.2's "without a person having to build a template first" philosophy.

**Correction flow (user-facing, synchronous, no pipeline involvement):**
```
User ↓ PATCH /fields/{id}
FieldController → FieldService → ExtractedFieldRepository → DB update → 200 response
```

---

## 5. Architecture Mapping

| Component | Responsibility | Input | Output | DB Interaction |
|---|---|---|---|---|
| `classification.py` | Type + confidence + overview/summary | Chunk text | `DOCUMENT` fields | Update |
| `extraction.py` | Universal + type-specific fields | Chunk text + `document_type` | `EXTRACTED_FIELD` rows | Insert |
| `FieldController`/`Service` (Core API) | Review, correct, export | HTTP request | Field object(s) | `EXTRACTED_FIELD` read/update |

Maps to `03_architecture.md` §2's `EXTRACT["Classification + Field Extraction"]` box (AI Service side) and the field-correction endpoints living in Core API per Master Plan §5's ownership split (AI-driven generation vs. Core API's CRUD/status layer).

---

## 6. Database Implementation

**`DOCUMENT`** (update only, no new rows) — `document_type`, `classification_confidence`, `overview`, `summary` written by Story 3.1.

**`EXTRACTED_FIELD`** — PK `id`, FK `document_id`, `source_chunk_id`, `corrected_by`. Columns: `field_name`, `field_category`, `field_value`, `confidence`, `source_page`, `status` (`AI_GENERATED | CONFIRMED | CORRECTED | REMOVED`, per `04_...md`). Created by 3.2/3.3 (`AI_GENERATED`), updated by 3.4 (`CORRECTED`/`REMOVED`).

**Note on `CONFIRMED`:** this status value exists in the schema but **no story or API endpoint in any source document ever sets it** — only `PATCH` (→`CORRECTED`) and `DELETE` (→`REMOVED`) exist; there's no "confirm as-is" endpoint. **OPEN QUESTION §26:** is `CONFIRMED` meant to be reachable via some endpoint not yet documented, or is an unmodified `AI_GENERATED` field implicitly treated as confirmed by the absence of correction? Not decided here.

**READ:** `GET /documents/{id}/fields`, `.../export` — filtered by `document_id`, scoped through workspace membership.
**UPDATE:** per 3.4.
**DELETE:** none (soft-delete via `status = REMOVED` only, per §3 Story 3.4 interpretation).

---

## 7. API Implementation

### `PATCH /fields/{fieldId}`
Caller: authenticated workspace member. Request: `{"fieldValue": string, "status": "CORRECTED"}`. Validation: field exists, caller has access via the field's document's workspace. Processing: update `field_value`, `status`, `corrected_by = current_user_id`. Response: `200`, updated field. Errors: `404`, `403`.

### `DELETE /fields/{fieldId}`
Same auth/validation. Processing: `status = "REMOVED"`, `corrected_by = current_user_id` (soft-delete, per §3/§6 note). Response: `200` or `204` (**not specified which** in `05_...md`, ASSUMPTION `200` with the updated field for consistency with PATCH).

### `GET /documents/{documentId}/fields/export?format=csv|json`
Caller: authenticated workspace member. Response: `200`, `Content-Type` matching the requested format, file download. Errors: `400` (invalid format), `404` (document not found).

*(`GET /documents/{documentId}/fields` was already fully specified in `05_...md` §6 — no new detail needed beyond what's already there.)*

---

## 8. Business Rules

**BR-301:** Classification confidence below `0.5` must be flagged, not silently accepted. Source: BRD §8.2 (implied by Story 3.1 AC2's explicit threshold). Enforced in: `classification.py` (sets a flag/low-confidence indicator alongside the result — **the exact mechanism for "flagging" isn't specified**: is it a boolean column, a UI-only concern, or does it block anything? **OPEN QUESTION §26**).

**BR-302:** Every extracted field must carry `source_page`/`source_chunk_id`/`confidence` — no field without provenance. Source: BRD §8.2 bullet 5. Enforced in: `extraction.py`'s schema validation (a field missing provenance is rejected before insert, not inserted with nulls).

**BR-303:** Fields not applicable to a document type are omitted, never returned as null. Source: BRD §8.2 (Story 3.3 AC2). Enforced in: `extraction.py`'s type-specific extraction only requests fields relevant to the detected type.

**BR-304:** Only the field's own value/status can be modified via correction — `document_id`, `source_page`, `source_chunk_id` are immutable (an engineering-judgement default: allowing a user to reassign a field's source would break the citation/provenance guarantee that BR-302 establishes — not explicitly stated in source docs, but a direct logical consequence of BR-302).

---

## 9. State Machines

**`EXTRACTED_FIELD.status`:**
```
(created) --[3.2/3.3 insert]--> AI_GENERATED
AI_GENERATED --[3.4 PATCH]--> CORRECTED
AI_GENERATED --[3.4 DELETE]--> REMOVED
CORRECTED --[3.4 DELETE]--> REMOVED
CORRECTED --[3.4 PATCH again]--> CORRECTED (re-correction, allowed)
??? --[undocumented]--> CONFIRMED   ← unreachable in the current API surface, see §6
```

---

## 10. Events and Integrations

None — no event bus, no external integrations.

---

## 11. Cross-Epic Dependencies

| Dependency | Dependent Epic | Providing Epic | Contract |
|---|---|---|---|
| Chunk text | Epic 3 | Epic 2 | `document_chunk` rows |
| `document_type`, `EXTRACTED_FIELD` rows | Epic 5 | Epic 3 | Input to knowledge graph entity extraction |
| `document.overview`/`.summary` | Epic 1 (read path) | Epic 3 | `GET /documents/{id}` already exposes these fields |
| `EXTRACTED_FIELD` correction endpoints | — | Epic 0 (auth), Epic 1 (workspace membership pattern) | Reused, not re-implemented |

**Note:** per `08_epic_interlinking_and_architecture_map.md` §2, Epic 3 and Epic 4 both depend only on Epic 2 and never on each other — confirmed consistent with this epic's plan; nothing here creates a hidden dependency on Epic 4.

---

## 12. Shared Components

Consumes: Auth/membership (Epic 0/1), pipeline orchestrator (Epic 2). Owns: nothing new shared beyond `extraction.py`'s field-schema definitions, which Epic 5 reads as input (documented as a cross-epic dependency above, not a formally "owned" shared component in the Master Plan §12 sense).

---

## 13. File / Module Implementation Plan

**CREATE:**
```
/ai-service/app/pipeline/
  classification.py — classify_and_summarize(document_id)
  extraction.py — extract_universal_fields(document_id), extract_type_specific_fields(document_id, document_type)
  schemas/field_schemas.py — Pydantic schemas per document type (universal + contract + financial_report + proposal + policy)

/core-api/src/main/java/com/pod3/coreapi/field/
  FieldController.java
  FieldService.java
  ExtractedField.java (entity)
  ExtractedFieldRepository.java

/ai-service/tests/pipeline/
  test_classification.py, test_extraction.py
/core-api/src/test/java/com/pod3/coreapi/field/
  FieldServiceTest.java, FieldControllerIntegrationTest.java
```

**MODIFY:** `ai-service/app/pipeline/orchestrator.py` (Epic 2) — add the call to `classification.classify_and_summarize()` and `extraction.extract_*` after `EXTRACTING` status is set.

---

## 14. Method-Level Implementation Details

### `classification.classify_and_summarize(document_id) -> ClassificationResult`
1. Load chunk text for the document (all chunks, or a representative subset if over context limit — OPEN QUESTION §26).
2. Call LLM with a schema-constrained prompt requesting `{documentType, confidence, overview, summary}`.
3. Validate response against the 5-value type enum.
4. If confidence `< 0.5`, set a low-confidence flag (mechanism TBD, §8 BR-301).
5. Update `DOCUMENT` row.
6. On malformed response: retry once, then raise (caught by orchestrator → `FAILED`).

### `extraction.extract_universal_fields(document_id) -> List[FieldResult]`
1. Load chunks.
2. Call LLM per chunk (or batched) requesting schema-constrained universal fields with page/chunk provenance.
3. Validate each field against the universal schema (BR-302 — reject any field missing provenance before insert).
4. Bulk-insert `EXTRACTED_FIELD` rows, `field_category="universal"`, `status="AI_GENERATED"`.

### `extraction.extract_type_specific_fields(document_id, document_type) -> List[FieldResult]`
1. Look up the field schema for `document_type` (contract/financial_report have BRD-documented schemas; proposal/policy schemas are the OPEN QUESTION §26 item).
2. Same extraction/validation/insert pattern as universal fields, `field_category="{document_type}_specific"`.

### `FieldService.correctField(fieldId, newValue, userId) -> ExtractedField`
1. Load field, verify workspace access via `field.document.workspace_id` membership.
2. Update `field_value`, `status="CORRECTED"`, `corrected_by=userId`.
3. Save, return.

### `FieldService.removeField(fieldId, userId) -> ExtractedField`
Same pattern, `status="REMOVED"`.

---

## 15. Transaction and Consistency

Classification and extraction each commit independently (same pattern as Epic 2 — partial pipeline progress is preserved on failure, not rolled back as one giant transaction). Field correction/removal are simple single-row updates, no special transaction handling needed. No concurrency concern at POC scale for simultaneous corrections to the same field (last-write-wins, not explicitly guarded — ASSUMPTION §27).

---

## 16. Error Handling

| Condition | Result | HTTP Status (if API) |
|---|---|---|
| Malformed LLM classification response | Retry once, then `FAILED` | N/A (pipeline) |
| Malformed LLM extraction response | Retry once, then `FAILED` | N/A (pipeline) |
| Field not found | — | `404` |
| Non-member access to field's document | — | `403` |
| Invalid export format | — | `400` |

---

## 17. Security

Field correction/export endpoints reuse Epic 0's JWT + Epic 1's workspace-membership pattern, traversed through the field's parent document. No new security surface beyond that.

---

## 18. Observability

Classification confidence and field counts logged per document — this data feeds directly into the accuracy evaluation (Epic 9) as a leading indicator of extraction quality, separate from the retrieval/generation accuracy Epic 9 primarily measures.

---

## 19. Test Implementation Plan

| Story | AC | Test | Type | Expected Result |
|---|---|---|---|---|
| 3.1 | AC1 | Classify sample contract | Integration | `documentType: "contract"`, confidence `0.93` |
| 3.1 | AC2 | Classify an ambiguous fixture | Unit | Confidence `< 0.5` flagged |
| 3.1 | AC3 (extended) | Classify + check `DOCUMENT.overview/.summary` | Integration | Both populated, non-empty |
| 3.2 | AC1–AC3 | Extract from service agreement fixture | Integration | Effective Date, Parties present with page/confidence |
| 3.3 | AC1–AC2 | Extract from financial report fixture | Integration | Revenue/EBITDA present, no Termination Terms |
| 3.4 | AC1 | `PATCH /fields/{id}` | API | Value updates, status `CORRECTED` |
| 3.4 | AC2 | `DELETE /fields/{id}` | API | Status `REMOVED`, `corrected_by` set |
| 3.5 | AC1 | Export as CSV | API | One row per field, correct columns |

---

## 20. Non-Functional Requirements

Accuracy is this epic's core NFR (BRD §9, top priority) — field extraction precision/recall isn't measured by this epic's own tests directly, but is the primary subject of Epic 9's evaluation harness.

---

## 21. Configuration

| Variable | Purpose |
|---|---|
| `CLASSIFICATION_CONFIDENCE_THRESHOLD` | `0.5`, per Story 3.1 AC2 |
| `LLM_MAX_CONTEXT_CHUNKS` | Placeholder for the OPEN QUESTION §26 long-document handling strategy |

---

## 22. Deployment

No new infrastructure — same `ai-service` container, same Core API deployment as prior epics.

---

## 23. Implementation Order

1. `field_schemas.py` (universal + contract + financial_report; proposal/policy pending §26 resolution).
2. `classification.py` — Story 3.1 (can build against fixture chunk text immediately).
3. `extraction.py` — Stories 3.2, 3.3 (depend on 3.1's `document_type` for 3.3 specifically; 3.2 runs regardless of type).
4. Core API `FieldController`/`Service` — Story 3.4 (depends on `EXTRACTED_FIELD` rows existing, can be built against fixture rows).
5. Story 3.5 (export, P1) — depends on 3.4's infrastructure.
6. Wire orchestrator call at Checkpoint 1.

---

## 24. Coding Agent Task Breakdown

**TASK-301** Title: Field schemas (Pydantic). Depends on: None. Files: `schemas/field_schemas.py`.
**TASK-302** Title: `classification.classify_and_summarize()`. Depends on: TASK-301, fixture chunks. Acceptance: Story 3.1 AC1–AC3.
**TASK-303** Title: `extraction.extract_universal_fields()`. Depends on: TASK-301. Acceptance: Story 3.2 AC1–AC3.
**TASK-304** Title: `extraction.extract_type_specific_fields()`. Depends on: TASK-302, TASK-303. Acceptance: Story 3.3 AC1–AC2.
**TASK-305** Title: Core API `ExtractedField` entity + repository. Depends on: Epic 0 schema.
**TASK-306** Title: `FieldController`/`Service` PATCH/DELETE. Depends on: TASK-305. Acceptance: Story 3.4 AC1–AC2.
**TASK-307** Title: Export endpoint. Depends on: TASK-306. Acceptance: Story 3.5 AC1.
**TASK-308** Title: Wire orchestrator call to classification+extraction. Depends on: TASK-302–304, Epic 2 complete.
**TASK-309** Title: Full test suite.

---

## 25. Epic Definition of Done

- [x] Stories 3.1–3.5 implemented (3.1 with the noted scope extension)
- [x] ACs implemented, extension flagged
- [x] Business rules BR-301–304 implemented
- [x] Database changes implemented
- [x] APIs implemented (correction, export)
- [ ] Events — N/A
- [x] Error handling, logging, tests implemented
- [x] Cross-epic dependencies verified
- [ ] No critical open questions remain — **5 remain open** (§26)

---

## 26. Open Questions

- Overview/summary generation has no dedicated story in the backlog — should `06_...md` be updated to add it explicitly to Story 3.1, matching this plan's resolution?
- What are the exact type-specific field schemas for `proposal` and `policy` document types? Only `contract` and `financial_report` have BRD-documented examples.
- Is `CONFIRMED` status ever reachable — is there a missing "confirm" endpoint?
- What is the long-document handling strategy when chunk text exceeds the LLM's context window?
- What exactly does "flagging" a low-confidence classification (BR-301) mean mechanically — a stored flag, a UI-only signal, or something that blocks pipeline progress?

## 27. Assumptions

- Overview/summary generated in the same LLM call as classification.
- Fields lacking provenance are rejected pre-insert, not stored with nulls (inferred from Story 3.3's sibling pattern, applied to 3.2).
- Removed fields are excluded from CSV/JSON export.
- A re-correction of an already-corrected field is allowed.
- Malformed LLM JSON gets one retry before failing the document.

## 28. Design Gaps

- **Significant:** overview/summary generation is required by BRD/ERD/architecture but absent from the actual epic backlog — resolved by extension here, but the source backlog document should be corrected to avoid this surfacing again in a future planning pass.
- Field-level audit trail is incomplete — no modification timestamp, and Epic 10's audit scope doesn't cover field corrections/removals.
- `proposal`/`policy` type-specific field schemas are underspecified relative to `contract`/`financial_report`.

## 29. Risks

- **The overview/summary gap** is low individual risk (easy to fold into an existing call) but is a good example of exactly the kind of drift this whole exercise exists to catch — worth a quick pass checking whether other BRD requirements have similarly fallen through between the BRD and the backlog before Week 2.
- **Extraction accuracy for `proposal`/`policy` types** carries more uncertainty than `contract`/`financial_report` specifically because their field schemas aren't BRD-confirmed — if the evaluation test set (Epic 9) includes either type, expect noisier results there until §26 is resolved.
