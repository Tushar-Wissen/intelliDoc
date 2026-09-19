package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiExtractionResponseDto {
    @JsonProperty("document_id")
    private String documentId;
    @JsonProperty("document_type")
    private String documentType;
    @JsonProperty("classification_confidence")
    private Double classificationConfidence;
    @JsonProperty("review_required")
    private Boolean reviewRequired;
    private List<ExtractedFieldDto> fields;
}