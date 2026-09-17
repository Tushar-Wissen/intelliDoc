package com.intellidoc.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.*;
import com.intellidoc.backend.model.AnalysisResultEntity;
import com.intellidoc.backend.model.AuditLogEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.DocumentPageEntity;
import com.intellidoc.backend.model.DocumentSectionEntity;
import com.intellidoc.backend.model.DocumentChunkEntity;
import com.intellidoc.backend.model.ProcessingJobEntity;
import com.intellidoc.backend.repository.AnalysisResultRepository;
import com.intellidoc.backend.repository.AuditLogRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.DocumentPageRepository;
import com.intellidoc.backend.repository.DocumentSectionRepository;
import com.intellidoc.backend.repository.DocumentChunkRepository;
import com.intellidoc.backend.repository.ProcessingJobRepository;
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
    private final DocumentPageRepository documentPageRepository;
    private final DocumentSectionRepository documentSectionRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final ProcessingJobRepository processingJobRepository;
    private final AnalysisResultRepository analysisResultRepository;
    private final AuditLogRepository auditLogRepository;
    private final AiServiceClient aiServiceClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional
    public DocumentResponseDto processAndSaveDocument(DocumentUploadDto uploadDto) {
        String docId = "doc_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        return processAndAnalyze(
                docId,
                uploadDto.getTitle(),
                uploadDto.getContent(),
                uploadDto.getContentType() != null ? uploadDto.getContentType() : "text/plain",
                toExtractionResponse(uploadDto));
    }

    @Transactional
    public DocumentResponseDto processAndSaveUploadedDocument(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded document cannot be empty");
        }

        String docId = "doc_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String title = file.getOriginalFilename() != null ? file.getOriginalFilename() : "Uploaded document";
        AiExtractionResponseDto extraction = aiServiceClient.extractDocument(docId, file);
        if (extraction == null || extraction.getCombinedText() == null || extraction.getCombinedText().isBlank()) {
            throw new IllegalStateException("AI Service returned no extractable text");
        }

        return processAndAnalyze(docId, title, extraction.getCombinedText(),
            file.getContentType() != null ? file.getContentType() : "application/octet-stream", extraction);
    }

        private DocumentResponseDto processAndAnalyze(String docId, String title, String content, String contentType,
                              AiExtractionResponseDto extraction) {

        DocumentEntity document = DocumentEntity.builder()
                .id(docId)
                .title(title)
                .content(content)
                .contentType(contentType)
                .status("PROCESSING")
                .build();

        documentRepository.save(document);
        logAudit("DOCUMENT_CREATED", "Created document record: " + docId);

        try {
            completeStage(docId, "PARSING");
            persistExtraction(docId, extraction);
            completeStage(docId, "EXTRACTING");

            AiAnalysisRequestDto aiRequest = AiAnalysisRequestDto.builder()
                    .documentId(docId)
                    .title(title)
                    .content(content)
                    .maxSummaryLength(200)
                    .build();

            AiAnalysisResponseDto aiResponse = aiServiceClient.analyzeDocument(aiRequest);

            AnalysisResultEntity analysisResult = AnalysisResultEntity.builder()
                    .id("analysis_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                    .documentId(docId)
                    .summary(aiResponse.getSummary())
                    .sentiment(aiResponse.getSentiment())
                    .confidenceScore(aiResponse.getConfidenceScore())
                    .entitiesJson(serializeJson(aiResponse.getEntities()))
                    .keyTopicsJson(serializeJson(aiResponse.getKeyTopics()))
                    .build();

            analysisResultRepository.save(analysisResult);
            completeStage(docId, "INDEXING");

            document.setStatus("READY");
            documentRepository.save(document);
            logAudit("DOCUMENT_ANALYZED", "AI Analysis completed for document: " + docId);

            return mapToResponseDto(document, analysisResult);

        } catch (Exception e) {
            log.error("Failed to analyze document ID {}: {}", docId, e.getMessage());
            failStage(docId, e);
            document.setStatus("FAILED");
            documentRepository.save(document);
            logAudit("DOCUMENT_ANALYSIS_FAILED", "AI Analysis failed for document: " + docId + ", error: " + e.getMessage());
            return mapToResponseDto(document, null);
        }
    }

    private void completeStage(String documentId, String stage) {
        processingJobRepository.save(ProcessingJobEntity.builder()
                .id("job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                .documentId(documentId)
                .stage(stage)
                .status("COMPLETED")
                .completedAt(java.time.OffsetDateTime.now())
                .build());
    }

    private void failStage(String documentId, Exception error) {
        processingJobRepository.save(ProcessingJobEntity.builder()
                .id("job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                .documentId(documentId)
                .stage("FAILED")
                .status("FAILED")
                .errorMessage(error.getMessage())
                .completedAt(java.time.OffsetDateTime.now())
                .build());
    }

    private AiExtractionResponseDto toExtractionResponse(DocumentUploadDto uploadDto) {
        if (uploadDto.getPages() == null || uploadDto.getPages().isEmpty()) {
            return null;
        }
        AiExtractionResponseDto response = new AiExtractionResponseDto();
        response.setPages(uploadDto.getPages());
        response.setSections(uploadDto.getSections());
        response.setChunks(uploadDto.getChunks());
        return response;
    }

    private void persistExtraction(String documentId, AiExtractionResponseDto extraction) {
        if (extraction == null) {
            return;
        }
        if (extraction.getPages() != null) {
            documentPageRepository.saveAll(extraction.getPages().stream().map(page -> DocumentPageEntity.builder()
                    .id(documentId + "_page_" + page.getPageNumber())
                    .documentId(documentId)
                    .pageNumber(page.getPageNumber())
                    .rawText(page.getText() == null ? "" : page.getText())
                    .wasOcr("ocr".equals(page.getMethod()))
                    .ocrConfidence(page.getConfidence())
                    .build()).toList());
        }
        if (extraction.getSections() != null) {
            documentSectionRepository.saveAll(extraction.getSections().stream().map(section -> DocumentSectionEntity.builder()
                    .id(documentId + "_" + section.getSectionId())
                    .documentId(documentId)
                    .parentSectionId(section.getParentSectionId())
                    .heading(section.getHeading())
                    .startPage(section.getStartPage())
                    .endPage(section.getEndPage())
                    .build()).toList());
        }
        if (extraction.getChunks() != null) {
            documentChunkRepository.saveAll(extraction.getChunks().stream().map(chunk -> DocumentChunkEntity.builder()
                    .id(documentId + "_" + chunk.getChunkId())
                    .documentId(documentId)
                    .sectionId(chunk.getSectionId() == null ? null : documentId + "_" + chunk.getSectionId())
                    .pageNumber(chunk.getPageNumber())
                    .chunkText(chunk.getChunkText())
                    .tokenCount(chunk.getTokenCount())
                    .build()).toList());
        }
    }

    public List<DocumentResponseDto> getAllDocuments() {
        return documentRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(doc -> {
                    AnalysisResultEntity result = analysisResultRepository.findByDocumentId(doc.getId()).orElse(null);
                    return mapToResponseDto(doc, result);
                })
                .collect(Collectors.toList());
    }

    public DocumentResponseDto getDocumentById(String id) {
        DocumentEntity doc = documentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Document not found with ID: " + id));
        AnalysisResultEntity result = analysisResultRepository.findByDocumentId(id).orElse(null);
        return mapToResponseDto(doc, result);
    }

    public AiQAResponseDto askDocumentQuestion(String documentId, String question) {
        DocumentEntity doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new RuntimeException("Document not found with ID: " + documentId));

        AiQARequestDto request = AiQARequestDto.builder()
                .documentId(documentId)
                .context(doc.getContent())
                .question(question)
                .build();

        AiQAResponseDto response = aiServiceClient.askQuestion(request);
        logAudit("DOCUMENT_QA", "Answered question for document: " + documentId);
        return response;
    }

    private String serializeJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj != null ? obj : Collections.emptyList());
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private List<String> deserializeJsonList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private DocumentResponseDto mapToResponseDto(DocumentEntity doc, AnalysisResultEntity analysis) {
        DocumentResponseDto.DocumentResponseDtoBuilder builder = DocumentResponseDto.builder()
                .id(doc.getId())
                .title(doc.getTitle())
                .content(doc.getContent())
                .contentType(doc.getContentType())
                .status(doc.getStatus())
                .createdAt(doc.getCreatedAt())
                .updatedAt(doc.getUpdatedAt());

        if (analysis != null) {
            builder.summary(analysis.getSummary())
                    .sentiment(analysis.getSentiment())
                    .confidenceScore(analysis.getConfidenceScore())
                    .entities(deserializeJsonList(analysis.getEntitiesJson()))
                    .keyTopics(deserializeJsonList(analysis.getKeyTopicsJson()));
        }

        return builder.build();
    }

    private void logAudit(String eventType, String details) {
        try {
            AuditLogEntity logEntity = AuditLogEntity.builder()
                    .id("audit_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                    .eventType(eventType)
                    .serviceName("Spring Boot Backend")
                    .details(details)
                    .build();
            auditLogRepository.save(logEntity);
        } catch (Exception e) {
            log.warn("Could not save audit log: {}", e.getMessage());
        }
    }
}
