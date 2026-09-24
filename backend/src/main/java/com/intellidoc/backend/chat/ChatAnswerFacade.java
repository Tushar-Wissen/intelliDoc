package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.AnswerOutcome;
import com.intellidoc.backend.dto.CitationDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.ChatMessageEntity;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.repository.ChatSessionDocumentRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatAnswerFacade {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatSessionDocumentRepository chatSessionDocumentRepository;
    private final DocumentRepository documentRepository;
    private final WorkspaceAccessService workspaceAccessService;
    private final SessionLockManager sessionLockManager;
    private final CitationService citationService;
    private final ChatMessageService chatMessageService;
    private final AnswerGeneratorClient answerGeneratorClient;

    public AnswerOutcome ask(UUID sessionId, AuthPrincipal principal, String question, String answerMode) {
        if (question == null || question.isBlank()) {
            throw DmsExceptions.validationError("Question is required.");
        }

        ChatSessionEntity session = chatSessionRepository.findById(sessionId)
                .orElseThrow(DmsExceptions::sessionNotFound);

        workspaceAccessService.requireMember(session.getWorkspaceId(), principal.userId());

        sessionLockManager.acquireLock(sessionId);

        try {
            chatMessageService.persistUserMessage(sessionId, question);

            List<UUID> resolvedDocIds = chatSessionDocumentRepository.findDocumentIdsBySessionId(sessionId);
            List<UUID> activeDocIds = resolvedDocIds.stream()
                    .filter(id -> documentRepository.findByIdAndDeletedAtIsNull(id).isPresent())
                    .toList();

            String mode = answerMode != null ? answerMode : "retrieval_plus_graph";

            AnswerRequest request = AnswerRequest.builder()
                    .question(question)
                    .sessionId(sessionId)
                    .workspaceId(session.getWorkspaceId())
                    .resolvedDocumentIds(activeDocIds)
                    .answerMode(mode)
                    .build();

            StringBuilder fullContent = new StringBuilder();
            List<AnswerEvent> bufferedCitations = new ArrayList<>();
            final boolean[] isNotFoundRef = new boolean[]{false};
            final double[] confidenceRef = new double[]{1.0};
            final String[] modeRef = new String[]{mode};

            answerGeneratorClient.generate(request, event -> {
                if (event.getType() == AnswerEvent.Type.TOKEN) {
                    fullContent.append(event.getText());
                } else if (event.getType() == AnswerEvent.Type.CITATION) {
                    citationService.validateCitation(activeDocIds, event);
                    if (event.getCitationId() == null) {
                        event.setCitationId(UUID.randomUUID());
                    }
                    bufferedCitations.add(event);
                } else if (event.getType() == AnswerEvent.Type.FINAL) {
                    if (event.getIsNotFound() != null) isNotFoundRef[0] = event.getIsNotFound();
                    if (event.getConfidence() != null) confidenceRef[0] = event.getConfidence();
                    if (event.getAnswerMode() != null) modeRef[0] = event.getAnswerMode();
                }
            });

            ChatMessageEntity savedAssistant = chatMessageService.persistAssistantMessageAndCitations(
                    sessionId, fullContent.toString(), modeRef[0], confidenceRef[0], isNotFoundRef[0], bufferedCitations);

            List<CitationDto> citations = citationService.getCitationsForMessage(principal, savedAssistant.getId());

            return AnswerOutcome.builder()
                    .messageId(savedAssistant.getId())
                    .content(savedAssistant.getContent())
                    .answerMode(savedAssistant.getAnswerMode())
                    .confidence(savedAssistant.getConfidence())
                    .isNotFound(savedAssistant.isNotFound())
                    .citations(citations)
                    .build();
        } finally {
            sessionLockManager.releaseLock(sessionId);
        }
    }
}
