package com.intellidoc.backend.service;

import com.intellidoc.backend.exception.ApiException;
import com.intellidoc.backend.security.AuthPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class WorkspaceServiceTest {

    @Mock
    private com.intellidoc.backend.repository.WorkspaceRepository workspaceRepository;
    @Mock
    private com.intellidoc.backend.repository.WorkspaceMemberRepository workspaceMemberRepository;
    @Mock
    private WorkspaceAccessService workspaceAccessService;

    @InjectMocks
    private WorkspaceService workspaceService;

    @Test
    void emptyNameIsRejected() {
        AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), UUID.randomUUID());
        ApiException ex = assertThrows(ApiException.class, () ->
                workspaceService.create(principal, new com.intellidoc.backend.dto.CreateWorkspaceRequestDto("  ")));
        assertEquals("WORKSPACE_INVALID_NAME", ex.getCode());
        assertEquals(400, ex.getStatus());
    }
}
