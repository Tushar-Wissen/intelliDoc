package com.intellidoc.backend.service;

import com.intellidoc.backend.dms.WorkspaceStatus;
import com.intellidoc.backend.dto.CreateWorkspaceRequestDto;
import com.intellidoc.backend.dto.PatchWorkspaceRequestDto;
import com.intellidoc.backend.dto.WorkspaceResponseDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.WorkspaceEntity;
import com.intellidoc.backend.model.WorkspaceMemberEntity;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.WorkspaceMemberRepository;
import com.intellidoc.backend.repository.WorkspaceRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceService {

    static final int NAME_MAX_LENGTH = 255;
    static final String CREATOR_ROLE = "member";

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final DocumentRepository documentRepository;
    private final DocumentWriteService documentWriteService;
    private final ModuleService moduleService;
    private final WorkspaceAccessService workspaceAccessService;

    @Transactional
    public WorkspaceResponseDto create(AuthPrincipal principal, CreateWorkspaceRequestDto request) {
        String name = requireName(request == null ? null : request.getName());
        WorkspaceEntity workspace = workspaceRepository.save(WorkspaceEntity.builder()
                .tenantId(principal.tenantId())
                .name(name)
                .status(WorkspaceStatus.ACTIVE)
                .createdBy(principal.userId())
                .build());
        workspaceMemberRepository.save(WorkspaceMemberEntity.builder()
                .workspaceId(workspace.getId())
                .userId(principal.userId())
                .role(CREATOR_ROLE)
                .build());
        return toDto(workspace);
    }

    @Transactional(readOnly = true)
    public List<WorkspaceResponseDto> listMine(AuthPrincipal principal) {
        List<UUID> ids = workspaceMemberRepository.findByUserId(principal.userId()).stream()
                .map(WorkspaceMemberEntity::getWorkspaceId)
                .toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        return workspaceRepository.findByIdInAndStatusOrderByCreatedAtDesc(ids, WorkspaceStatus.ACTIVE)
                .stream()
                .map(WorkspaceService::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public WorkspaceResponseDto get(AuthPrincipal principal, UUID workspaceId) {
        return toDto(workspaceAccessService.requireMember(workspaceId, principal.userId()));
    }

    @Transactional
    public WorkspaceResponseDto patch(AuthPrincipal principal, UUID workspaceId, PatchWorkspaceRequestDto request) {
        WorkspaceEntity workspace = workspaceAccessService.requireMember(workspaceId, principal.userId());
        if (request != null && request.getName() != null) {
            workspace.setName(requireName(request.getName()));
        }
        if (request != null && request.getStatus() != null && !request.getStatus().isBlank()) {
            workspace.setStatus(request.getStatus().trim());
        }
        return toDto(workspaceRepository.save(workspace));
    }

    @Transactional
    public WorkspaceResponseDto archive(AuthPrincipal principal, UUID workspaceId) {
        WorkspaceEntity workspace = workspaceAccessService.requireMember(workspaceId, principal.userId());
        documentRepository.findByWorkspaceIdAndDeletedAtIsNull(workspaceId)
                .forEach(documentWriteService::archive);
        moduleService.deleteAllForWorkspace(workspaceId);
        workspace.setStatus(WorkspaceStatus.ARCHIVED);
        return toDto(workspaceRepository.save(workspace));
    }

    private static String requireName(String name) {
        if (name == null || name.isBlank() || name.trim().length() > NAME_MAX_LENGTH) {
            throw DmsExceptions.workspaceInvalidName();
        }
        return name.trim();
    }

    static WorkspaceResponseDto toDto(WorkspaceEntity workspace) {
        return WorkspaceResponseDto.builder()
                .id(workspace.getId())
                .name(workspace.getName())
                .status(workspace.getStatus())
                .createdAt(workspace.getCreatedAt())
                .build();
    }
}
