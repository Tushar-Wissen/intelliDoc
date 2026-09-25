package com.intellidoc.backend.chat;

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
public class AnswerRequest {
    private String question;
    private UUID sessionId;
    private UUID workspaceId;
    private List<UUID> resolvedDocumentIds;
    private String answerMode;
}
