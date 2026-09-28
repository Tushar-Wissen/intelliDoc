package com.intellidoc.backend.service;

import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dms.ProcessingStatus;
import com.intellidoc.backend.dto.AssignModuleRequestDto;
import com.intellidoc.backend.dto.DocumentDetailDto;
import com.intellidoc.backend.dto.DocumentListResponseDto;
import com.intellidoc.backend.dto.DocumentOriginalFileDto;
import com.intellidoc.backend.dto.DocumentSummaryDto;
import com.intellidoc.backend.dto.DocumentUploadResponseDto;
import com.intellidoc.backend.dto.UploadRejectionDto;
import com.intellidoc.backend.exception.ApiException;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentGroupEntity;
import com.intellidoc.backend.repository.DocumentGroupRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.storage.MinioStorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class DocumentService {

    private final WorkspaceAccessService workspaceAccessService;
    private final ModuleService moduleService;
    private final DocumentRepository documentRepository;
    private final DocumentGroupRepository documentGroupRepository;
    private final DocumentWriteService documentWriteService;
    private final MinioStorageService minioStorageService;
    private final AiServiceClient aiServiceClient;
    private final long maxFileSizeBytes;
    private final Set<String> allowedExtensions;

    public DocumentService(
            WorkspaceAccessService workspaceAccessService,
            ModuleService moduleService,
            DocumentRepository documentRepository,
            DocumentGroupRepository documentGroupRepository,
            DocumentWriteService documentWriteService,
            MinioStorageService minioStorageService,
            AiServiceClient aiServiceClient,
            @Value("${intellidoc.upload.max-file-size-bytes:20971520}") long maxFileSizeBytes,
            @Value("${intellidoc.upload.allowed-extensions:pdf,docx}") String allowedExtensions) {
        this.workspaceAccessService = workspaceAccessService;
        this.moduleService = moduleService;
        this.documentRepository = documentRepository;
        this.documentGroupRepository = documentGroupRepository;
        this.documentWriteService = documentWriteService;
        this.minioStorageService = minioStorageService;
        this.aiServiceClient = aiServiceClient;
        this.maxFileSizeBytes = maxFileSizeBytes;
        this.allowedExtensions = Arrays.stream(allowedExtensions.split(","))
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public DocumentUploadResponseDto upload(
            AuthPrincipal principal,
            UUID workspaceId,
            List<MultipartFile> files,
            List<String> relativePaths) {
        workspaceAccessService.requireMember(workspaceId, principal.userId());
        List<MultipartFile> incoming = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        List<DocumentSummaryDto> accepted = new ArrayList<>();
        List<UploadRejectionDto> rejections = new ArrayList<>();
        for (int i = 0; i < incoming.size(); i++) {
            MultipartFile file = incoming.get(i);
            String relativePath = relativePaths != null && i < relativePaths.size() ? relativePaths.get(i) : null;
            try {
                accepted.add(acceptOne(principal, workspaceId, file, resolveModuleId(workspaceId, relativePath)));
            } catch (ApiException ex) {
                log.warn("Rejected upload {} code={}", file.getOriginalFilename(), ex.getCode());
                rejections.add(UploadRejectionDto.builder()
                        .fileName(file.getOriginalFilename())
                        .code(ex.getCode())
                        .message(ex.getMessage())
                        .build());
            } catch (MinioStorageService.StorageWriteException ex) {
                log.warn("Storage write failed for {}", file.getOriginalFilename(), ex);
                rejections.add(UploadRejectionDto.builder()
                        .fileName(file.getOriginalFilename())
                        .code("STORAGE_WRITE_FAILED")
                        .message("Failed to store file: " + file.getOriginalFilename())
                        .build());
            }
        }
        return DocumentUploadResponseDto.builder()
                .documents(accepted)
                .rejections(rejections)
                .build();
    }

    public DocumentUploadResponseDto uploadToModule(
            AuthPrincipal principal,
            UUID moduleId,
            List<MultipartFile> files) {
        DocumentGroupEntity module = moduleService.requireModule(moduleId);
        workspaceAccessService.requireMember(module.getWorkspaceId(), principal.userId());
        List<MultipartFile> incoming = files == null ? List.of() : files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        List<DocumentSummaryDto> accepted = new ArrayList<>();
        List<UploadRejectionDto> rejections = new ArrayList<>();
        for (MultipartFile file : incoming) {
            try {
                accepted.add(acceptOne(principal, module.getWorkspaceId(), file, module.getId()));
            } catch (ApiException ex) {
                log.warn("Rejected module upload {} code={}", file.getOriginalFilename(), ex.getCode());
                rejections.add(UploadRejectionDto.builder()
                        .fileName(file.getOriginalFilename())
                        .code(ex.getCode())
                        .message(ex.getMessage())
                        .build());
            } catch (MinioStorageService.StorageWriteException ex) {
                log.warn("Storage write failed for {}", file.getOriginalFilename(), ex);
                rejections.add(UploadRejectionDto.builder()
                        .fileName(file.getOriginalFilename())
                        .code("STORAGE_WRITE_FAILED")
                        .message("Failed to store file: " + file.getOriginalFilename())
                        .build());
            }
        }
        return DocumentUploadResponseDto.builder()
                .documents(accepted)
                .rejections(rejections)
                .build();
    }

    public DocumentListResponseDto list(
            AuthPrincipal principal,
            UUID workspaceId,
            UUID moduleId,
            String documentType) {
        workspaceAccessService.requireMember(workspaceId, principal.userId());
        String typeFilter = documentType == null || documentType.isBlank() ? null : documentType.trim();
        List<DocumentSummaryDto> documents = documentRepository.searchActive(workspaceId, moduleId, typeFilter)
                .stream()
                .map(this::toSummary)
                .toList();
        return DocumentListResponseDto.builder().documents(documents).build();
    }

    public DocumentDetailDto get(AuthPrincipal principal, UUID documentId) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        return toDetail(document);
    }

    public DocumentOriginalFileDto getOriginal(AuthPrincipal principal, UUID documentId) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        try {
            MinioStorageService.StoredObject stored = minioStorageService.load(document.getStoragePath());
            return DocumentOriginalFileDto.builder()
                    .bytes(stored.bytes())
                    .contentType(mediaTypeFor(document.getFileType(), stored.contentType()))
                    .fileName(document.getFileName())
                    .build();
        } catch (MinioStorageService.StorageReadException ex) {
            throw DmsExceptions.storageReadFailed(document.getFileName());
        }
    }

    public DocumentDetailDto assignModule(AuthPrincipal principal, UUID documentId, AssignModuleRequestDto request) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        UUID moduleId = request == null ? null : request.getModuleId();
        if (moduleId == null) {
            document.setGroupId(null);
            return toDetail(documentWriteService.save(document));
        }
        DocumentGroupEntity module = moduleService.requireModule(moduleId);
        if (!module.getWorkspaceId().equals(document.getWorkspaceId())) {
            throw DmsExceptions.invalidModuleScope();
        }
        workspaceAccessService.requireMember(module.getWorkspaceId(), principal.userId());
        document.setGroupId(module.getId());
        return toDetail(documentWriteService.save(document));
    }

    public DocumentDetailDto retry(AuthPrincipal principal, UUID documentId) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        if (!ProcessingStatus.FAILED.equals(document.getProcessingStatus())) {
            throw DmsExceptions.invalidStateTransition();
        }
        DocumentEntity updated = documentWriteService.markParsing(document);
        aiServiceClient.triggerProcessing(updated.getId());
        log.info("Retry queued for document {}", updated.getId());
        return toDetail(updated);
    }

    public void archive(AuthPrincipal principal, UUID documentId) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        documentWriteService.archive(document);
        log.info("Archived document {}", documentId);
    }

    private DocumentSummaryDto acceptOne(
            AuthPrincipal principal,
            UUID workspaceId,
            MultipartFile file,
            UUID moduleId) {
        String fileName = file.getOriginalFilename() == null ? "unnamed" : file.getOriginalFilename();
        String extension = extensionOf(fileName);
        if (!allowedExtensions.contains(extension)) {
            throw DmsExceptions.unsupportedFileType(fileName);
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw DmsExceptions.fileTooLarge(fileName);
        }

        UUID documentId = UUID.randomUUID();
        String storagePath = "workspace/" + workspaceId + "/document/" + documentId + "/original." + extension;
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception ex) {
            throw DmsExceptions.storageWriteFailed(fileName);
        }
        minioStorageService.store(storagePath, bytes, file.getContentType());

        DocumentEntity saved = documentWriteService.saveUploaded(DocumentEntity.builder()
                .id(documentId)
                .workspaceId(workspaceId)
                .groupId(moduleId)
                .fileName(fileName)
                .fileType(extension)
                .fileSizeBytes(file.getSize())
                .storagePath(storagePath)
                .processingStatus(ProcessingStatus.UPLOADED)
                .uploadedBy(principal.userId())
                .build());
        aiServiceClient.triggerProcessing(saved.getId());
        log.info("DOCUMENT_UPLOADED documentId={} workspaceId={} path={}", saved.getId(), workspaceId, storagePath);
        return toSummary(saved);
    }

    private UUID resolveModuleId(UUID workspaceId, String relativePath) {
        String topLevel = topLevelFolder(relativePath);
        if (topLevel == null) {
            return null;
        }
        return moduleService.findOrCreate(workspaceId, topLevel).getId();
    }

    static String topLevelFolder(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return null;
        }
        String normalized = relativePath.replace('\\', '/').trim();
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        String[] parts = normalized.split("/");
        if (parts.length < 2) {
            return null;
        }
        String folder = parts[0].trim();
        if (folder.isEmpty() || ".".equals(folder) || "..".equals(folder)) {
            return null;
        }
        return folder;
    }

    static String extensionOf(String fileName) {
        int slash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
        String base = slash >= 0 ? fileName.substring(slash + 1) : fileName;
        int dot = base.lastIndexOf('.');
        if (dot < 0 || dot == base.length() - 1) {
            return "";
        }
        return base.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private DocumentEntity requireActiveDocument(UUID documentId) {
        return documentRepository.findByIdAndDeletedAtIsNull(documentId)
                .orElseThrow(DmsExceptions::documentNotFound);
    }

    private DocumentSummaryDto toSummary(DocumentEntity document) {
        String moduleName = null;
        if (document.getGroupId() != null) {
            moduleName = documentGroupRepository.findById(document.getGroupId())
                    .map(DocumentGroupEntity::getName)
                    .orElse(null);
        }
        return DocumentSummaryDto.builder()
                .id(document.getId())
                .fileName(document.getFileName())
                .moduleId(document.getGroupId())
                .moduleName(moduleName)
                .documentType(document.getDocumentType())
                .processingStatus(document.getProcessingStatus())
                .createdAt(document.getCreatedAt())
                .build();
    }

    private DocumentDetailDto toDetail(DocumentEntity document) {
        return DocumentDetailDto.builder()
                .id(document.getId())
                .fileName(document.getFileName())
                .documentType(document.getDocumentType())
                .classificationConfidence(document.getClassificationConfidence())
                .processingStatus(document.getProcessingStatus())
                .overview(document.getOverview())
                .summary(document.getSummary())
                .pageCount(0)
                .moduleId(document.getGroupId())
                .createdAt(document.getCreatedAt())
                .build();
    }

    static String mediaTypeFor(String fileType, String storedType) {
        if (storedType != null && !storedType.isBlank() && !"application/octet-stream".equalsIgnoreCase(storedType)) {
            return storedType;
        }
        if ("pdf".equalsIgnoreCase(fileType)) {
            return "application/pdf";
        }
        if ("docx".equalsIgnoreCase(fileType)) {
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        return storedType == null || storedType.isBlank() ? "application/octet-stream" : storedType;
    }
}
