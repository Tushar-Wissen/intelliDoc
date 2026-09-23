package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ExtractedFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExtractedFieldRepository extends JpaRepository<ExtractedFieldEntity, UUID> {

    List<ExtractedFieldEntity> findByDocumentIdAndStatusNotOrderByCreatedAtAsc(
            UUID documentId,
            String status
    );

    Optional<ExtractedFieldEntity> findByIdAndStatusNot(UUID id, String status);
}
