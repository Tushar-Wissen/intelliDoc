package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSessionDetailResponseDto {
    private UUID id;
    private UUID workspaceId;
    private String title;
    private ScopeRequestDto scope;
    private List<UUID> resolvedDocumentIds;
    private List<ChatMessageDto> messages;
    private OffsetDateTime createdAt;
}
