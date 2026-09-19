CREATE TABLE chat_message (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_session (id),
    role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    answer_mode VARCHAR(64),
    confidence DOUBLE PRECISION,
    is_not_found BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL
);
