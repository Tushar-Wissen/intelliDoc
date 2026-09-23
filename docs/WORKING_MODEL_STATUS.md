# IntelliDoc Working Model Status

**Branch:** `feature/pod3-working-model`
**Environment:** Local Docker Compose only; no GitHub push or `main` merge

## Complete Epic 2 Working-Model Boundary

The current working model demonstrates the R&D document's first end-to-end slice:

1. A user selects a PDF, DOCX, or image in the frontend.
2. The browser sends the file to the AI extraction service.
3. The extractor reads native text when it is reliable and routes weak pages to OCR.
4. The extractor returns ordered text with page provenance and extraction method.
5. The extractor emits normalized pages, logical sections, and bounded chunks.
6. The frontend sends normalized text plus extraction metadata to the existing backend JSON upload endpoint.
7. The backend persists the document, pages, sections, and chunks before invoking analysis.
8. The backend records parsing, extraction, indexing, and failure stages in `processing_job`.
9. The user sees the document as `READY` in the vault and can ask a grounded question.
10. Matching answers include source excerpts and page numbers; unsupported questions return not found.

## Implemented Components

- `POST /api/v1/extract` for deterministic page-routing tests.
- `POST /api/v1/extract/file` for PDF, DOCX, PNG, JPG, and TIFF uploads.
- Native PDF text extraction with pypdf.
- DOCX paragraph, heading, and table extraction with python-docx.
- Structure-aware sections and bounded chunks with page traceability.
- PDF/image OCR path with PyMuPDF, Pillow, and PaddleOCR 3.x / PP-OCRv6 confidence scores in Docker.
- Provider-neutral OCR adapter with explicit Tesseract fallback for local recovery.
- PostgreSQL persistence for `document_page`, `document_section`, and `document_chunk`.
- Processing orchestration records in `processing_job` with `PARSING`, `EXTRACTING`, `INDEXING`, and `FAILED` stages.
- Spring Boot JSON document persistence and analysis integration.
- Frontend file upload and pasted-text upload flows.
- Page-aware Q&A citations and explicit not-found responses.
- Empty initial vault for fresh PostgreSQL volumes.

## Validation

- AI service regression suite: 9 tests passing.
- Python and Java edited-file diagnostics: clean.
- PaddleOCR/PaddlePaddle dependencies installed successfully in the AI Docker build.
- Backend Maven test suite: all tests passed after the JPA persistence and processing-job changes.
- Real scanned-image validation exposed a missing `libGL.so.1` runtime dependency; `libgl1` is now included in the AI image.
- First PaddleOCR model download and OCR confidence output require one more Docker-container run after the `libgl1` rebuild.
- Benchmark utility added at `ai-service/scripts/benchmark_selective_ocr.py`.

## Deliberately Remaining Pod 3 Scope

These are not part of the first extraction working model and remain future increments:

- Tenant, user, workspace, and module data model.
- Folder and multi-file upload jobs with asynchronous status tracking.
- Persistent extracted-field tables.
- pgvector and keyword retrieval.
- Neo4j graph storage, workspace-scoped entity resolution, and contradiction checks.
- Retrieval-only versus retrieval-plus-graph evaluation runs.
- Multi-document comparison chat and feedback persistence.
- Production authentication, authorization, malware scanning, and object storage.

## OCR Provider

The Docker working model now uses PaddleOCR 3.x / PP-OCRv6 by default, matching the R&D baseline. Tesseract remains available only by setting `OCR_ENGINE=tesseract` for local recovery; the page/section/chunk contract and persistence model remain unchanged.

## Current Docker Upload Note

The frontend now uses the AI service directly for browser file extraction and then posts normalized text to the backend JSON endpoint. This keeps the working model testable while the separate Spring Boot-to-AI multipart adapter is hardened.