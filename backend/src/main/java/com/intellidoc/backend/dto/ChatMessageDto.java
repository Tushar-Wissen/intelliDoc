package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessageDto {
    private UUID id;
    private String role;
    private String content;
    private String answerMode;
    private Double confidence;
    private Boolean isNotFound;
    private OffsetDateTime createdAt;
}
