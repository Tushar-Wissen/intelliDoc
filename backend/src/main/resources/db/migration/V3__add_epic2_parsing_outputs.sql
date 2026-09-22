-- Epic 2 parsing outputs and processing orchestration

CREATE TABLE IF NOT EXISTS document_page (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    was_ocr BOOLEAN NOT NULL DEFAULT FALSE,
    ocr_confidence DOUBLE PRECISION,
    CONSTRAINT uk_document_page_number UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS document_section (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_section_id VARCHAR(64),
    heading VARCHAR(500) NOT NULL,
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunk (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    section_id VARCHAR(64),
    page_number INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS processing_job (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_document_page_document
    ON document_page(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_section_document
    ON document_section(document_id, start_page);
CREATE INDEX IF NOT EXISTS idx_document_chunk_document
    ON document_chunk(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_processing_job_document
    ON processing_job(document_id, started_at);
