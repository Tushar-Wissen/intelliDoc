package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.CitationDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.AnswerCitationEntity;
import com.intellidoc.backend.model.ChatMessageEntity;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.repository.ChatMessageRepository;
import com.intellidoc.backend.repository.ChatSessionDocumentRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatMessageService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatSessionDocumentRepository chatSessionDocumentRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final DocumentRepository documentRepository;
    private final WorkspaceAccessService workspaceAccessService;
    private final SessionLockManager sessionLockManager;
    private final CitationService citationService;
    private final AnswerGeneratorClient answerGeneratorClient;

    @Transactional
    public ChatMessageEntity persistUserMessage(UUID sessionId, String question) {
        ChatMessageEntity userMsg = ChatMessageEntity.builder()
                .sessionId(sessionId)
                .role("user")
                .content(question)
                .isNotFound(false)
                .build();
        return chatMessageRepository.save(userMsg);
    }

    @Transactional
    public ChatMessageEntity persistAssistantMessageAndCitations(
            UUID sessionId, String content, String answerMode, Double confidence, boolean isNotFound, List<AnswerEvent> bufferedCitations) {
        ChatMessageEntity assistantMsg = ChatMessageEntity.builder()
                .sessionId(sessionId)
                .role("assistant")
                .content(content)
                .answerMode(answerMode != null ? answerMode : "retrieval_plus_graph")
                .confidence(confidence != null ? confidence : 1.0)
                .isNotFound(isNotFound)
                .build();

        assistantMsg = chatMessageRepository.save(assistantMsg);

        if (!bufferedCitations.isEmpty()) {
            citationService.persistAll(assistantMsg.getId(), bufferedCitations);
        }

        return assistantMsg;
    }

    public void processMessageStream(AuthPrincipal principal, UUID sessionId, String question, SseEmitter emitter) {
        if (question == null || question.isBlank()) {
            try {
                emitter.send(SseEmitter.event().name("error").data(Map.of("code", "VALIDATION_ERROR", "message", "Question is required.")));
                emitter.complete();
            } catch (Exception ignored) {}
            return;
        }

        ChatSessionEntity session = chatSessionRepository.findById(sessionId)
                .orElseThrow(DmsExceptions::sessionNotFound);

        workspaceAccessService.requireMember(session.getWorkspaceId(), principal.userId());

        sessionLockManager.acquireLock(sessionId);

        try {
            // TX-A: Save user message
            persistUserMessage(sessionId, question);

            log.info("QUESTION_ASKED userId={} workspaceId={} sessionId={}", principal.userId(), session.getWorkspaceId(), sessionId);

            // Fetch stored resolved document IDs
            List<UUID> resolvedDocIds = chatSessionDocumentRepository.findDocumentIdsBySessionId(sessionId);
            List<UUID> activeDocIds = resolvedDocIds.stream()
                    .filter(id -> documentRepository.findByIdAndDeletedAtIsNull(id).isPresent())
                    .toList();

            if (activeDocIds.isEmpty() && !resolvedDocIds.isEmpty()) {
                throw DmsExceptions.emptyScope();
            }

            AnswerRequest request = AnswerRequest.builder()
                    .question(question)
                    .sessionId(sessionId)
                    .workspaceId(session.getWorkspaceId())
                    .resolvedDocumentIds(activeDocIds)
                    .answerMode("retrieval_plus_graph")
                    .build();

            StringBuilder fullAnswer = new StringBuilder();
            List<AnswerEvent> bufferedCitations = new ArrayList<>();

            answerGeneratorClient.generate(request, event -> {
                try {
                    if (event.getType() == AnswerEvent.Type.TOKEN) {
                        fullAnswer.append(event.getText());
                        emitter.send(SseEmitter.event().name("token").data(Map.of("text", event.getText())));
                    } else if (event.getType() == AnswerEvent.Type.CITATION) {
                        citationService.validateCitation(activeDocIds, event);
                        UUID citationId = event.getCitationId() != null ? event.getCitationId() : UUID.randomUUID();
                        event.setCitationId(citationId);
                        bufferedCitations.add(event);

                        emitter.send(SseEmitter.event().name("citation").data(Map.of(
                                "citationId", citationId,
                                "documentId", event.getDocumentId(),
                                "page", event.getPage() != null ? event.getPage() : 1,
                                "section", event.getSection() != null ? event.getSection() : "",
                                "excerpt", event.getExcerpt() != null ? event.getExcerpt() : ""
                        )));
                    } else if (event.getType() == AnswerEvent.Type.FINAL) {
                        String mode = event.getAnswerMode() != null ? event.getAnswerMode() : "retrieval_plus_graph";
                        double conf = event.getConfidence() != null ? event.getConfidence() : 1.0;
                        boolean notFound = event.getIsNotFound() != null && event.getIsNotFound();

                        ChatMessageEntity savedAssistant = persistAssistantMessageAndCitations(
                                sessionId, fullAnswer.toString(), mode, conf, notFound, bufferedCitations);

                        emitter.send(SseEmitter.event().name("done").data(Map.of(
                                "messageId", savedAssistant.getId(),
                                "answerMode", mode,
                                "isNotFound", notFound,
                                "confidence", conf
                        )));
                        emitter.complete();
                    }
                } catch (Exception ex) {
                    log.error("Error processing stream event for session {}", sessionId, ex);
                    try {
                        emitter.send(SseEmitter.event().name("error").data(Map.of("code", "UPSTREAM_FAILURE", "message", ex.getMessage())));
                        emitter.complete();
                    } catch (Exception ignored) {}
                }
            });
        } finally {
            sessionLockManager.releaseLock(sessionId);
        }
    }
}
