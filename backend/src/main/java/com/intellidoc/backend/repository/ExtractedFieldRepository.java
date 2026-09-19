package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ExtractedFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExtractedFieldRepository extends JpaRepository<ExtractedFieldEntity, String> {
    List<ExtractedFieldEntity> findByDocumentIdAndStatusNotOrderByCreatedAtAsc(String documentId, String status);
}