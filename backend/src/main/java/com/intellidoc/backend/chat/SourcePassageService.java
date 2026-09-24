package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.SourceHighlightDto;
import com.intellidoc.backend.dto.SourcePassageDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.AnswerCitationEntity;
import com.intellidoc.backend.model.ChatMessageEntity;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.model.DocumentChunkEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.repository.AnswerCitationRepository;
import com.intellidoc.backend.repository.ChatMessageRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentChunkRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SourcePassageService {

    private final AnswerCitationRepository answerCitationRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final DocumentRepository documentRepository;
    private final WorkspaceAccessService workspaceAccessService;

    @Transactional(readOnly = true)
    public SourcePassageDto getSourcePassage(AuthPrincipal principal, UUID citationId) {
        AnswerCitationEntity citation = answerCitationRepository.findById(citationId)
                .orElseThrow(DmsExceptions::citationNotFound);

        ChatMessageEntity message = chatMessageRepository.findById(citation.getMessageId())
                .orElseThrow(DmsExceptions::messageNotFound);

        ChatSessionEntity session = chatSessionRepository.findById(message.getSessionId())
                .orElseThrow(DmsExceptions::sessionNotFound);

        workspaceAccessService.requireMember(session.getWorkspaceId(), principal.userId());

        DocumentEntity document = documentRepository.findById(citation.getDocumentId())
                .orElseThrow(DmsExceptions::documentNotFound);

        DocumentChunkEntity chunk = documentChunkRepository.findById(citation.getChunkId())
                .orElseGet(() -> DocumentChunkEntity.builder()
                        .id(citation.getChunkId())
                        .documentId(citation.getDocumentId())
                        .pageNumber(citation.getPageNumber())
                        .chunkText(citation.getSourceExcerpt() != null ? citation.getSourceExcerpt() : "")
                        .build());

        if (!chunk.getDocumentId().equals(citation.getDocumentId())) {
            log.warn("Chunk documentId mismatch for citation {}. Expected {}, got {}",
                    citationId, citation.getDocumentId(), chunk.getDocumentId());
            throw DmsExceptions.sourceUnavailable();
        }

        SourceHighlightDto highlight = HighlightLocator.locate(chunk.getChunkText(), citation.getSourceExcerpt());

        return SourcePassageDto.builder()
                .citationId(citation.getId())
                .documentId(citation.getDocumentId())
                .fileName(document.getFileName())
                .page(citation.getPageNumber() != null ? citation.getPageNumber() : chunk.getPageNumber())
                .section(citation.getSectionHeading())
                .passage(chunk.getChunkText())
                .highlight(highlight)
                .build();
    }
}
