package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.CreateModuleRequestDto;
import com.intellidoc.backend.dto.ModuleResponseDto;
import com.intellidoc.backend.dto.PatchModuleRequestDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentGroupEntity;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ModuleService {

    static final int NAME_MAX_LENGTH = 255;

    private final DocumentGroupRepository documentGroupRepository;
    private final DocumentRepository documentRepository;
    private final WorkspaceAccessService workspaceAccessService;

    @Transactional
    public ModuleResponseDto create(AuthPrincipal principal, UUID workspaceId, CreateModuleRequestDto request) {
        workspaceAccessService.requireMember(workspaceId, principal.userId());
        String name = requireName(request == null ? null : request.getName());
        if (documentGroupRepository.existsByWorkspaceIdAndName(workspaceId, name)) {
            throw DmsExceptions.moduleNameTaken();
        }
        try {
            DocumentGroupEntity saved = documentGroupRepository.save(DocumentGroupEntity.builder()
                    .workspaceId(workspaceId)
                    .name(name)
                    .build());
            return toDto(saved);
        } catch (DataIntegrityViolationException ex) {
            throw DmsExceptions.moduleNameTaken();
        }
    }

    @Transactional(readOnly = true)
    public List<ModuleResponseDto> list(AuthPrincipal principal, UUID workspaceId) {
        workspaceAccessService.requireMember(workspaceId, principal.userId());
        return documentGroupRepository.findByWorkspaceIdOrderByNameAsc(workspaceId).stream()
                .map(ModuleService::toDto)
                .toList();
    }

    @Transactional
    public ModuleResponseDto rename(AuthPrincipal principal, UUID moduleId, PatchModuleRequestDto request) {
        DocumentGroupEntity module = requireModule(moduleId);
        workspaceAccessService.requireMember(module.getWorkspaceId(), principal.userId());
        String name = requireName(request == null ? null : request.getName());
        if (documentGroupRepository.existsByWorkspaceIdAndNameAndIdNot(module.getWorkspaceId(), name, moduleId)) {
            throw DmsExceptions.moduleNameTaken();
        }
        module.setName(name);
        try {
            return toDto(documentGroupRepository.save(module));
        } catch (DataIntegrityViolationException ex) {
            throw DmsExceptions.moduleNameTaken();
        }
    }

    @Transactional
    public void delete(AuthPrincipal principal, UUID moduleId) {
        DocumentGroupEntity module = requireModule(moduleId);
        workspaceAccessService.requireMember(module.getWorkspaceId(), principal.userId());
        for (DocumentEntity document : documentRepository.findByGroupId(moduleId)) {
            document.setGroupId(null);
            documentRepository.save(document);
        }
        documentGroupRepository.delete(module);
    }

    @Transactional
    public DocumentGroupEntity findOrCreate(UUID workspaceId, String rawName) {
        String name = requireName(rawName);
        return documentGroupRepository.findByWorkspaceIdAndName(workspaceId, name)
                .orElseGet(() -> insertOrReload(workspaceId, name));
    }

    DocumentGroupEntity requireModule(UUID moduleId) {
        return documentGroupRepository.findById(moduleId)
                .orElseThrow(DmsExceptions::moduleNotFound);
    }

    private DocumentGroupEntity insertOrReload(UUID workspaceId, String name) {
        try {
            return documentGroupRepository.save(DocumentGroupEntity.builder()
                    .workspaceId(workspaceId)
                    .name(name)
                    .build());
        } catch (DataIntegrityViolationException ex) {
            return documentGroupRepository.findByWorkspaceIdAndName(workspaceId, name)
                    .orElseThrow(() -> DmsExceptions.moduleNameTaken());
        }
    }

    static String requireName(String name) {
        if (name == null || name.isBlank() || name.trim().length() > NAME_MAX_LENGTH) {
            throw DmsExceptions.moduleInvalidName();
        }
        return name.trim();
    }

    static ModuleResponseDto toDto(DocumentGroupEntity module) {
        return ModuleResponseDto.builder()
                .id(module.getId())
                .workspaceId(module.getWorkspaceId())
                .name(module.getName())
                .createdAt(module.getCreatedAt())
                .build();
    }
}
