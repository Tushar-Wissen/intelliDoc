package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentSectionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentSectionRepository extends JpaRepository<DocumentSectionEntity, String> {
}