package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentRepository extends JpaRepository<DocumentEntity, String> {
    List<DocumentEntity> findAllByOrderByCreatedAtDesc();
}
