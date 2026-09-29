package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.DocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<DocumentEntity, UUID> {

    @Query("""
            select d from DocumentEntity d
            where d.workspaceId = :workspaceId
              and d.deletedAt is null
              and (:groupId is null or d.groupId = :groupId)
              and (:documentType is null or d.documentType = :documentType)
            order by d.createdAt desc
            """)
    List<DocumentEntity> searchActive(
            @Param("workspaceId") UUID workspaceId,
            @Param("groupId") UUID groupId,
            @Param("documentType") String documentType);

    Optional<DocumentEntity> findByIdAndDeletedAtIsNull(UUID id);

    List<DocumentEntity> findByGroupId(UUID groupId);

    List<DocumentEntity> findByWorkspaceIdAndDeletedAtIsNull(UUID workspaceId);

    List<DocumentEntity> findByWorkspaceIdAndGroupIdAndDeletedAtIsNull(UUID workspaceId, UUID groupId);

    List<DocumentEntity> findByWorkspaceIdAndIdInAndDeletedAtIsNull(UUID workspaceId, java.util.Collection<UUID> ids);
}
