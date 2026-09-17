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
@Table(name = "document_section")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentSectionEntity {
    @Id
    private String id;
    @Column(name = "document_id", nullable = false)
    private String documentId;
    @Column(name = "parent_section_id")
    private String parentSectionId;
    @Column(nullable = false)
    private String heading;
    @Column(name = "start_page", nullable = false)
    private int startPage;
    @Column(name = "end_page", nullable = false)
    private int endPage;
}