CREATE TABLE extracted_field (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES document (id),
    field_name VARCHAR(255) NOT NULL,
    field_category VARCHAR(128),
    field_value TEXT,
    confidence DOUBLE PRECISION,
    source_page INTEGER,
    source_chunk_id UUID REFERENCES document_chunk (id),
    status VARCHAR(64) NOT NULL,
    corrected_by UUID REFERENCES user_account (id),
    created_at TIMESTAMPTZ NOT NULL
);
