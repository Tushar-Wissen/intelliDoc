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
public class AiAnalysisRequestDto {

    @JsonProperty("document_id")
    private String documentId;

    private String title;
    private String content;

    @JsonProperty("max_summary_length")
    private Integer maxSummaryLength;
}
