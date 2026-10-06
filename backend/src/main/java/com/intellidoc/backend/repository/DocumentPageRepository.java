package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentPageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentPageRepository extends JpaRepository<DocumentPageEntity, String> {
}