-- Embedding dimension is not specified in the ERD. BGE-M3 (architecture §7) is 1024.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunk (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES document (id),
    section_id UUID REFERENCES document_section (id),
    page_number INTEGER,
    chunk_text TEXT NOT NULL,
    embedding vector(1024),
    token_count INTEGER
);

CREATE INDEX idx_document_chunk_embedding_hnsw
    ON document_chunk
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_document_chunk_chunk_text_fts
    ON document_chunk
    USING gin (to_tsvector('english', chunk_text));
