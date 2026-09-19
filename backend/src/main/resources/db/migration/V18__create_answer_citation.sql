CREATE TABLE answer_citation (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_message (id),
    document_id UUID NOT NULL REFERENCES document (id),
    chunk_id UUID NOT NULL REFERENCES document_chunk (id),
    page_number INTEGER,
    section_heading VARCHAR(1024),
    source_excerpt TEXT
);
