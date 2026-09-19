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
public class AiExtractionRequestDto {
    @JsonProperty("document_id")
    private String documentId;
    private String title;
    private String content;
    private List<AiDocumentChunkDto> chunks;
}