package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.AnalysisResultEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AnalysisResultRepository extends JpaRepository<AnalysisResultEntity, String> {
    Optional<AnalysisResultEntity> findByDocumentId(String documentId);
}
