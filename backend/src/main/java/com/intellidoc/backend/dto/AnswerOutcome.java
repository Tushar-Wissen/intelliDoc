package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AnswerOutcome {
    private UUID messageId;
    private String content;
    private String answerMode;
    private Double confidence;
    private Boolean isNotFound;
    private List<CitationDto> citations;
}
