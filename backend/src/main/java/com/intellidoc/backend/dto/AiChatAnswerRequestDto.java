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
public class AiChatAnswerRequestDto {
    private UUID sessionId;
    private UUID workspaceId;
    private String question;
    private List<UUID> resolvedDocumentIds;
    private String scopeType;
    private String mode;
    private String requestId;
}
