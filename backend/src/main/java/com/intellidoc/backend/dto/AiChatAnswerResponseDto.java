package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiChatAnswerResponseDto {
    private UUID sessionId;
    private String question;
    private String answerMode;
    private String answerText;
    private Double confidence;
    private Boolean isNotFound;
    private String reason;
    private List<AiChatCitationDto> citations;
    private Map<String, Object> diagnostics;
}
