package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.CreateModuleRequestDto;
import com.intellidoc.backend.dto.ModuleFileDto;
import com.intellidoc.backend.dto.ModuleResponseDto;
import com.intellidoc.backend.dto.PatchModuleRequestDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.ChatSessionEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentGroupEntity;
import com.intellidoc.backend.repository.ChatSessionRepository;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ModuleService {

    static final int NAME_MAX_LENGTH = 255;

    private final DocumentGroupRepository documentGroupRepository;
    private final DocumentRepository documentRepository;
    private final DocumentWriteService documentWriteService;
    private final ChatSessionRepository chatSessionRepository;
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
        Map<UUID, List<DocumentEntity>> documentsByModule = documentRepository
                .findByWorkspaceIdAndDeletedAtIsNull(workspaceId)
                .stream()
                .filter(document -> document.getGroupId() != null)
                .collect(Collectors.groupingBy(DocumentEntity::getGroupId));
        return documentGroupRepository.findByWorkspaceIdOrderByNameAsc(workspaceId).stream()
                .map(module -> toDtoWithFiles(module, documentsByModule.getOrDefault(module.getId(), List.of())))
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
        archiveModuleDocuments(module);
        removeModule(module);
    }

    @Transactional
    void deleteAllForWorkspace(UUID workspaceId) {
        for (DocumentGroupEntity module : documentGroupRepository.findByWorkspaceIdOrderByNameAsc(workspaceId)) {
            removeModule(module);
        }
    }

    private void archiveModuleDocuments(DocumentGroupEntity module) {
        documentRepository.findByWorkspaceIdAndGroupIdAndDeletedAtIsNull(module.getWorkspaceId(), module.getId())
                .forEach(documentWriteService::archive);
    }

    private void removeModule(DocumentGroupEntity module) {
        clearModuleScopeReferences(module.getId());
        documentGroupRepository.delete(module);
    }

    private void clearModuleScopeReferences(UUID moduleId) {
        for (ChatSessionEntity session : chatSessionRepository.findByScopeModuleId(moduleId)) {
            session.setScopeModuleId(null);
            chatSessionRepository.save(session);
        }
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

    private static ModuleResponseDto toDtoWithFiles(DocumentGroupEntity module, List<DocumentEntity> documents) {
        List<ModuleFileDto> files = documents.stream()
                .sorted(Comparator.comparing(DocumentEntity::getCreatedAt).reversed())
                .map(ModuleService::toFileDto)
                .toList();
        return ModuleResponseDto.builder()
                .id(module.getId())
                .workspaceId(module.getWorkspaceId())
                .name(module.getName())
                .createdAt(module.getCreatedAt())
                .totalFiles(files.size())
                .files(new ArrayList<>(files))
                .build();
    }

    private static ModuleFileDto toFileDto(DocumentEntity document) {
        return ModuleFileDto.builder()
                .id(document.getId())
                .name(document.getFileName())
                .type(document.getFileType().toUpperCase(Locale.ROOT))
                .size(document.getFileSizeBytes())
                .createdAt(document.getCreatedAt())
                .build();
    }
}
