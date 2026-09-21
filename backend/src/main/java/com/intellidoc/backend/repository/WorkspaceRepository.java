package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.WorkspaceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<WorkspaceEntity, UUID> {

    List<WorkspaceEntity> findByIdInAndStatusOrderByCreatedAtDesc(Collection<UUID> ids, String status);
}
