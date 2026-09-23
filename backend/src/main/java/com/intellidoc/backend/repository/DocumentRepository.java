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

    List<DocumentEntity> findAllByOrderByCreatedAtDesc();


    // ============================================================
    // GET ONE DOCUMENT ONLY IF IT BELONGS TO WORKSPACE
    // ============================================================

    Optional<DocumentEntity> findByIdAndWorkspaceId(
            String id,
            String workspaceId
    );


    // ============================================================
    // GET ALL FILES INSIDE A FOLDER
    // ============================================================

    List<DocumentEntity> findByFolderIdOrderByCreatedAtAsc(
            String folderId
    );


    // ============================================================
    // COUNT FILES INSIDE A FOLDER
    // ============================================================

    long countByFolderId(
            String folderId
    );
}