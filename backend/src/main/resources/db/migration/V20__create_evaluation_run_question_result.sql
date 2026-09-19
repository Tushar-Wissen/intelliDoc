CREATE TABLE evaluation_run (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    run_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE evaluation_question (
    id UUID PRIMARY KEY,
    evaluation_run_id UUID NOT NULL REFERENCES evaluation_run (id),
    document_id UUID NOT NULL REFERENCES document (id),
    question_text TEXT NOT NULL,
    expected_answer TEXT
);

CREATE TABLE evaluation_result (
    id UUID PRIMARY KEY,
    evaluation_question_id UUID NOT NULL REFERENCES evaluation_question (id),
    mode VARCHAR(64) NOT NULL,
    message_id UUID NOT NULL REFERENCES chat_message (id),
    correct BOOLEAN,
    citation_correct BOOLEAN,
    hallucinated BOOLEAN
);
