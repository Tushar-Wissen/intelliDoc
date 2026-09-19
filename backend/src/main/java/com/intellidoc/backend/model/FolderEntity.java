package com.intellidoc.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(
        name = "folders",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_folder_workspace_name",
                        columnNames = {
                                "workspace_id",
                                "name"
                        }
                )
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FolderEntity {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(
            name = "workspace_id",
            length = 100,
            nullable = false
    )
    private String workspaceId;

    @Column(
            name = "name",
            length = 255,
            nullable = false
    )
    private String name;

    @Column(
            name = "status",
            length = 50,
            nullable = false
    )
    private String status;

    @Column(
            name = "created_at",
            nullable = false,
            updatable = false
    )
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {

        if (this.createdAt == null) {
            this.createdAt = OffsetDateTime.now();
        }

        if (this.status == null) {
            this.status = "PROCESSING";
        }

        this.updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}