package com.intellidoc.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "documents")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentEntity {

    @Id
    @Column(name = "id", length = 64)
    private String id;


    // ============================================================
    // WORKSPACE
    // ============================================================

    @Column(
            name = "workspace_id",
            length = 100,
            nullable = false
    )
    private String workspaceId;


    // ============================================================
    // FOLDER
    // ============================================================

    @Column(
            name = "folder_id",
            length = 64
    )
    private String folderId;


    // ============================================================
    // DOCUMENT DETAILS
    // ============================================================

    /*
     * This is currently kept as the folder title
     * to preserve the existing POST behavior.
     */
    @Column(
            name = "title",
            nullable = false
    )
    private String title;


    /*
     * Actual uploaded file name.
     *
     * Example:
     * Employee_details.pdf
     */
    @Column(
            name = "file_name",
            length = 255
    )
    private String fileName;


    @Column(
            name = "content",
            nullable = false,
            columnDefinition = "TEXT"
    )
    private String content;


    @Column(name = "content_type")
    private String contentType;


    @Column(
            name = "status",
            nullable = false
    )
    private String status;


    // ============================================================
    // TIMESTAMPS
    // ============================================================

    @Column(
            name = "created_at",
            nullable = false,
            updatable = false
    )
    private OffsetDateTime createdAt;


    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;


    // ============================================================
    // JPA CALLBACKS
    // ============================================================

    @PrePersist
    protected void onCreate() {

        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }

        if (this.status == null) {
            this.status = "PENDING";
        }

        this.updatedAt = OffsetDateTime.now();
    }


    @PreUpdate
    protected void onUpdate() {

        this.updatedAt = OffsetDateTime.now();
    }
}