package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, UUID> {
    List<ChatMessageEntity> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);
}
