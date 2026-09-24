-- Story 4.2b (Epic 4). Next Flyway version after V22.
-- pg_trgm is a Postgres contrib extension. No new columns.
-- The existing simple-config tsvector GIN index is left unchanged.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_document_chunk_chunk_text_trgm
    ON document_chunk
    USING gin (chunk_text gin_trgm_ops);
