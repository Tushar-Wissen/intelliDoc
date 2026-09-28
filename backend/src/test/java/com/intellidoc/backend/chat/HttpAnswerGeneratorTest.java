package com.intellidoc.backend.chat;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.AiChatAnswerResponseDto;
import com.intellidoc.backend.dto.AiChatCitationDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HttpAnswerGeneratorTest {

    @Mock
    private AiServiceClient aiServiceClient;

    @InjectMocks
    private HttpAnswerGenerator httpAnswerGenerator;

    @Test
    void generateMapsSuccessfulResponseToTokenCitationAndFinalEvents() {
        UUID docId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();

        AiChatAnswerResponseDto response = AiChatAnswerResponseDto.builder()
                .answerText("This document describes a USENIX paper template.")
                .answerMode("retrieval_plus_graph")
                .confidence(0.91)
                .isNotFound(false)
                .citations(List.of(AiChatCitationDto.builder()
                        .documentId(docId)
                        .chunkId(chunkId)
                        .pageNumber(1)
                        .sectionHeading("Intro")
                        .sourceExcerpt("USENIX paper template")
                        .build()))
                .build();

        when(aiServiceClient.generateChatAnswer(any())).thenReturn(response);

        AnswerRequest request = AnswerRequest.builder()
                .question("What is this document about?")
                .sessionId(UUID.randomUUID())
                .workspaceId(UUID.randomUUID())
                .resolvedDocumentIds(List.of(docId))
                .answerMode("retrieval_plus_graph")
                .build();

        List<AnswerEvent> events = new ArrayList<>();
        httpAnswerGenerator.generate(request, events::add);

        assertTrue(events.stream().anyMatch(e -> e.getType() == AnswerEvent.Type.TOKEN));
        assertTrue(events.stream().anyMatch(e -> e.getType() == AnswerEvent.Type.CITATION));
        AnswerEvent finalEvent = events.stream()
                .filter(e -> e.getType() == AnswerEvent.Type.FINAL)
                .findFirst()
                .orElseThrow();
        assertFalse(finalEvent.getIsNotFound());
        assertEquals(0.91, finalEvent.getConfidence());
    }

    @Test
    void generateEmitsErrorEventWhenAiServiceFails() {
        when(aiServiceClient.generateChatAnswer(any())).thenThrow(new RuntimeException("connection refused"));

        AnswerRequest request = AnswerRequest.builder()
                .question("What is this document about?")
                .sessionId(UUID.randomUUID())
                .workspaceId(UUID.randomUUID())
                .resolvedDocumentIds(List.of(UUID.randomUUID()))
                .build();

        List<AnswerEvent> events = new ArrayList<>();
        httpAnswerGenerator.generate(request, events::add);

        assertEquals(1, events.size());
        assertEquals(AnswerEvent.Type.ERROR, events.get(0).getType());
        assertEquals("UPSTREAM_FAILURE", events.get(0).getErrorCode());
    }

    @Test
    void mapResponseToEventsChunksLongAnswerText() {
        String longText = "word ".repeat(80);
        AiChatAnswerResponseDto response = AiChatAnswerResponseDto.builder()
                .answerText(longText)
                .answerMode("retrieval_plus_graph")
                .confidence(0.8)
                .isNotFound(false)
                .citations(List.of())
                .build();

        List<AnswerEvent> events = new ArrayList<>();
        Consumer<AnswerEvent> consumer = events::add;
        HttpAnswerGenerator.mapResponseToEvents(response, "retrieval_plus_graph", consumer);

        long tokenCount = events.stream().filter(e -> e.getType() == AnswerEvent.Type.TOKEN).count();
        assertTrue(tokenCount > 1);
    }
}
