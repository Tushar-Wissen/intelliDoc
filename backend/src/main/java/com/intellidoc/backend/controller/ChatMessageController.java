package com.intellidoc.backend.controller;

import com.intellidoc.backend.chat.ChatMessageService;
import com.intellidoc.backend.dto.PostMessageRequestDto;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ChatMessageController {

    private final ChatMessageService chatMessageService;

    @PostMapping(
            value = {"/chat-sessions/{sessionId}/messages", "/api/v1/chat-sessions/{sessionId}/messages"},
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public SseEmitter postMessage(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID sessionId,
            @RequestBody PostMessageRequestDto request) {
        SseEmitter emitter = new SseEmitter(180_000L); // 3-minute timeout
        String question = request != null ? request.getQuestion() : null;
        
        // Execute asynchronously or directly
        new Thread(() -> {
            try {
                chatMessageService.processMessageStream(principal, sessionId, question, emitter);
            } catch (Exception ex) {
                try {
                    emitter.completeWithError(ex);
                } catch (Exception ignored) {}
            }
        }).start();

        return emitter;
    }
}
