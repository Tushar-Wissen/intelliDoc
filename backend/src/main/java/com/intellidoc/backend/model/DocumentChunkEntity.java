package com.intellidoc.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "document_chunk")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentChunkEntity {
    @Id
    private String id;
    @Column(name = "document_id", nullable = false)
    private String documentId;
    @Column(name = "section_id")
    private String sectionId;
    @Column(name = "page_number", nullable = false)
    private int pageNumber;
    @Column(name = "chunk_text", nullable = false, columnDefinition = "TEXT")
    private String chunkText;
    @Column(name = "token_count", nullable = false)
    private int tokenCount;
}