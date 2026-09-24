package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentChunkEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunkEntity, UUID> {
}
