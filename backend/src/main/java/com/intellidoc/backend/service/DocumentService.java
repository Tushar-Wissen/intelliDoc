package com.intellidoc.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.intellidoc.backend.client.AiServiceClient;

import com.intellidoc.backend.dto.AiAnalysisRequestDto;
import com.intellidoc.backend.dto.AiAnalysisResponseDto;
import com.intellidoc.backend.dto.AiQARequestDto;
import com.intellidoc.backend.dto.AiQAResponseDto;
import com.intellidoc.backend.dto.DocumentModuleDto;
import com.intellidoc.backend.dto.DocumentResponseDto;
import com.intellidoc.backend.dto.StructuredDocumentDto;

import com.intellidoc.backend.model.AnalysisResultEntity;
import com.intellidoc.backend.model.AuditLogEntity;
import com.intellidoc.backend.model.DocumentEntity;

import com.intellidoc.backend.repository.AnalysisResultRepository;
import com.intellidoc.backend.repository.AuditLogRepository;
import com.intellidoc.backend.repository.DocumentRepository;

import com.intellidoc.backend.util.DocumentStructureExtractor;
import com.intellidoc.backend.util.DocumentTextExtractor;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;


@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentService {

    private final DocumentRepository documentRepository;

    private final AnalysisResultRepository analysisResultRepository;

    private final AuditLogRepository auditLogRepository;

    private final AiServiceClient aiServiceClient;

    private final DocumentTextExtractor documentTextExtractor;

    private final DocumentStructureExtractor documentStructureExtractor;

    private final ObjectMapper objectMapper =
            new ObjectMapper();


    // ============================================================
    // UPLOAD + EXTRACT + AI ANALYSIS + SAVE
    // ============================================================

    @Transactional
    public DocumentResponseDto processAndSaveDocument(
            String workspaceId,
            MultipartFile file,
            String title
    ) {

        String docId =
                "doc_" +
                        UUID.randomUUID()
                                .toString()
                                .replace("-", "")
                                .substring(0, 12);

        try {

            // ----------------------------------------------------
            // 1. Validate workspace ID
            // ----------------------------------------------------

            if (workspaceId == null || workspaceId.isBlank()) {

                throw new IllegalArgumentException(
                        "Workspace ID cannot be empty"
                );
            }


            // ----------------------------------------------------
            // 2. Validate file
            // ----------------------------------------------------

            if (
                    file == null
                            || file.isEmpty()
            ) {

                throw new IllegalArgumentException(
                        "Please upload a valid document"
                );
            }


            // ----------------------------------------------------
            // 3. Determine title
            // ----------------------------------------------------

            String documentTitle =
                    title;

            if (
                    documentTitle == null
                            || documentTitle.isBlank()
            ) {

                documentTitle =
                        file.getOriginalFilename();

                if (
                        documentTitle == null
                                || documentTitle.isBlank()
                ) {

                    documentTitle =
                            "Untitled Document";
                }
            }


            // ----------------------------------------------------
            // 4. Extract document text
            // ----------------------------------------------------

            log.info(
                    "Extracting text from document: {}",
                    file.getOriginalFilename()
            );


            String extractedText;


            // ----------------------------------------------------
            // PDF / PPTX use structured extraction
            // ----------------------------------------------------

            String fileName =
                    file.getOriginalFilename();

            boolean structuredFile =
                    fileName != null
                            && (
                            fileName
                                    .toLowerCase()
                                    .endsWith(".pdf")
                                    ||
                                    fileName
                                            .toLowerCase()
                                            .endsWith(".pptx")
                    );


            StructuredDocumentDto structuredDocument =
                    null;


            if (structuredFile) {

                log.info(
                        "Using structured extraction for: {}",
                        fileName
                );


                structuredDocument =
                        documentStructureExtractor.extract(
                                file
                        );


                extractedText =
                        structuredDocument.getContent();


                // ------------------------------------------------
                // Fallback if structured extraction has no text
                // ------------------------------------------------

                if (
                        extractedText == null
                                || extractedText.isBlank()
                ) {

                    log.warn(
                            "Structured extraction returned "
                                    + "no text. Falling back to "
                                    + "DocumentTextExtractor."
                    );


                    extractedText =
                            documentTextExtractor
                                    .extractText(file);


                    structuredDocument =
                            null;
                }

            } else {

                // ------------------------------------------------
                // DOCX / PNG / JPG / JPEG
                // ------------------------------------------------

                extractedText =
                        documentTextExtractor
                                .extractText(file);
            }


            // ----------------------------------------------------
            // 5. Validate extracted text
            // ----------------------------------------------------

            if (
                    extractedText == null
                            || extractedText.isBlank()
            ) {

                throw new IllegalArgumentException(
                        "No text could be extracted "
                                + "from the document"
                );
            }


            log.info(
                    "Successfully extracted {} characters from {}",
                    extractedText.length(),
                    file.getOriginalFilename()
            );


            // ----------------------------------------------------
            // 6. Create document entity
            // ----------------------------------------------------

            DocumentEntity document =
                    DocumentEntity.builder()

                            .id(docId)

                            // IMPORTANT:
                            // Associate document with workspace
                            .workspaceId(workspaceId)

                            .title(documentTitle)

                            .content(extractedText)

                            .contentType(
                                    file.getContentType()
                                            != null
                                            ? file.getContentType()
                                            : "application/octet-stream"
                            )

                            .status("PROCESSING")

                            .build();


            documentRepository.save(
                    document
            );


            logAudit(
                    "DOCUMENT_CREATED",
                    "Created document record: "
                            + docId
                            + " in workspace: "
                            + workspaceId
            );


            // ----------------------------------------------------
            // 7. Create AI request
            // ----------------------------------------------------

            log.info(
                    "Sending document {} to AI Service "
                            + "for analysis",
                    docId
            );


            AiAnalysisRequestDto aiRequest =
                    AiAnalysisRequestDto.builder()

                            .documentId(docId)

                            .title(documentTitle)

                            .content(extractedText)

                            .maxSummaryLength(200)

                            .blocks(
                                    structuredDocument != null
                                            ? structuredDocument
                                            .getBlocks()
                                            : Collections.emptyList()
                            )

                            .build();


            log.info(
                    "Sending {} structured blocks to AI Service",
                    aiRequest.getBlocks().size()
            );


            // ----------------------------------------------------
            // 8. Call Python AI service
            // ----------------------------------------------------

            AiAnalysisResponseDto aiResponse =
                    aiServiceClient.analyzeDocument(
                            aiRequest
                    );


            if (aiResponse == null) {

                throw new RuntimeException(
                        "AI Service returned an empty response"
                );
            }


            log.info(
                    "AI analysis completed for document {}",
                    docId
            );


            // ----------------------------------------------------
            // 9. Get modules
            // ----------------------------------------------------

            List<DocumentModuleDto> modules =
                    aiResponse.getModules();


            if (modules == null) {

                modules =
                        Collections.emptyList();
            }


            log.info(
                    "AI Service returned {} top-level "
                            + "modules for document {}",
                    modules.size(),
                    docId
            );


            // ----------------------------------------------------
            // 10. Save analysis result
            // ----------------------------------------------------

            AnalysisResultEntity analysisResult =
                    AnalysisResultEntity.builder()

                            .id(
                                    "analysis_" +
                                            UUID.randomUUID()
                                                    .toString()
                                                    .replace("-", "")
                                                    .substring(0, 12)
                            )

                            .documentId(docId)

                            .modulesJson(
                                    serializeJson(
                                            modules
                                    )
                            )

                            .build();


            analysisResultRepository.save(
                    analysisResult
            );


            log.info(
                    "Analysis result saved for document {}",
                    docId
            );


            // ----------------------------------------------------
            // 11. Mark completed
            // ----------------------------------------------------

            document.setStatus(
                    "COMPLETED"
            );


            documentRepository.save(
                    document
            );


            logAudit(
                    "DOCUMENT_ANALYZED",
                    "Document processing completed: "
                            + docId
                            + " in workspace: "
                            + workspaceId
            );


            // ----------------------------------------------------
            // 12. Return response
            // ----------------------------------------------------

            return mapToResponseDto(
                    document,
                    analysisResult
            );


        } catch (Exception e) {

            log.error(
                    "Failed to process document {}: {}",
                    docId,
                    e.getMessage(),
                    e
            );


            // ----------------------------------------------------
            // Mark FAILED
            // ----------------------------------------------------

            DocumentEntity failedDocument =
                    documentRepository
                            .findById(docId)
                            .orElse(null);


            if (failedDocument != null) {

                failedDocument.setStatus(
                        "FAILED"
                );

                documentRepository.save(
                        failedDocument
                );
            }


            logAudit(
                    "DOCUMENT_PROCESSING_FAILED",
                    "Document processing failed: "
                            + docId
                            + ", workspace: "
                            + workspaceId
                            + ", error: "
                            + e.getMessage()
            );


            throw new RuntimeException(
                    "Document processing failed: "
                            + e.getMessage(),
                    e
            );
        }
    }


    // ============================================================
    // GET ALL DOCUMENTS FOR WORKSPACE
    // ============================================================

    public List<DocumentResponseDto> getAllDocuments(
            String workspaceId
    ) {

        if (workspaceId == null || workspaceId.isBlank()) {

            throw new IllegalArgumentException(
                    "Workspace ID cannot be empty"
            );
        }


        return documentRepository
                .findByWorkspaceIdOrderByCreatedAtDesc(
                        workspaceId
                )
                .stream()
                .map(doc -> {

                    AnalysisResultEntity result =
                            analysisResultRepository
                                    .findByDocumentId(
                                            doc.getId()
                                    )
                                    .orElse(null);


                    return mapToResponseDto(
                            doc,
                            result
                    );
                })
                .collect(Collectors.toList());
    }


    // ============================================================
    // GET DOCUMENT BY ID
    // ============================================================

    public DocumentResponseDto getDocumentById(
            String workspaceId,
            String documentId
    ) {

        if (workspaceId == null || workspaceId.isBlank()) {

            throw new IllegalArgumentException(
                    "Workspace ID cannot be empty"
            );
        }


        DocumentEntity doc =
                documentRepository
                        .findByIdAndWorkspaceId(
                                documentId,
                                workspaceId
                        )
                        .orElseThrow(
                                () ->
                                        new RuntimeException(
                                                "Document not found "
                                                        + "with ID: "
                                                        + documentId
                                                        + " in workspace: "
                                                        + workspaceId
                                        )
                        );


        AnalysisResultEntity result =
                analysisResultRepository
                        .findByDocumentId(documentId)
                        .orElse(null);


        return mapToResponseDto(
                doc,
                result
        );
    }


    // ============================================================
    // ASK QUESTION
    // ============================================================

    public AiQAResponseDto askDocumentQuestion(
            String workspaceId,
            String documentId,
            String question
    ) {

        // --------------------------------------------------------
        // Verify document belongs to workspace
        // --------------------------------------------------------

        DocumentEntity doc =
                documentRepository
                        .findByIdAndWorkspaceId(
                                documentId,
                                workspaceId
                        )
                        .orElseThrow(
                                () ->
                                        new RuntimeException(
                                                "Document not found "
                                                        + "with ID: "
                                                        + documentId
                                                        + " in workspace: "
                                                        + workspaceId
                                        )
                        );


        // --------------------------------------------------------
        // Create AI Q&A request
        // --------------------------------------------------------

        AiQARequestDto request =
                AiQARequestDto.builder()

                        .documentId(
                                documentId
                        )

                        .context(
                                doc.getContent()
                        )

                        .question(
                                question
                        )

                        .build();


        // --------------------------------------------------------
        // Call AI service
        // --------------------------------------------------------

        AiQAResponseDto response =
                aiServiceClient.askQuestion(
                        request
                );


        logAudit(
                "DOCUMENT_QA",
                "Answered question for document: "
                        + documentId
                        + " in workspace: "
                        + workspaceId
        );


        return response;
    }


    // ============================================================
    // SERIALIZE JSON
    // ============================================================

    private String serializeJson(
            Object obj
    ) {

        try {

            return objectMapper.writeValueAsString(
                    obj != null
                            ? obj
                            : Collections.emptyList()
            );

        } catch (JsonProcessingException e) {

            log.warn(
                    "Could not serialize JSON: {}",
                    e.getMessage()
            );

            return "[]";
        }
    }


    // ============================================================
    // DESERIALIZE MODULES
    // ============================================================

    private List<DocumentModuleDto> deserializeModules(
            String json
    ) {

        if (
                json == null
                        || json.isBlank()
        ) {

            return Collections.emptyList();
        }


        try {

            return objectMapper.readValue(
                    json,
                    new TypeReference<
                            List<DocumentModuleDto>
                            >() {
                    }
            );

        } catch (Exception e) {

            log.warn(
                    "Could not deserialize modules JSON: {}",
                    e.getMessage()
            );

            return Collections.emptyList();
        }
    }


    // ============================================================
    // MAP RESPONSE
    // ============================================================

    private DocumentResponseDto mapToResponseDto(
            DocumentEntity doc,
            AnalysisResultEntity analysis
    ) {

        List<DocumentModuleDto> modules =
                Collections.emptyList();


        if (analysis != null) {

            modules =
                    deserializeModules(
                            analysis.getModulesJson()
                    );
        }


        return DocumentResponseDto.builder()

                .id(
                        doc.getId()
                )

                .title(
                        doc.getTitle()
                )

                .status(
                        doc.getStatus()
                )

                .modules(
                        modules
                )

                .build();
    }


    // ============================================================
    // AUDIT LOG
    // ============================================================

    private void logAudit(
            String eventType,
            String details
    ) {

        try {

            AuditLogEntity logEntity =
                    AuditLogEntity.builder()

                            .id(
                                    "audit_" +
                                            UUID.randomUUID()
                                                    .toString()
                                                    .replace("-", "")
                                                    .substring(0, 12)
                            )

                            .eventType(
                                    eventType
                            )

                            .serviceName(
                                    "Spring Boot Backend"
                            )

                            .details(
                                    details
                            )

                            .build();


            auditLogRepository.save(
                    logEntity
            );


        } catch (Exception e) {

            log.warn(
                    "Could not save audit log: {}",
                    e.getMessage()
            );
        }
    }
}