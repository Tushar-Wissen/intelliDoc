package com.intellidoc.backend.chat;

import com.intellidoc.backend.dto.ChatMessageDto;
import com.intellidoc.backend.dto.ChatSessionDetailResponseDto;
import com.intellidoc.backend.dto.ChatSessionResponseDto;
import com.intellidoc.backend.dto.CreateChatSessionRequestDto;
import com.intellidoc.backend.dto.ScopeRequestDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.ChatMessageEntity;
import com.intellidoc.backend.model.ChatSessionDocumentEntity;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.repository.ChatMessageRepository;
import com.intellidoc.backend.repository.ChatSessionDocumentRepository;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatSessionService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatSessionDocumentRepository chatSessionDocumentRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ScopeResolver scopeResolver;
    private final WorkspaceAccessService workspaceAccessService;

    @Transactional
    public ChatSessionResponseDto createSession(UUID workspaceId, AuthPrincipal principal, CreateChatSessionRequestDto request) {
        workspaceAccessService.requireMember(workspaceId, principal.userId());

        if (request == null || request.getScope() == null) {
            throw DmsExceptions.invalidScope();
        }

        ScopeResolver.ResolvedScope resolved = scopeResolver.resolve(workspaceId, request.getScope());

        ChatSessionEntity session = ChatSessionEntity.builder()
                .workspaceId(workspaceId)
                .createdBy(principal.userId())
                .title(request.getTitle())
                .scopeType(resolved.getType())
                .scopeModuleId(resolved.getModuleId())
                .build();

        session = chatSessionRepository.save(session);

        UUID sessionId = session.getId();
        List<ChatSessionDocumentEntity> sessionDocs = resolved.getDocumentIds().stream()
                .map(docId -> new ChatSessionDocumentEntity(sessionId, docId))
                .toList();

        chatSessionDocumentRepository.saveAll(sessionDocs);

        ScopeRequestDto responseScope = ScopeRequestDto.builder()
                .type(resolved.getType())
                .moduleId(resolved.getModuleId())
                .documentIds(resolved.getType().equals("DOCUMENTS") ? resolved.getDocumentIds() : null)
                .build();

        return ChatSessionResponseDto.builder()
                .id(session.getId())
                .workspaceId(session.getWorkspaceId())
                .title(session.getTitle())
                .scope(responseScope)
                .resolvedDocumentIds(resolved.getDocumentIds())
                .createdAt(session.getCreatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public ChatSessionDetailResponseDto getSession(AuthPrincipal principal, UUID sessionId) {
        ChatSessionEntity session = chatSessionRepository.findById(sessionId)
                .orElseThrow(DmsExceptions::sessionNotFound);

        workspaceAccessService.requireMember(session.getWorkspaceId(), principal.userId());

        List<UUID> resolvedDocIds = chatSessionDocumentRepository.findDocumentIdsBySessionId(sessionId);
        List<ChatMessageEntity> messages = chatMessageRepository.findBySessionIdOrderByCreatedAtAsc(sessionId);

        List<ChatMessageDto> messageDtos = messages.stream()
                .map(m -> ChatMessageDto.builder()
                        .id(m.getId())
                        .role(m.getRole())
                        .content(m.getContent())
                        .answerMode(m.getAnswerMode())
                        .confidence(m.getConfidence())
                        .isNotFound(m.isNotFound())
                        .createdAt(m.getCreatedAt())
                        .build())
                .toList();

        ScopeRequestDto scopeDto = ScopeRequestDto.builder()
                .type(session.getScopeType())
                .moduleId(session.getScopeModuleId())
                .documentIds(session.getScopeType().equals("DOCUMENTS") ? resolvedDocIds : null)
                .build();

        return ChatSessionDetailResponseDto.builder()
                .id(session.getId())
                .workspaceId(session.getWorkspaceId())
                .title(session.getTitle())
                .scope(scopeDto)
                .resolvedDocumentIds(resolvedDocIds)
                .messages(messageDtos)
                .createdAt(session.getCreatedAt())
                .build();
    }
}
