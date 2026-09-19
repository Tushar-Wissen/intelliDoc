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
    document_type VARCHAR(50),
    classification_confidence DOUBLE PRECISION,
    review_required BOOLEAN DEFAULT FALSE,
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

-- 3. Structured AI-extracted fields with source provenance and review status
CREATE TABLE IF NOT EXISTS public.extracted_fields (
    id VARCHAR(64) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    document_id VARCHAR(64) NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    field_name VARCHAR(255) NOT NULL,
    field_value TEXT NOT NULL,
    source_page INTEGER NOT NULL,
    source_chunk_id VARCHAR(64) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AI_GENERATED',
    corrected_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_extracted_fields_document ON public.extracted_fields(document_id);

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

-- Sample initial data for demonstration & testing
INSERT INTO public.documents (id, title, content, status)
VALUES (
    'doc_demo_001',
    'AI Strategy Brief 2026.txt',
    'IntelliDoc provides automated enterprise document summarization, contract entity extraction, and intelligent QA capabilities built on microservices architecture with full observability and Supabase integration.',
    'COMPLETED'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.analysis_results (id, document_id, summary, sentiment, confidence_score, entities_json, key_topics_json)
VALUES (
    'analysis_demo_001',
    'doc_demo_001',
    'IntelliDoc enables enterprise automated summarization, entity extraction, and QA via modern microservices architecture.',
    'POSITIVE',
    0.98,
    '["IntelliDoc", "Supabase", "Microservices Architecture"]'::jsonb,
    '["Enterprise AI", "Document Summarization", "Microservices"]'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs (id, event_type, service_name, details)
VALUES (
    'audit_demo_001',
    'SYSTEM_BOOTSTRAP',
    'Supabase DB Initializer',
    'Centralised Supabase schema initialized with demo data'
) ON CONFLICT (id) DO NOTHING;
