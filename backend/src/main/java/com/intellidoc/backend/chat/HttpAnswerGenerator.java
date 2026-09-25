package com.intellidoc.backend.chat;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiChatAnswerRequestDto;
import com.intellidoc.backend.dto.AiChatAnswerResponseDto;
import com.intellidoc.backend.dto.AiChatCitationDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

@Slf4j
@Component("httpAnswerGenerator")
@RequiredArgsConstructor
public class HttpAnswerGenerator implements AnswerGeneratorClient {

    private static final int TOKEN_CHUNK_SIZE = 200;

    private final AiServiceClient aiServiceClient;

    @Override
    public void generate(AnswerRequest request, Consumer<AnswerEvent> eventConsumer) {
        log.info("HttpAnswerGenerator calling AI service for sessionId={}", request.getSessionId());

        AiChatAnswerRequestDto aiRequest = AiChatAnswerRequestDto.builder()
                .sessionId(request.getSessionId())
                .workspaceId(request.getWorkspaceId())
                .question(request.getQuestion())
                .resolvedDocumentIds(request.getResolvedDocumentIds())
                .scopeType("documents")
                .mode(request.getAnswerMode() != null ? request.getAnswerMode() : "retrieval_plus_graph")
                .requestId(request.getSessionId() != null ? request.getSessionId().toString() : null)
                .build();

        try {
            AiChatAnswerResponseDto response = aiServiceClient.generateChatAnswer(aiRequest);
            mapResponseToEvents(response, request.getAnswerMode(), eventConsumer);
        } catch (Exception ex) {
            log.error("AI service chat answer failed for sessionId={}", request.getSessionId(), ex);
            eventConsumer.accept(AnswerEvent.error(
                    "UPSTREAM_FAILURE",
                    ex.getMessage() != null ? ex.getMessage() : "AI service unavailable."));
        }
    }

    static void mapResponseToEvents(
            AiChatAnswerResponseDto response,
            String requestedMode,
            Consumer<AnswerEvent> eventConsumer) {

        if (response == null) {
            eventConsumer.accept(AnswerEvent.error("UPSTREAM_FAILURE", "Empty response from AI service."));
            return;
        }

        String answerText = response.getAnswerText() != null ? response.getAnswerText() : "";
        boolean notFound = Boolean.TRUE.equals(response.getIsNotFound());

        emitTokenChunks(answerText, eventConsumer);

        if (!notFound && response.getCitations() != null) {
            for (AiChatCitationDto citation : response.getCitations()) {
                if (citation == null || citation.getDocumentId() == null || citation.getChunkId() == null) {
                    continue;
                }
                eventConsumer.accept(AnswerEvent.citation(
                        citation.getDocumentId(),
                        citation.getChunkId(),
                        citation.getPageNumber() != null ? citation.getPageNumber() : 1,
                        citation.getSectionHeading() != null ? citation.getSectionHeading() : "",
                        citation.getSourceExcerpt() != null ? citation.getSourceExcerpt() : ""
                ));
            }
        }

        String mode = response.getAnswerMode() != null
                ? response.getAnswerMode()
                : (requestedMode != null ? requestedMode : "retrieval_plus_graph");
        Double confidence = response.getConfidence() != null ? response.getConfidence() : (notFound ? 0.0 : 1.0);
        eventConsumer.accept(AnswerEvent.finalEvent(notFound, confidence, mode));
    }

    static void emitTokenChunks(String text, Consumer<AnswerEvent> eventConsumer) {
        if (text == null || text.isBlank()) {
            return;
        }
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + TOKEN_CHUNK_SIZE, text.length());
            if (end < text.length()) {
                int space = text.lastIndexOf(' ', end);
                if (space > start) {
                    end = space + 1;
                }
            }
            eventConsumer.accept(AnswerEvent.token(text.substring(start, end)));
            start = end;
        }
    }

    static List<AnswerEvent> collectEvents(AnswerRequest request, AiChatAnswerResponseDto response) {
        List<AnswerEvent> events = new ArrayList<>();
        mapResponseToEvents(response, request.getAnswerMode(), events::add);
        return events;
    }
}
