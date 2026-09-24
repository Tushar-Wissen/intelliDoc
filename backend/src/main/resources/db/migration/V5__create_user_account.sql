-- password_hash is not listed on the published ERD; required for Story 0.4 login.
-- Unique email is an engineering default so login-by-email is well-defined.
CREATE TABLE user_account (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenant (id),
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_user_account_email UNIQUE (email)
);

CREATE INDEX idx_user_account_email ON user_account (email);
