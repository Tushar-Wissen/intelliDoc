package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.CreateWorkspaceRequestDto;
import com.intellidoc.backend.dto.PatchWorkspaceRequestDto;
import com.intellidoc.backend.dto.WorkspaceResponseDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping({"/workspaces", "/api/v1/workspaces"})
@RequiredArgsConstructor
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    @PostMapping
    public ResponseEntity<WorkspaceResponseDto> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody CreateWorkspaceRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(workspaceService.create(principal, request));
    }

    @GetMapping
    public ResponseEntity<List<WorkspaceResponseDto>> list(@AuthenticationPrincipal AuthPrincipal principal) {
        return ResponseEntity.ok(workspaceService.listMine(principal));
    }

    @GetMapping("/{workspaceId}")
    public ResponseEntity<WorkspaceResponseDto> get(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId) {
        return ResponseEntity.ok(workspaceService.get(principal, workspaceId));
    }

    @PatchMapping("/{workspaceId}")
    public ResponseEntity<WorkspaceResponseDto> patch(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestBody PatchWorkspaceRequestDto request) {
        return ResponseEntity.ok(workspaceService.patch(principal, workspaceId, request));
    }

    @DeleteMapping("/{workspaceId}")
    public ResponseEntity<WorkspaceResponseDto> archive(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId) {
        return ResponseEntity.ok(workspaceService.archive(principal, workspaceId));
    }
}
