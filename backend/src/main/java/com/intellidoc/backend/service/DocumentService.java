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
import com.intellidoc.backend.dto.FolderDocumentResponseDto;
import com.intellidoc.backend.dto.FolderFileResponseDto;
import com.intellidoc.backend.dto.FolderSectionResponseDto;
import com.intellidoc.backend.dto.FolderUploadResponseDto;
import com.intellidoc.backend.dto.GetAllDocumentsResponseDto;
import com.intellidoc.backend.dto.StructuredDocumentDto;

import com.intellidoc.backend.model.AnalysisResultEntity;
import com.intellidoc.backend.model.AuditLogEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.FolderEntity;

import com.intellidoc.backend.repository.AnalysisResultRepository;
import com.intellidoc.backend.repository.AuditLogRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.FolderRepository;

import com.intellidoc.backend.util.DocumentStructureExtractor;
import com.intellidoc.backend.util.DocumentTextExtractor;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;


@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentService {

    private final DocumentRepository documentRepository;

    private final AnalysisResultRepository analysisResultRepository;

    private final AuditLogRepository auditLogRepository;

    private final FolderRepository folderRepository;

    private final AiServiceClient aiServiceClient;

    private final DocumentTextExtractor documentTextExtractor;

    private final DocumentStructureExtractor documentStructureExtractor;

    private final ObjectMapper objectMapper =
            new ObjectMapper();


    // ============================================================
    // UPLOAD + FOLDER + EXTRACTION + AI ANALYSIS + SAVE
    // ============================================================

    @Transactional
    public FolderUploadResponseDto processAndSaveDocument(
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
            // 1. Validate workspace
            // ----------------------------------------------------

            if (
                    workspaceId == null
                            || workspaceId.isBlank()
            ) {

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
            // 3. Determine folder name
            // ----------------------------------------------------

            String folderName =
                    title;

            if (
                    folderName == null
                            || folderName.isBlank()
            ) {

                folderName =
                        file.getOriginalFilename();

                if (
                        folderName == null
                                || folderName.isBlank()
                ) {

                    folderName =
                            "Untitled Document";
                }
            }

            folderName =
                    folderName.trim();


            // ----------------------------------------------------
            // 4. Find existing folder or create new folder
            // ----------------------------------------------------

            FolderEntity folder =
                    folderRepository
                            .findByWorkspaceIdAndName(
                                    workspaceId,
                                    folderName
                            )
                            .orElse(null);

            boolean newFolder =
                    false;


            if (folder == null) {

                String folderId =
                        "folder_" +
                                UUID.randomUUID()
                                        .toString()
                                        .replace("-", "")
                                        .substring(0, 12);

                folder =
                        FolderEntity.builder()

                                .id(folderId)

                                .workspaceId(
                                        workspaceId
                                )

                                .name(
                                        folderName
                                )

                                .status(
                                        "PROCESSING"
                                )

                                .build();

                folder =
                        folderRepository.save(
                                folder
                        );

                newFolder = true;

                log.info(
                        "Created new folder '{}' with ID {} "
                                + "in workspace {}",
                        folderName,
                        folder.getId(),
                        workspaceId
                );

            } else {

                log.info(
                        "Using existing folder '{}' with ID {} "
                                + "in workspace {}",
                        folderName,
                        folder.getId(),
                        workspaceId
                );
            }


            // ----------------------------------------------------
            // 5. Extract document text
            // ----------------------------------------------------

            log.info(
                    "Extracting text from document: {}",
                    file.getOriginalFilename()
            );


            String extractedText;

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

                extractedText =
                        documentTextExtractor
                                .extractText(file);
            }


            // ----------------------------------------------------
            // 6. Validate extracted text
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
            // 7. Create document entity
            // ----------------------------------------------------

            DocumentEntity document =
                    DocumentEntity.builder()

                            .id(docId)

                            .workspaceId(
                                    workspaceId
                            )

                            .folderId(
                                    folder.getId()
                            )

                            /*
                             * Existing POST behavior:
                             * title remains the folder name.
                             */
                            .title(
                                    folderName
                            )

                            /*
                             * NEW:
                             * Store actual uploaded file name.
                             */
                            .fileName(
                                    file.getOriginalFilename()
                            )

                            .content(
                                    extractedText
                            )

                            .contentType(
                                    file.getContentType()
                                            != null
                                            ? file.getContentType()
                                            : "application/octet-stream"
                            )

                            .status(
                                    "PROCESSING"
                            )

                            .build();


            documentRepository.save(
                    document
            );


            logAudit(
                    "DOCUMENT_CREATED",
                    "Created document record: "
                            + docId
                            + " in folder: "
                            + folder.getId()
                            + " in workspace: "
                            + workspaceId
            );


            // ----------------------------------------------------
            // 8. Create AI request
            // ----------------------------------------------------

            AiAnalysisRequestDto aiRequest =
                    AiAnalysisRequestDto.builder()

                            .documentId(
                                    docId
                            )

                            .title(
                                    folderName
                            )

                            .content(
                                    extractedText
                            )

                            .maxSummaryLength(
                                    200
                            )

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
            // 9. Call AI service
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
            // 10. Get modules
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
            // 11. Save analysis result
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

                            .documentId(
                                    docId
                            )

                            .modulesJson(
                                    serializeJson(
                                            modules
                                    )
                            )

                            .build();


            analysisResultRepository.save(
                    analysisResult
            );


            // ----------------------------------------------------
            // 12. Mark document completed
            // ----------------------------------------------------

            document.setStatus(
                    "COMPLETED"
            );

            documentRepository.save(
                    document
            );


            // ----------------------------------------------------
            // 13. Mark folder completed
            // ----------------------------------------------------

            folder.setStatus(
                    "COMPLETED"
            );

            folderRepository.save(
                    folder
            );


            logAudit(
                    "DOCUMENT_ANALYZED",
                    "Document processing completed: "
                            + docId
                            + ", folder: "
                            + folder.getId()
                            + ", workspace: "
                            + workspaceId
            );


            // ----------------------------------------------------
            // 14. Get file count
            // ----------------------------------------------------

            long fileCount =
                    documentRepository
                            .countByFolderId(
                                    folder.getId()
                            );


            // ----------------------------------------------------
            // 15. Build POST response
            // ----------------------------------------------------

            String message;

            if (newFolder) {

                message =
                        "Folder "
                                + folder.getName()
                                + " created and document uploaded successfully";

            } else {

                message =
                        "Document uploaded into existing folder "
                                + folder.getName()
                                + " successfully";
            }


            FolderUploadResponseDto.FolderData data =
                    FolderUploadResponseDto.FolderData.builder()

                            .id(
                                    folder.getId()
                            )

                            .title(
                                    folder.getName()
                            )

                            .status(
                                    folder.getStatus()
                            )

                            .createdAt(
                                    folder.getCreatedAt()
                            )

                            .filesCount(
                                    String.valueOf(
                                            fileCount
                                    )
                            )

                            .build();


            return FolderUploadResponseDto.builder()

                    .message(
                            message
                    )

                    .data(
                            data
                    )

                    .isError(
                            false
                    )

                    .build();


        } catch (Exception e) {

            log.error(
                    "Failed to process document {}: {}",
                    docId,
                    e.getMessage(),
                    e
            );


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
    // GET ALL FOLDERS + FILES + MODULES
    // ============================================================

    public GetAllDocumentsResponseDto getAllDocuments(
            String workspaceId
    ) {

        if (
                workspaceId == null
                        || workspaceId.isBlank()
        ) {

            throw new IllegalArgumentException(
                    "Workspace ID cannot be empty"
            );
        }


        /*
         * Get folders instead of documents.
         *
         * This is the main change from the previous GET API.
         */
        List<FolderEntity> folders =
                folderRepository
                        .findByWorkspaceIdOrderByCreatedAtDesc(
                                workspaceId
                        );


        List<FolderDocumentResponseDto> folderResponses =
                folders.stream()
                        .map(this::mapFolderToResponse)
                        .toList();


        return GetAllDocumentsResponseDto.builder()

                .message(
                        "Document details retrieved successfully"
                )

                .data(
                        folderResponses
                )

                .isError(
                        false
                )

                .build();
    }


    // ============================================================
    // MAP FOLDER TO GET-ALL RESPONSE
    // ============================================================

    private FolderDocumentResponseDto mapFolderToResponse(
            FolderEntity folder
    ) {

        /*
         * Get all uploaded files/documents inside this folder.
         */
        List<DocumentEntity> documents =
                documentRepository
                        .findByFolderIdOrderByCreatedAtAsc(
                                folder.getId()
                        );


        List<FolderFileResponseDto> files =
                new ArrayList<>();


        int fileNumber = 1;

        int totalSections = 0;


        for (DocumentEntity document :
                documents) {

            /*
             * Get modules/sections for this file.
             */
            AnalysisResultEntity analysis =
                    analysisResultRepository
                            .findByDocumentId(
                                    document.getId()
                            )
                            .orElse(null);


            List<DocumentModuleDto> modules =
                    Collections.emptyList();


            if (analysis != null) {

                modules =
                        deserializeModules(
                                analysis.getModulesJson()
                        );
            }


            /*
             * Only top-level modules are returned.
             *
             * Subsections/children are intentionally ignored.
             */
            List<FolderSectionResponseDto> sections =
                    new ArrayList<>();


            int sectionNumber = 1;


            for (DocumentModuleDto module :
                    modules) {

                if (
                        module == null
                                || module.getModuleName() == null
                                || module.getModuleName().isBlank()
                ) {
                    continue;
                }


                String sectionsNumber =
                        fileNumber
                                + "."
                                + sectionNumber;


                sections.add(
                        FolderSectionResponseDto.builder()

                                .sectionsNumber(
                                        sectionsNumber
                                )

                                .sectionsName(
                                        module.getModuleName()
                                )

                                .build()
                );


                sectionNumber++;
                totalSections++;
            }


            /*
             * Actual uploaded file name.
             */
            String actualFileName =
                    document.getFileName();


            /*
             * Backward compatibility for old records
             * that were created before file_name existed.
             */
            if (
                    actualFileName == null
                            || actualFileName.isBlank()
            ) {

                actualFileName =
                        document.getTitle();
            }


            files.add(
                    FolderFileResponseDto.builder()

                            .filesNumber(
                                    String.valueOf(
                                            fileNumber
                                    )
                            )

                            .filesName(
                                    actualFileName
                            )

                            .children(
                                    sections
                            )

                            .build()
            );


            fileNumber++;
        }


        return FolderDocumentResponseDto.builder()

                /*
                 * Folder ID.
                 */
                .id(
                        folder.getId()
                )

                /*
                 * Folder name.
                 */
                .title(
                        folder.getName()
                )

                .status(
                        folder.getStatus()
                )

                /*
                 * Folder creation date.
                 */
                .uploadedDate(
                        folder.getCreatedAt()
                )

                /*
                 * Number of documents/files in folder.
                 */
                .filesCount(
                        String.valueOf(
                                documents.size()
                        )
                )

                /*
                 * Total number of top-level modules
                 * across all files in this folder.
                 */
                .sectionsCount(
                        String.valueOf(
                                totalSections
                        )
                )

                .files(
                        files
                )

                .build();
    }


    // ============================================================
    // GET DOCUMENT BY ID
    // ============================================================

    public DocumentResponseDto getDocumentById(
            String workspaceId,
            String documentId
    ) {

        if (
                workspaceId == null
                        || workspaceId.isBlank()
        ) {

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
                        .findByDocumentId(
                                documentId
                        )
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
    // MAP DOCUMENT RESPONSE
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