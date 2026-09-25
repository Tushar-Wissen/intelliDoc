package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.AssignModuleRequestDto;
import com.intellidoc.backend.dto.DocumentDetailDto;
import com.intellidoc.backend.dto.DocumentListResponseDto;
import com.intellidoc.backend.dto.DocumentOriginalFileDto;
import com.intellidoc.backend.dto.DocumentUploadResponseDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;

    @PostMapping(
            value = {"/workspaces/{workspaceId}/documents", "/api/v1/workspaces/{workspaceId}/documents"},
            consumes = "multipart/form-data"
    )
    public ResponseEntity<DocumentUploadResponseDto> upload(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestParam(value = "files", required = false) List<MultipartFile> files,
            @RequestParam(value = "files[]", required = false) List<MultipartFile> filesBracket,
            @RequestParam(value = "relativePaths", required = false) List<String> relativePaths,
            @RequestParam(value = "relativePaths[]", required = false) List<String> relativePathsBracket) {
        List<MultipartFile> incoming = mergeFiles(files, filesBracket);
        List<String> paths = relativePaths != null ? relativePaths : relativePathsBracket;
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(documentService.upload(principal, workspaceId, incoming, paths));
    }

    @PostMapping(
            value = {"/modules/{moduleId}/documents", "/api/v1/modules/{moduleId}/documents"},
            consumes = "multipart/form-data"
    )
    public ResponseEntity<DocumentUploadResponseDto> uploadToModule(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID moduleId,
            @RequestParam(value = "files", required = false) List<MultipartFile> files,
            @RequestParam(value = "files[]", required = false) List<MultipartFile> filesBracket) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(documentService.uploadToModule(principal, moduleId, mergeFiles(files, filesBracket)));
    }

    @GetMapping({"/workspaces/{workspaceId}/documents", "/api/v1/workspaces/{workspaceId}/documents"})
    public ResponseEntity<DocumentListResponseDto> list(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID workspaceId,
            @RequestParam(value = "moduleId", required = false) UUID moduleId,
            @RequestParam(value = "documentType", required = false) String documentType) {
        return ResponseEntity.ok(documentService.list(principal, workspaceId, moduleId, documentType));
    }

    @GetMapping({"/documents/{documentId}", "/api/v1/documents/{documentId}"})
    public ResponseEntity<DocumentDetailDto> get(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId) {
        return ResponseEntity.ok(documentService.get(principal, documentId));
    }

    @GetMapping({"/documents/{documentId}/file", "/api/v1/documents/{documentId}/file"})
    public ResponseEntity<byte[]> getOriginal(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId) {
        DocumentOriginalFileDto file = documentService.getOriginal(principal, documentId);
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(file.getContentType());
        } catch (Exception ex) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(file.getFileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentLength(file.getBytes().length)
                .body(file.getBytes());
    }

    @PatchMapping({"/documents/{documentId}/module", "/api/v1/documents/{documentId}/module"})
    public ResponseEntity<DocumentDetailDto> assignModule(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId,
            @RequestBody(required = false) AssignModuleRequestDto request) {
        return ResponseEntity.ok(documentService.assignModule(principal, documentId, request));
    }

    @PostMapping({"/documents/{documentId}/retry", "/api/v1/documents/{documentId}/retry"})
    public ResponseEntity<DocumentDetailDto> retry(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId) {
        return ResponseEntity.ok(documentService.retry(principal, documentId));
    }

    @DeleteMapping({"/documents/{documentId}", "/api/v1/documents/{documentId}"})
    public ResponseEntity<Void> archive(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId) {
        documentService.archive(principal, documentId);
        return ResponseEntity.noContent().build();
    }

    private static List<MultipartFile> mergeFiles(List<MultipartFile> files, List<MultipartFile> filesBracket) {
        List<MultipartFile> merged = new ArrayList<>();
        if (files != null) {
            merged.addAll(files);
        }
        if (filesBracket != null) {
            merged.addAll(filesBracket);
        }
        return merged;
    }
}
