CREATE TABLE document_summary (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL UNIQUE REFERENCES document (id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_document_summary_document_id ON document_summary (document_id);

INSERT INTO document_summary (id, document_id, summary, created_at, updated_at)
SELECT gen_random_uuid(), id, summary, created_at, created_at
FROM document
WHERE summary IS NOT NULL AND btrim(summary) <> '';
