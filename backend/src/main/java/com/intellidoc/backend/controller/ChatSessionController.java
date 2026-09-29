package com.intellidoc.backend.controller;

import com.intellidoc.backend.chat.ChatSessionService;
import com.intellidoc.backend.dto.ChatSessionDetailResponseDto;
import com.intellidoc.backend.dto.ChatSessionResponseDto;
import com.intellidoc.backend.dto.CreateChatSessionRequestDto;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ChatSessionController {

    private final ChatSessionService chatSessionService;

    @PostMapping({"/workspaces/{workspaceId}/chat-sessions", "/api/v1/workspaces/{workspaceId}/chat-sessions"})
    public ResponseEntity<ChatSessionResponseDto> createSession(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestBody CreateChatSessionRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chatSessionService.createSession(workspaceId, principal, request));
    }

    @GetMapping({"/chat-sessions/{sessionId}", "/api/v1/chat-sessions/{sessionId}"})
    public ResponseEntity<ChatSessionDetailResponseDto> getSession(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID sessionId) {
        return ResponseEntity.ok(chatSessionService.getSession(principal, sessionId));
    }
}
