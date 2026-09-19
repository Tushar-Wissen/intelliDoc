CREATE TABLE document (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id),
    group_id UUID REFERENCES document_group (id),
    file_name VARCHAR(512) NOT NULL,
    file_type VARCHAR(64) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_path VARCHAR(1024) NOT NULL,
    document_type VARCHAR(128),
    classification_confidence DOUBLE PRECISION,
    processing_status VARCHAR(64) NOT NULL,
    overview TEXT,
    summary TEXT,
    uploaded_by UUID NOT NULL REFERENCES user_account (id),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_document_workspace_id ON document (workspace_id);
CREATE INDEX idx_document_group_id ON document (group_id);
