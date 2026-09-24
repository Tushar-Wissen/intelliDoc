package com.intellidoc.backend.chat;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnswerEvent {

    public enum Type {
        TOKEN,
        CITATION,
        FINAL,
        ERROR
    }

    private Type type;
    
    // For TOKEN
    private String text;

    // For CITATION
    private UUID citationId;
    private UUID documentId;
    private UUID chunkId;
    private Integer page;
    private String section;
    private String excerpt;

    // For FINAL / DONE
    private Boolean isNotFound;
    private Double confidence;
    private String answerMode;
    private UUID messageId;

    // For ERROR
    private String errorCode;
    private String errorMessage;

    public static AnswerEvent token(String text) {
        return AnswerEvent.builder().type(Type.TOKEN).text(text).build();
    }

    public static AnswerEvent citation(UUID documentId, UUID chunkId, Integer page, String section, String excerpt) {
        return AnswerEvent.builder()
                .type(Type.CITATION)
                .documentId(documentId)
                .chunkId(chunkId)
                .page(page)
                .section(section)
                .excerpt(excerpt)
                .build();
    }

    public static AnswerEvent finalEvent(Boolean isNotFound, Double confidence, String answerMode) {
        return AnswerEvent.builder()
                .type(Type.FINAL)
                .isNotFound(isNotFound != null ? isNotFound : false)
                .confidence(confidence != null ? confidence : 1.0)
                .answerMode(answerMode)
                .build();
    }

    public static AnswerEvent error(String errorCode, String errorMessage) {
        return AnswerEvent.builder()
                .type(Type.ERROR)
                .errorCode(errorCode)
                .errorMessage(errorMessage)
                .build();
    }
}
