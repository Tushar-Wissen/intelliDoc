package com.intellidoc.backend.controller;

import com.intellidoc.backend.chat.ChatSessionService;
import com.intellidoc.backend.dto.ChatSessionDetailResponseDto;
import com.intellidoc.backend.dto.ChatSessionListResponseDto;
import com.intellidoc.backend.dto.ChatSessionResponseDto;
import com.intellidoc.backend.dto.CreateChatSessionRequestDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
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

    @GetMapping({"/workspaces/{workspaceId}/chat-sessions", "/api/v1/workspaces/{workspaceId}/chat-sessions"})
    public ResponseEntity<ChatSessionListResponseDto> listSessions(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId) {
        return ResponseEntity.ok(chatSessionService.listSessions(principal, workspaceId));
    }

    @GetMapping({"/chat-sessions/{sessionId}", "/api/v1/chat-sessions/{sessionId}"})
    public ResponseEntity<ChatSessionDetailResponseDto> getSession(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID sessionId) {
        return ResponseEntity.ok(chatSessionService.getSession(principal, sessionId));
    }

    @GetMapping({
            "/workspaces/{workspaceId}/chat-sessions/latest",
            "/api/v1/workspaces/{workspaceId}/chat-sessions/latest"
    })
    public ResponseEntity<ChatSessionDetailResponseDto> getLatestSessionForScope(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestParam String scopeType,
            @RequestParam(required = false) UUID moduleId,
            @RequestParam(required = false) UUID documentId) {
        return chatSessionService
                .getLatestSessionForScope(principal, workspaceId, scopeType, moduleId, documentId)
                .map(ResponseEntity::ok)
                .orElseThrow(DmsExceptions::sessionNotFound);
    }
}
