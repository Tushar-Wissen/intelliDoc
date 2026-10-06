package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ChatSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatSessionRepository extends JpaRepository<ChatSessionEntity, UUID> {
    Optional<ChatSessionEntity> findByIdAndWorkspaceId(UUID id, UUID workspaceId);

    List<ChatSessionEntity> findByWorkspaceIdAndCreatedByOrderByLastActivityAtDescCreatedAtDesc(
            UUID workspaceId, UUID createdBy);

    List<ChatSessionEntity> findByWorkspaceIdAndCreatedByAndScopeTypeOrderByLastActivityAtDescCreatedAtDesc(
            UUID workspaceId, UUID createdBy, String scopeType);

    List<ChatSessionEntity> findByWorkspaceIdAndCreatedByAndScopeTypeAndScopeModuleIdOrderByLastActivityAtDescCreatedAtDesc(
            UUID workspaceId, UUID createdBy, String scopeType, UUID scopeModuleId);

    List<ChatSessionEntity> findByScopeModuleId(UUID scopeModuleId);
}
