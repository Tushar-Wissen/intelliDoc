CREATE TABLE user_feedback (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_message (id),
    extracted_field_id UUID NOT NULL REFERENCES extracted_field (id),
    user_id UUID NOT NULL REFERENCES user_account (id),
    rating VARCHAR(64) NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
