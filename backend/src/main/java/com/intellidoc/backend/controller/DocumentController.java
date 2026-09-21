package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.*;
import com.intellidoc.backend.service.DocumentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
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

    @PostMapping(value = "/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponseDto> uploadFile(@RequestParam("file") MultipartFile file) {
        DocumentResponseDto response = documentService.processAndSaveUploadedDocument(file);
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
}
