package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, UUID> {
    List<ChatMessageEntity> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);

    @Query("""
        SELECT COUNT(m) FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.isNotFound = false
    """)
    long countAnsweredQuestions(UUID workspaceId);

    @Query("""
        SELECT COUNT(m) FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.isNotFound = true
    """)
    long countUnansweredQuestions(UUID workspaceId);

    @Query("""
        SELECT COUNT(m) FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.createdAt >= :since
    """)
    long countTotalQuestionsSince(UUID workspaceId, OffsetDateTime since);

    @Query("""
        SELECT COUNT(m) FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.isNotFound = false
          AND m.createdAt >= :since
    """)
    long countAnsweredQuestionsSince(UUID workspaceId, OffsetDateTime since);

    @Query("""
        SELECT COUNT(m) FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.isNotFound = true
          AND m.createdAt >= :since
    """)
    long countUnansweredQuestionsSince(UUID workspaceId, OffsetDateTime since);

    @Query("""
        SELECT m FROM ChatMessageEntity m, ChatSessionEntity s
        WHERE m.sessionId = s.id
          AND s.workspaceId = :workspaceId
          AND m.role = 'assistant'
          AND m.isNotFound = true
        ORDER BY m.createdAt DESC
    """)
    List<ChatMessageEntity> findUnansweredMessages(UUID workspaceId);
}
