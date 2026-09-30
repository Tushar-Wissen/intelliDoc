package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.FolderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FolderRepository
        extends JpaRepository<FolderEntity, String> {

    // Find existing folder by workspace and folder name
    Optional<FolderEntity> findByWorkspaceIdAndName(
            String workspaceId,
            String name
    );

    // Get all folders for a workspace
    List<FolderEntity> findByWorkspaceIdOrderByCreatedAtDesc(
            String workspaceId
    );
}