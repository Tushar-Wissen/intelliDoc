CREATE TABLE document_group (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_document_group_workspace_name UNIQUE (workspace_id, name)
);
