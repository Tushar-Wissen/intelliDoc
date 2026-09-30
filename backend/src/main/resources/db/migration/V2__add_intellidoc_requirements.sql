-- ============================================================
-- INTELLIDOC POST-V1 REQUIREMENTS
--
-- This migration consolidates the changes that were previously
-- present in V2, V3 and V4.
-- ============================================================


-- ============================================================
-- 1. ADD MODULES JSON TO ANALYSIS RESULTS
-- ============================================================

ALTER TABLE analysis_results
    ADD COLUMN modules_json TEXT;


-- ============================================================
-- 2. ADD WORKSPACE ID TO DOCUMENTS
-- ============================================================

ALTER TABLE documents
    ADD COLUMN workspace_id VARCHAR(100);


-- ============================================================
-- 3. CREATE FOLDERS TABLE
-- ============================================================

CREATE TABLE folders (
                         id VARCHAR(64) PRIMARY KEY,

                         workspace_id VARCHAR(100) NOT NULL,

                         name VARCHAR(255) NOT NULL,

                         status VARCHAR(50) NOT NULL,

                         created_at TIMESTAMP WITH TIME ZONE NOT NULL,

                         updated_at TIMESTAMP WITH TIME ZONE,

                         CONSTRAINT uk_folder_workspace_name
                             UNIQUE (workspace_id, name)
);


-- ============================================================
-- 4. ADD FOLDER ID TO DOCUMENTS
-- ============================================================

ALTER TABLE documents
    ADD COLUMN folder_id VARCHAR(64);


-- ============================================================
-- 5. ADD ACTUAL UPLOADED FILE NAME
-- ============================================================

ALTER TABLE documents
    ADD COLUMN file_name VARCHAR(255);


-- ============================================================
-- 6. DOCUMENT -> FOLDER FOREIGN KEY
-- ============================================================

ALTER TABLE documents
    ADD CONSTRAINT fk_documents_folder
        FOREIGN KEY (folder_id)
            REFERENCES folders(id);


-- ============================================================
-- 7. INDEXES
-- ============================================================

CREATE INDEX idx_folders_workspace_id
    ON folders(workspace_id);


CREATE INDEX idx_documents_workspace_id
    ON documents(workspace_id);


CREATE INDEX idx_documents_folder_id
    ON documents(folder_id);