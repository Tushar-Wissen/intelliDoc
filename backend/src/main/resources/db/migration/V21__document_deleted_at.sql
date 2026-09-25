-- DESIGN GAP (Epic 1 Story 1.4): DOCUMENT has no archive column in 04_db_mapping.
-- Soft-delete uses deleted_at so derived-data cascade can be honored by later epics.
ALTER TABLE document
    ADD COLUMN deleted_at TIMESTAMPTZ;
