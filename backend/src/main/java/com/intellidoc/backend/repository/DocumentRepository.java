package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocumentRepository
        extends JpaRepository<DocumentEntity, String> {


    // ============================================================
    // GET ALL DOCUMENTS FOR A WORKSPACE
    // ============================================================

    List<DocumentEntity> findByWorkspaceIdOrderByCreatedAtDesc(
            String workspaceId
    );


    // ============================================================
    // GET ONE DOCUMENT ONLY IF IT BELONGS TO THE WORKSPACE
    // ============================================================

    Optional<DocumentEntity> findByIdAndWorkspaceId(
            String id,
            String workspaceId
    );
}