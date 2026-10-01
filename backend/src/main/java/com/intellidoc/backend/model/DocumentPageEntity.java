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
@Table(name = "document_page")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentPageEntity {
    @Id
    private String id;
    @Column(name = "document_id", nullable = false)
    private String documentId;
    @Column(name = "page_number", nullable = false)
    private int pageNumber;
    @Column(name = "raw_text", nullable = false, columnDefinition = "TEXT")
    private String rawText;
    @Column(name = "was_ocr", nullable = false)
    private boolean wasOcr;
    @Column(name = "ocr_confidence")
    private Double ocrConfidence;
}