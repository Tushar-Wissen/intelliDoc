CREATE TABLE document_section (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES document (id),
    parent_section_id UUID REFERENCES document_section (id),
    heading VARCHAR(1024),
    start_page INTEGER,
    end_page INTEGER
);
