package com.intellidoc.backend.chat;

import com.intellidoc.backend.dms.ProcessingStatus;
import com.intellidoc.backend.dto.ScopeRequestDto;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class ScopeResolver {

    private final DocumentRepository documentRepository;
    private final DocumentGroupRepository documentGroupRepository;

    @Data
    @Builder
    public static class ResolvedScope {
        private String type;
        private UUID moduleId;
        private List<UUID> documentIds;
    }

    public ResolvedScope resolve(UUID workspaceId, ScopeRequestDto scope) {
        if (scope == null || scope.getType() == null) {
            throw DmsExceptions.invalidScope();
        }

        String typeStr = scope.getType().toUpperCase();

        switch (typeStr) {
            case "WORKSPACE":
                if (scope.getModuleId() != null || (scope.getDocumentIds() != null && !scope.getDocumentIds().isEmpty())) {
                    throw DmsExceptions.invalidScope();
                }
                List<DocumentEntity> wsDocs = documentRepository.findByWorkspaceIdAndDeletedAtIsNull(workspaceId);
                List<UUID> wsDocIds = readyDocumentIds(wsDocs);
                if (wsDocIds.isEmpty()) {
                    throw DmsExceptions.emptyScope();
                }
                return ResolvedScope.builder()
                        .type("WORKSPACE")
                        .documentIds(wsDocIds)
                        .build();

            case "MODULE":
                if (scope.getModuleId() == null || (scope.getDocumentIds() != null && !scope.getDocumentIds().isEmpty())) {
                    throw DmsExceptions.invalidScope();
                }
                UUID moduleId = scope.getModuleId();
                boolean moduleInWorkspace = documentGroupRepository.findById(moduleId)
                        .map(g -> workspaceId.equals(g.getWorkspaceId()))
                        .orElse(false);
                if (!moduleInWorkspace) {
                    throw DmsExceptions.scopeOutsideWorkspace();
                }
                List<DocumentEntity> moduleDocs = documentRepository.findByWorkspaceIdAndGroupIdAndDeletedAtIsNull(workspaceId, moduleId);
                List<UUID> moduleDocIds = readyDocumentIds(moduleDocs);
                if (moduleDocIds.isEmpty()) {
                    throw DmsExceptions.emptyScope();
                }
                return ResolvedScope.builder()
                        .type("MODULE")
                        .moduleId(moduleId)
                        .documentIds(moduleDocIds)
                        .build();

            case "DOCUMENTS":
                if (scope.getModuleId() != null || scope.getDocumentIds() == null || scope.getDocumentIds().isEmpty()) {
                    throw DmsExceptions.invalidScope();
                }
                List<UUID> requestedIds = scope.getDocumentIds().stream().distinct().toList();
                List<DocumentEntity> foundDocs = documentRepository.findByWorkspaceIdAndIdInAndDeletedAtIsNull(workspaceId, requestedIds);
                if (foundDocs.size() != requestedIds.size()) {
                    throw DmsExceptions.scopeOutsideWorkspace();
                }
                Set<UUID> foundWorkspaceDocIds = foundDocs.stream().map(DocumentEntity::getId).collect(Collectors.toSet());
                if (!foundWorkspaceDocIds.containsAll(requestedIds)) {
                    throw DmsExceptions.scopeOutsideWorkspace();
                }
                List<UUID> readyDocIds = readyDocumentIds(foundDocs);
                if (readyDocIds.isEmpty()) {
                    throw DmsExceptions.emptyScope();
                }
                return ResolvedScope.builder()
                        .type("DOCUMENTS")
                        .documentIds(readyDocIds)
                        .build();

            default:
                throw DmsExceptions.invalidScope();
        }
    }

    private static List<UUID> readyDocumentIds(List<DocumentEntity> documents) {
        return documents.stream()
                .filter(d -> ProcessingStatus.READY.equals(d.getProcessingStatus()))
                .map(DocumentEntity::getId)
                .toList();
    }
}
