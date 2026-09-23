package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.ExtractedFieldDto;
import com.intellidoc.backend.dto.ExtractedFieldListResponseDto;
import com.intellidoc.backend.dto.PatchExtractedFieldRequestDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.FieldService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class FieldController {

    private final FieldService fieldService;

    @GetMapping({"/documents/{documentId}/fields", "/api/v1/documents/{documentId}/fields"})
    public ResponseEntity<ExtractedFieldListResponseDto> list(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId) {
        return ResponseEntity.ok(fieldService.list(principal, documentId));
    }

    @PatchMapping({"/fields/{fieldId}", "/api/v1/fields/{fieldId}"})
    public ResponseEntity<ExtractedFieldDto> patch(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID fieldId,
            @RequestBody PatchExtractedFieldRequestDto request) {
        return ResponseEntity.ok(fieldService.correct(principal, fieldId, request));
    }

    @DeleteMapping({"/fields/{fieldId}", "/api/v1/fields/{fieldId}"})
    public ResponseEntity<ExtractedFieldDto> delete(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID fieldId) {
        return ResponseEntity.ok(fieldService.remove(principal, fieldId));
    }

    @GetMapping({
            "/documents/{documentId}/fields/export",
            "/api/v1/documents/{documentId}/fields/export"
    })
    public ResponseEntity<byte[]> export(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID documentId,
            @RequestParam("format") String format) {
        FieldService.ExportPayload payload = fieldService.export(principal, documentId, format);
        return fileResponse(payload.contentType(), payload.fileName(), payload.bytes());
    }

    private static ResponseEntity<byte[]> fileResponse(String contentType, String fileName, byte[] bytes) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(fileName, StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentLength(bytes.length)
                .body(bytes);
    }
}
