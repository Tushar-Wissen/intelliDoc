package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

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

    /**
     * Structured text blocks extracted from PDF/PPTX.
     */
    @Builder.Default
    private List<DocumentTextBlockDto> blocks =
            new ArrayList<>();
}