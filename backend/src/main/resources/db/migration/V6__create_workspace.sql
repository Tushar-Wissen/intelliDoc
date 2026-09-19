CREATE TABLE workspace (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant (id),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL,
    created_by UUID NOT NULL REFERENCES user_account (id),
    created_at TIMESTAMPTZ NOT NULL
);
