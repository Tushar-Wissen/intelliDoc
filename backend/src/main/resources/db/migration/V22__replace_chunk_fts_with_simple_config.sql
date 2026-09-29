-- Story 4.2 (Epic 4). V13 created a GIN index with the english text-search
-- config. English stemming and stop-word removal do not reliably match exact
-- identifiers such as SA-2026-014. The simple config keeps those tokens.
-- No new columns. Replaces the existing index expression only.
DROP INDEX IF EXISTS idx_document_chunk_chunk_text_fts;

CREATE INDEX idx_document_chunk_chunk_text_fts
    ON document_chunk
    USING gin (to_tsvector('simple', chunk_text));
