CREATE TABLE document_page (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES document (id),
    page_number INTEGER NOT NULL,
    raw_text TEXT,
    was_ocr BOOLEAN NOT NULL DEFAULT FALSE,
    ocr_confidence DOUBLE PRECISION
);
