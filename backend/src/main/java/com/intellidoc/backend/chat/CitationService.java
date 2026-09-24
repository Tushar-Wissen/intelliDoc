package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.CitationDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.AnswerCitationEntity;
import com.intellidoc.backend.model.ChatMessageEntity;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.model.DocumentChunkEntity;
import com.intellidoc.backend.repository.AnswerCitationRepository;
import com.intellidoc.backend.repository.ChatMessageRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentChunkRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CitationService {

    private final AnswerCitationRepository answerCitationRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final WorkspaceAccessService workspaceAccessService;

    public void validateCitation(List<UUID> resolvedDocIds, AnswerEvent event) {
        if (event == null || event.getDocumentId() == null) {
            throw DmsExceptions.validationError("Citation missing documentId");
        }

        if (resolvedDocIds != null && !resolvedDocIds.contains(event.getDocumentId())) {
            log.error("Citation documentId {} is outside session scope {}", event.getDocumentId(), resolvedDocIds);
            throw DmsExceptions.scopeOutsideWorkspace();
        }

        if (event.getChunkId() != null) {
            documentChunkRepository.findById(event.getChunkId()).ifPresent(chunk -> {
                if (!chunk.getDocumentId().equals(event.getDocumentId())) {
                    log.error("Citation chunkId {} document mismatch. Expected {}, got {}",
                            event.getChunkId(), event.getDocumentId(), chunk.getDocumentId());
                    throw DmsExceptions.scopeOutsideWorkspace();
                }
            });
        }
    }

    @Transactional
    public List<AnswerCitationEntity> persistAll(UUID messageId, List<AnswerEvent> bufferedCitations) {
        if (bufferedCitations == null || bufferedCitations.isEmpty()) {
            return List.of();
        }

        List<AnswerCitationEntity> entities = new ArrayList<>();
        for (int i = 0; i < bufferedCitations.size(); i++) {
            AnswerEvent event = bufferedCitations.get(i);
            UUID citationId = event.getCitationId() != null ? event.getCitationId() : UUID.randomUUID();
            UUID chunkId = event.getChunkId() != null ? event.getChunkId() : UUID.randomUUID();

            AnswerCitationEntity citation = AnswerCitationEntity.builder()
                    .id(citationId)
                    .messageId(messageId)
                    .documentId(event.getDocumentId())
                    .chunkId(chunkId)
                    .pageNumber(event.getPage())
                    .sectionHeading(event.getSection())
                    .sourceExcerpt(event.getExcerpt())
                    .ordinal(i)
                    .build();

            entities.add(citation);
        }

        return answerCitationRepository.saveAll(entities);
    }

    @Transactional(readOnly = true)
    public List<CitationDto> getCitationsForMessage(AuthPrincipal principal, UUID messageId) {
        ChatMessageEntity message = chatMessageRepository.findById(messageId)
                .orElseThrow(DmsExceptions::messageNotFound);

        ChatSessionEntity session = chatSessionRepository.findById(message.getSessionId())
                .orElseThrow(DmsExceptions::sessionNotFound);

        workspaceAccessService.requireMember(session.getWorkspaceId(), principal.userId());

        List<AnswerCitationEntity> citations = answerCitationRepository.findByMessageIdOrderByOrdinalAsc(messageId);
        if (citations.isEmpty()) {
            citations = answerCitationRepository.findByMessageId(messageId);
        }

        return citations.stream()
                .map(c -> CitationDto.builder()
                        .citationId(c.getId())
                        .documentId(c.getDocumentId())
                        .chunkId(c.getChunkId())
                        .page(c.getPageNumber())
                        .section(c.getSectionHeading())
                        .excerpt(c.getSourceExcerpt())
                        .build())
                .toList();
    }
}
