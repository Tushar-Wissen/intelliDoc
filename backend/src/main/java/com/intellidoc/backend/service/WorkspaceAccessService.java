package com.intellidoc.backend.service;

import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.WorkspaceEntity;
import com.intellidoc.backend.repository.WorkspaceMemberRepository;
import com.intellidoc.backend.repository.WorkspaceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkspaceAccessService {

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;

    public WorkspaceEntity requireWorkspace(UUID workspaceId) {
        return workspaceRepository.findById(workspaceId)
                .orElseThrow(DmsExceptions::workspaceNotFound);
    }

    public WorkspaceEntity requireMember(UUID workspaceId, UUID userId) {
        WorkspaceEntity workspace = requireWorkspace(workspaceId);
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId)) {
            throw DmsExceptions.workspaceAccessDenied();
        }
        return workspace;
    }
}
