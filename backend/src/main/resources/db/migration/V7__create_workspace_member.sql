CREATE TABLE workspace_member (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspace (id),
    user_id UUID NOT NULL REFERENCES user_account (id),
    role VARCHAR(64) NOT NULL
);
