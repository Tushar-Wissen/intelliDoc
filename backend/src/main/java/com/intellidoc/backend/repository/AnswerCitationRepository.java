package com.intellidoc.backend.repository;

import com.intellidoc.backend.model.AnswerCitationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnswerCitationRepository extends JpaRepository<AnswerCitationEntity, UUID> {
    List<AnswerCitationEntity> findByMessageIdOrderByOrdinalAsc(UUID messageId);
    List<AnswerCitationEntity> findByMessageId(UUID messageId);
}
