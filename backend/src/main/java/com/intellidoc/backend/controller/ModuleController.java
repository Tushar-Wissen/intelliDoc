package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.CreateModuleRequestDto;
import com.intellidoc.backend.dto.ModuleResponseDto;
import com.intellidoc.backend.dto.PatchModuleRequestDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.ModuleService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ModuleController {

    private final ModuleService moduleService;

    @PostMapping({"/workspaces/{workspaceId}/modules", "/api/v1/workspaces/{workspaceId}/modules"})
    public ResponseEntity<ModuleResponseDto> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestBody CreateModuleRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(moduleService.create(principal, workspaceId, request));
    }

    @GetMapping({"/workspaces/{workspaceId}/modules", "/api/v1/workspaces/{workspaceId}/modules"})
    public ResponseEntity<List<ModuleResponseDto>> list(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId) {
        return ResponseEntity.ok(moduleService.list(principal, workspaceId));
    }

    @PatchMapping({"/modules/{moduleId}", "/api/v1/modules/{moduleId}"})
    public ResponseEntity<ModuleResponseDto> rename(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID moduleId,
            @RequestBody PatchModuleRequestDto request) {
        return ResponseEntity.ok(moduleService.rename(principal, moduleId, request));
    }

    @DeleteMapping({"/modules/{moduleId}", "/api/v1/modules/{moduleId}"})
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID moduleId) {
        moduleService.delete(principal, moduleId);
        return ResponseEntity.noContent().build();
    }
}
