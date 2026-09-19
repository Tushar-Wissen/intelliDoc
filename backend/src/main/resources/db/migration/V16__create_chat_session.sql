CREATE TABLE chat_session (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id),
    created_by UUID NOT NULL REFERENCES user_account (id),
    title VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_chat_session_workspace_id ON chat_session (workspace_id);
