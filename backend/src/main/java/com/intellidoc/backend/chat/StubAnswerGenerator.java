package com.intellidoc.backend.chat;

import com.intellidoc.backend.model.DocumentChunkEntity;
import com.intellidoc.backend.repository.DocumentChunkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

@Component("stubAnswerGenerator")
@RequiredArgsConstructor
public class StubAnswerGenerator implements AnswerGeneratorClient {

    private final DocumentChunkRepository documentChunkRepository;

    @Override
    public void generate(AnswerRequest request, Consumer<AnswerEvent> eventConsumer) {
        if (request.getQuestion() != null && request.getQuestion().toLowerCase().contains("not found")) {
            eventConsumer.accept(AnswerEvent.token("The requested information could not be found in the provided documents."));
            eventConsumer.accept(AnswerEvent.finalEvent(true, 0.0, request.getAnswerMode()));
            return;
        }

        UUID primaryDocId = (request.getResolvedDocumentIds() != null && !request.getResolvedDocumentIds().isEmpty())
                ? request.getResolvedDocumentIds().get(0)
                : UUID.randomUUID();

        UUID chunkId = UUID.randomUUID();
        int page = 1;
        String section = "General";
        String excerpt = "The notice period for termination is 30 days written notice.";

        if (request.getResolvedDocumentIds() != null) {
            for (UUID docId : request.getResolvedDocumentIds()) {
                List<DocumentChunkEntity> chunks = documentChunkRepository.findAll().stream()
                        .filter(c -> docId.equals(c.getDocumentId()))
                        .toList();
                if (!chunks.isEmpty()) {
                    DocumentChunkEntity found = chunks.get(0);
                    primaryDocId = found.getDocumentId();
                    chunkId = found.getId();
                    page = found.getPageNumber() != null ? found.getPageNumber() : 1;
                    excerpt = found.getChunkText();
                    break;
                }
            }
        }

        eventConsumer.accept(AnswerEvent.token("Based on the uploaded documents, "));
        eventConsumer.accept(AnswerEvent.token("the notice period is 30 days written notice. "));
        eventConsumer.accept(AnswerEvent.citation(primaryDocId, chunkId, page, section, excerpt));
        eventConsumer.accept(AnswerEvent.token("Please review the cited section for full details."));
        eventConsumer.accept(AnswerEvent.finalEvent(false, 0.95, request.getAnswerMode() != null ? request.getAnswerMode() : "retrieval_plus_graph"));
    }
}
