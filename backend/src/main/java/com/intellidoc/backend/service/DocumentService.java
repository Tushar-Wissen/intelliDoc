package com.intellidoc.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.*;
import com.intellidoc.backend.model.AnalysisResultEntity;
import com.intellidoc.backend.model.AuditLogEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.repository.AnalysisResultRepository;
import com.intellidoc.backend.repository.AuditLogRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional
    public DocumentResponseDto processAndSaveDocument(DocumentUploadDto uploadDto) {
        String docId = "doc_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        DocumentEntity document = DocumentEntity.builder()
                .id(docId)
                .title(uploadDto.getTitle())
                .content(uploadDto.getContent())
                .contentType(uploadDto.getContentType() != null ? uploadDto.getContentType() : "text/plain")
                .status("PROCESSING")
                .build();

        documentRepository.save(document);
        logAudit("DOCUMENT_CREATED", "Created document record: " + docId);

        try {
            AiAnalysisRequestDto aiRequest = AiAnalysisRequestDto.builder()
                    .documentId(docId)
                    .title(uploadDto.getTitle())
                    .content(uploadDto.getContent())
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

            document.setStatus("COMPLETED");
            documentRepository.save(document);
            logAudit("DOCUMENT_ANALYZED", "AI Analysis completed for document: " + docId);

            return mapToResponseDto(document, analysisResult);

        } catch (Exception e) {
            log.error("Failed to analyze document ID {}: {}", docId, e.getMessage());
            document.setStatus("FAILED");
            documentRepository.save(document);
            logAudit("DOCUMENT_ANALYSIS_FAILED", "AI Analysis failed for document: " + docId + ", error: " + e.getMessage());
            return mapToResponseDto(document, null);
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
