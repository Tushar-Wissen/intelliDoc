package com.intellidoc.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "extracted_fields")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExtractedFieldEntity {
    @Id
    @Column(length = 64)
    private String id;
    @Column(name = "document_id", nullable = false, length = 64)
    private String documentId;
    @Column(name = "field_name", nullable = false)
    private String fieldName;
    @Column(name = "field_value", nullable = false, columnDefinition = "TEXT")
    private String fieldValue;
    @Column(name = "source_page", nullable = false)
    private Integer sourcePage;
    @Column(name = "source_chunk_id", nullable = false, length = 64)
    private String sourceChunkId;
    @Column(nullable = false)
    private Double confidence;
    @Column(nullable = false, length = 30)
    private String status;
    @Column(name = "corrected_by")
    private String correctedBy;
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}