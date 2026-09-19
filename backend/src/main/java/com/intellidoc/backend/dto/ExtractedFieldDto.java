package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExtractedFieldDto {
    private String id;
    @JsonProperty("field_name")
    private String fieldName;
    @JsonProperty("field_value")
    private String fieldValue;
    @JsonProperty("source_page")
    private Integer sourcePage;
    @JsonProperty("source_chunk_id")
    private String sourceChunkId;
    private Double confidence;
    private String status;
}