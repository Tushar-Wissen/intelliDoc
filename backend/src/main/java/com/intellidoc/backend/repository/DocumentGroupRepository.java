package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentGroupEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentGroupRepository extends JpaRepository<DocumentGroupEntity, UUID> {

    List<DocumentGroupEntity> findByWorkspaceIdOrderByNameAsc(UUID workspaceId);

    Optional<DocumentGroupEntity> findByWorkspaceIdAndName(UUID workspaceId, String name);

    boolean existsByWorkspaceIdAndName(UUID workspaceId, String name);

    boolean existsByWorkspaceIdAndNameAndIdNot(UUID workspaceId, String name, UUID id);
}
