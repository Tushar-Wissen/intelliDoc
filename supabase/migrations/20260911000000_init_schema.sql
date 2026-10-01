-- Supabase Centralised Schema Migration for IntelliDoc System
-- Migration: 20260911000000_init_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text/plain',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Analysis Results Table
CREATE TABLE IF NOT EXISTS public.analysis_results (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    summary TEXT,
    sentiment VARCHAR(30),
    confidence_score DOUBLE PRECISION,
    entities_json JSONB DEFAULT '[]'::jsonb,
    key_topics_json JSONB DEFAULT '[]'::jsonb,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. System Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    event_type VARCHAR(100) NOT NULL,
    service_name VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_doc_id ON public.analysis_results(document_id);

-- Epic 2 parsing outputs: page, section, and traceable structure-aware chunks
CREATE TABLE IF NOT EXISTS public.document_page (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    was_ocr BOOLEAN NOT NULL DEFAULT FALSE,
    ocr_confidence DOUBLE PRECISION,
    UNIQUE (document_id, page_number)
);

CREATE TABLE IF NOT EXISTS public.document_section (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    parent_section_id VARCHAR(64),
    heading VARCHAR(500) NOT NULL,
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.document_chunk (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    section_id VARCHAR(64),
    page_number INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    token_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_page_document ON public.document_page(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_section_document ON public.document_section(document_id, start_page);
CREATE INDEX IF NOT EXISTS idx_document_chunk_document ON public.document_chunk(document_id, page_number);

CREATE TABLE IF NOT EXISTS public.processing_job (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_processing_job_document ON public.processing_job(document_id, started_at);

-- The working model starts with an empty vault. Test documents should be uploaded through the UI.
