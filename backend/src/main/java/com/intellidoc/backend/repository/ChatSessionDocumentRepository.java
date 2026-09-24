package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ChatSessionDocumentEntity;
import com.intellidoc.backend.model.ChatSessionDocumentId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ChatSessionDocumentRepository extends JpaRepository<ChatSessionDocumentEntity, ChatSessionDocumentId> {

    @Query("SELECT csd.id.documentId FROM ChatSessionDocumentEntity csd WHERE csd.id.sessionId = :sessionId")
    List<UUID> findDocumentIdsBySessionId(@Param("sessionId") UUID sessionId);

    void deleteByIdSessionId(UUID sessionId);
}
