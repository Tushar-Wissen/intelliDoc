package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentChunkEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunkEntity, String> {
}