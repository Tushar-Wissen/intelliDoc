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
public class AiAnalysisResponseDto {

    @JsonProperty("document_id")
    private String documentId;

    private String summary;
    private String sentiment;

    @JsonProperty("confidence_score")
    private Double confidenceScore;

    private List<String> entities;

    @JsonProperty("key_topics")
    private List<String> keyTopics;

    // NEW: Modules returned by Python AI service
    private List<DocumentModuleDto> modules;
}
