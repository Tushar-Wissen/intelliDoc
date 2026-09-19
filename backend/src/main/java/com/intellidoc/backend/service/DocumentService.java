package com.intellidoc.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.client.AiServiceClient;
import com.intellidoc.backend.dto.*;
import com.intellidoc.backend.model.AnalysisResultEntity;
import com.intellidoc.backend.model.AuditLogEntity;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.ExtractedFieldEntity;
import com.intellidoc.backend.repository.AnalysisResultRepository;
import com.intellidoc.backend.repository.AuditLogRepository;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.ExtractedFieldRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.ArrayList;
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
    private final ExtractedFieldRepository extractedFieldRepository;
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

            AiExtractionResponseDto extraction = aiServiceClient.extractDocument(AiExtractionRequestDto.builder()
                    .documentId(docId)
                    .title(uploadDto.getTitle())
                    .content(uploadDto.getContent())
                    .chunks(Collections.emptyList())
                    .build());
            if (extraction != null) {
                saveExtractedFields(docId, extraction.getFields());
                document.setDocumentType(extraction.getDocumentType());
                document.setClassificationConfidence(extraction.getClassificationConfidence());
                document.setReviewRequired(extraction.getReviewRequired());
            }

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

    @Transactional
    public ExtractedFieldDto updateField(String fieldId, FieldUpdateRequestDto request, String actorId) {
        ExtractedFieldEntity field = extractedFieldRepository.findById(fieldId)
                .orElseThrow(() -> new RuntimeException("Field not found with ID: " + fieldId));
        field.setFieldValue(request.getFieldValue());
        field.setStatus("CORRECTED");
        field.setCorrectedBy(actorId);
        field.setUpdatedAt(java.time.OffsetDateTime.now());
        logAudit("FIELD_CORRECTED", "Corrected extracted field: " + fieldId);
        return mapField(extractedFieldRepository.save(field));
    }

    @Transactional
    public void deleteField(String fieldId, String actorId) {
        ExtractedFieldEntity field = extractedFieldRepository.findById(fieldId)
                .orElseThrow(() -> new RuntimeException("Field not found with ID: " + fieldId));
        field.setStatus("REMOVED");
        field.setCorrectedBy(actorId);
        field.setUpdatedAt(java.time.OffsetDateTime.now());
        extractedFieldRepository.save(field);
        logAudit("FIELD_REMOVED", "Removed extracted field: " + fieldId);
    }

    public List<ExtractedFieldDto> getFields(String documentId) {
        return extractedFieldRepository.findByDocumentIdAndStatusNotOrderByCreatedAtAsc(documentId, "REMOVED")
                .stream().map(this::mapField).collect(Collectors.toList());
    }

    public byte[] exportFields(String documentId, String format) {
        List<ExtractedFieldDto> fields = getFields(documentId);
        if ("json".equalsIgnoreCase(format)) {
            try {
                return objectMapper.writeValueAsBytes(fields);
            } catch (JsonProcessingException e) {
                throw new RuntimeException("Could not serialize fields", e);
            }
        }
        if (!"csv".equalsIgnoreCase(format)) {
            throw new IllegalArgumentException("format must be csv or json");
        }
        StringBuilder csv = new StringBuilder("fieldName,fieldValue,confidence,sourcePage,sourceChunkId,status\n");
        for (ExtractedFieldDto field : fields) {
            csv.append(csvValue(field.getFieldName())).append(',')
                    .append(csvValue(field.getFieldValue())).append(',')
                    .append(field.getConfidence()).append(',')
                    .append(field.getSourcePage()).append(',')
                    .append(csvValue(field.getSourceChunkId())).append(',')
                    .append(csvValue(field.getStatus())).append('\n');
        }
        return csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
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
            builder.documentType(doc.getDocumentType())
                .classificationConfidence(doc.getClassificationConfidence())
                .reviewRequired(doc.getReviewRequired())
                .fields(getFields(doc.getId()));

        if (analysis != null) {
            builder.summary(analysis.getSummary())
                    .sentiment(analysis.getSentiment())
                    .confidenceScore(analysis.getConfidenceScore())
                    .entities(deserializeJsonList(analysis.getEntitiesJson()))
                    .keyTopics(deserializeJsonList(analysis.getKeyTopicsJson()));
        }

        return builder.build();
    }

    private void saveExtractedFields(String documentId, List<ExtractedFieldDto> fields) {
        if (fields == null) return;
        for (ExtractedFieldDto field : fields) {
            extractedFieldRepository.save(ExtractedFieldEntity.builder()
                    .id("field_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                    .documentId(documentId)
                    .fieldName(field.getFieldName())
                    .fieldValue(field.getFieldValue())
                    .sourcePage(field.getSourcePage())
                    .sourceChunkId(field.getSourceChunkId())
                    .confidence(field.getConfidence())
                    .status(field.getStatus() != null ? field.getStatus() : "AI_GENERATED")
                    .build());
        }
    }

    private ExtractedFieldDto mapField(ExtractedFieldEntity field) {
        return ExtractedFieldDto.builder()
                .id(field.getId()).fieldName(field.getFieldName()).fieldValue(field.getFieldValue())
                .sourcePage(field.getSourcePage()).sourceChunkId(field.getSourceChunkId())
                .confidence(field.getConfidence()).status(field.getStatus()).build();
    }

    private String csvValue(String value) {
        if (value == null) return "";
        return "\"" + value.replace("\"", "\"\"") + "\"";
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
