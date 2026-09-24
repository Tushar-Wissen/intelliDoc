-- Migration for Epic 08 Chat Session Scope and Citations

ALTER TABLE chat_session ADD COLUMN scope_type VARCHAR(32) NOT NULL DEFAULT 'WORKSPACE';
ALTER TABLE chat_session ADD COLUMN scope_module_id UUID REFERENCES document_group (id);

CREATE TABLE chat_session_document (
    session_id UUID NOT NULL REFERENCES chat_session (id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, document_id)
);

CREATE INDEX idx_chat_session_document_document_id ON chat_session_document (document_id);

ALTER TABLE answer_citation ADD COLUMN ordinal INTEGER;

CREATE INDEX idx_chat_message_session_id ON chat_message (session_id);
CREATE INDEX idx_answer_citation_message_id ON answer_citation (message_id);
