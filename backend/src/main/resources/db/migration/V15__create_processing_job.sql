CREATE TABLE processing_job (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES document (id),
    stage VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
