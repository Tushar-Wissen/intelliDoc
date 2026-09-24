package com.intellidoc.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.dto.ExtractedFieldDto;
import com.intellidoc.backend.dto.ExtractedFieldListResponseDto;
import com.intellidoc.backend.dto.PatchExtractedFieldRequestDto;
import com.intellidoc.backend.exception.ApiException;
import com.intellidoc.backend.exception.DmsExceptions;
import com.intellidoc.backend.field.FieldStatus;
import com.intellidoc.backend.model.DocumentEntity;
import com.intellidoc.backend.model.ExtractedFieldEntity;
import com.intellidoc.backend.repository.DocumentRepository;
import com.intellidoc.backend.repository.ExtractedFieldRepository;
import com.intellidoc.backend.security.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FieldService {

    private final ExtractedFieldRepository extractedFieldRepository;
    private final DocumentRepository documentRepository;
    private final WorkspaceAccessService workspaceAccessService;
    private final ObjectMapper objectMapper;

    public ExtractedFieldListResponseDto list(AuthPrincipal principal, UUID documentId) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        List<ExtractedFieldDto> fields = extractedFieldRepository
                .findByDocumentIdAndStatusNotOrderByCreatedAtAsc(documentId, FieldStatus.REMOVED)
                .stream()
                .map(this::toDto)
                .toList();
        return ExtractedFieldListResponseDto.builder().fields(fields).build();
    }

    public ExtractedFieldDto correct(
            AuthPrincipal principal,
            UUID fieldId,
            PatchExtractedFieldRequestDto request) {
        ExtractedFieldEntity field = requireField(fieldId);
        DocumentEntity document = requireActiveDocument(field.getDocumentId());
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        if (request == null || request.getFieldValue() == null || request.getFieldValue().isBlank()) {
            throw invalidFieldRequest();
        }
        field.setFieldValue(request.getFieldValue().trim());
        field.setStatus(FieldStatus.CORRECTED);
        field.setCorrectedBy(principal.userId());
        return toDto(extractedFieldRepository.save(field));
    }

    public ExtractedFieldDto remove(AuthPrincipal principal, UUID fieldId) {
        ExtractedFieldEntity field = requireField(fieldId);
        DocumentEntity document = requireActiveDocument(field.getDocumentId());
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        field.setStatus(FieldStatus.REMOVED);
        field.setCorrectedBy(principal.userId());
        return toDto(extractedFieldRepository.save(field));
    }

    public ExportPayload export(AuthPrincipal principal, UUID documentId, String format) {
        DocumentEntity document = requireActiveDocument(documentId);
        workspaceAccessService.requireMember(document.getWorkspaceId(), principal.userId());
        String normalized = format == null ? "" : format.trim().toLowerCase(Locale.ROOT);
        if (!"csv".equals(normalized) && !"json".equals(normalized)) {
            throw invalidExportFormat();
        }
        List<ExtractedFieldEntity> fields = extractedFieldRepository
                .findByDocumentIdAndStatusNotOrderByCreatedAtAsc(documentId, FieldStatus.REMOVED);
        if ("json".equals(normalized)) {
            try {
                List<ExtractedFieldDto> payload = fields.stream().map(this::toDto).toList();
                byte[] json = objectMapper.writeValueAsBytes(payload);
                return new ExportPayload("application/json", "fields.json", json);
            } catch (JsonProcessingException ex) {
                throw new ApiException(
                        HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        "FIELD_EXPORT_FAILED",
                        "Failed to serialize export."
                );
            }
        }
        StringBuilder csv = new StringBuilder("fieldName,fieldValue,confidence,sourcePage,status\n");
        for (ExtractedFieldEntity field : fields) {
            csv.append(escapeCsv(field.getFieldName())).append(',')
                    .append(escapeCsv(field.getFieldValue())).append(',')
                    .append(field.getConfidence() == null ? "" : field.getConfidence()).append(',')
                    .append(field.getSourcePage() == null ? "" : field.getSourcePage()).append(',')
                    .append(escapeCsv(field.getStatus()))
                    .append('\n');
        }
        return new ExportPayload("text/csv", "fields.csv", csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private ExtractedFieldEntity requireField(UUID fieldId) {
        return extractedFieldRepository.findById(fieldId)
                .orElseThrow(DmsExceptions::fieldNotFound);
    }

    private DocumentEntity requireActiveDocument(UUID documentId) {
        return documentRepository.findByIdAndDeletedAtIsNull(documentId)
                .orElseThrow(DmsExceptions::documentNotFound);
    }

    private ExtractedFieldDto toDto(ExtractedFieldEntity field) {
        return ExtractedFieldDto.builder()
                .id(field.getId())
                .fieldName(field.getFieldName())
                .fieldCategory(field.getFieldCategory())
                .fieldValue(field.getFieldValue())
                .confidence(field.getConfidence())
                .sourcePage(field.getSourcePage())
                .status(field.getStatus())
                .build();
    }

    private static ApiException invalidFieldRequest() {
        return new ApiException(
                HttpStatus.BAD_REQUEST.value(),
                "FIELD_INVALID_REQUEST",
                "fieldValue is required."
        );
    }

    private static ApiException invalidExportFormat() {
        return new ApiException(
                HttpStatus.BAD_REQUEST.value(),
                "FIELD_INVALID_EXPORT_FORMAT",
                "format must be csv or json."
        );
    }

    private static String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        String escaped = value.replace("\"", "\"\"");
        if (escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n")) {
            return "\"" + escaped + "\"";
        }
        return escaped;
    }

    public record ExportPayload(String contentType, String fileName, byte[] bytes) {
    }
}
