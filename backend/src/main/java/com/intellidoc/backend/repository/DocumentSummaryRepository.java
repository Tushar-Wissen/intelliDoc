package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentSummaryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DocumentSummaryRepository extends JpaRepository<DocumentSummaryEntity, UUID> {

    Optional<DocumentSummaryEntity> findByDocumentId(UUID documentId);
}
