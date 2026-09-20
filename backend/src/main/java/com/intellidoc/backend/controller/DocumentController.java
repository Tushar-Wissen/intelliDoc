package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.AiQAResponseDto;
import com.intellidoc.backend.dto.DocumentResponseDto;
import com.intellidoc.backend.dto.FolderUploadResponseDto;
import com.intellidoc.backend.dto.GetAllDocumentsResponseDto;
import com.intellidoc.backend.service.DocumentService;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping(
        "/api/v1/workspaces/{workspaceId}/documents"
)
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;


    // ============================================================
    // UPLOAD DOCUMENT
    // ============================================================

    @PostMapping(
            consumes = "multipart/form-data"
    )
    public ResponseEntity<FolderUploadResponseDto>
    uploadAndAnalyzeDocument(

            @PathVariable String workspaceId,

            @RequestParam("file")
            MultipartFile file,

            @RequestParam(
                    value = "title",
                    required = false
            )
            String title) {

        FolderUploadResponseDto response =
                documentService.processAndSaveDocument(
                        workspaceId,
                        file,
                        title
                );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }


    // ============================================================
    // GET ALL DOCUMENTS/FOLDERS IN WORKSPACE
    // ============================================================

    @GetMapping
    public ResponseEntity<GetAllDocumentsResponseDto>
    getAllDocuments(
            @PathVariable String workspaceId) {

        return ResponseEntity.ok(
                documentService.getAllDocuments(
                        workspaceId
                )
        );
    }


    // ============================================================
    // GET DOCUMENT BY ID
    // ============================================================

    @GetMapping("/{documentId}")
    public ResponseEntity<DocumentResponseDto>
    getDocumentById(

            @PathVariable String workspaceId,

            @PathVariable String documentId) {

        return ResponseEntity.ok(
                documentService.getDocumentById(
                        workspaceId,
                        documentId
                )
        );
    }


    // ============================================================
    // ASK QUESTION
    // ============================================================

    @PostMapping("/{documentId}/qa")
    public ResponseEntity<AiQAResponseDto>
    askQuestion(

            @PathVariable String workspaceId,

            @PathVariable String documentId,

            @RequestBody Map<String, String>
                    requestPayload) {

        String question =
                requestPayload.get("question");

        if (
                question == null
                        || question.isBlank()
        ) {

            return ResponseEntity
                    .badRequest()
                    .build();
        }

        AiQAResponseDto response =
                documentService.askDocumentQuestion(
                        workspaceId,
                        documentId,
                        question
                );

        return ResponseEntity.ok(response);
    }
}