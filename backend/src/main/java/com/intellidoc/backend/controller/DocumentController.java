package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.*;
import com.intellidoc.backend.service.DocumentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/documents")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;

    @PostMapping
    public ResponseEntity<DocumentResponseDto> uploadAndAnalyzeDocument(@Valid @RequestBody DocumentUploadDto uploadDto) {
        DocumentResponseDto response = documentService.processAndSaveDocument(uploadDto);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<DocumentResponseDto>> getAllDocuments() {
        return ResponseEntity.ok(documentService.getAllDocuments());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DocumentResponseDto> getDocumentById(@PathVariable String id) {
        return ResponseEntity.ok(documentService.getDocumentById(id));
    }

    @PostMapping("/{id}/qa")
    public ResponseEntity<AiQAResponseDto> askQuestion(
            @PathVariable String id,
            @RequestBody Map<String, String> requestPayload) {
        String question = requestPayload.get("question");
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        AiQAResponseDto response = documentService.askDocumentQuestion(id, question);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}/fields")
    public ResponseEntity<List<ExtractedFieldDto>> getFields(@PathVariable String id) {
        return ResponseEntity.ok(documentService.getFields(id));
    }

    @PatchMapping("/fields/{fieldId}")
    public ResponseEntity<ExtractedFieldDto> updateField(
            @PathVariable String fieldId,
            @RequestHeader(value = "X-Actor-Id", defaultValue = "api-user") String actorId,
            @Valid @RequestBody FieldUpdateRequestDto request) {
        return ResponseEntity.ok(documentService.updateField(fieldId, request, actorId));
    }

    @DeleteMapping("/fields/{fieldId}")
    public ResponseEntity<Void> deleteField(
            @PathVariable String fieldId,
            @RequestHeader(value = "X-Actor-Id", defaultValue = "api-user") String actorId) {
        documentService.deleteField(fieldId, actorId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/fields/export")
    public ResponseEntity<byte[]> exportFields(
            @PathVariable String id,
            @RequestParam(defaultValue = "json") String format) {
        String normalizedFormat = format.toLowerCase();
        byte[] body = documentService.exportFields(id, normalizedFormat);
        String contentType = "csv".equals(normalizedFormat) ? "text/csv" : MediaType.APPLICATION_JSON_VALUE;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=fields." + normalizedFormat)
                .contentType(MediaType.parseMediaType(contentType))
                .body(body);
    }
}
