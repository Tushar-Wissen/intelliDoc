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
public class AiQAResponseDto {

    @JsonProperty("document_id")
    private String documentId;

    private String question;
    private String answer;
    private Double confidence;
    @JsonProperty("is_not_found")
    private Boolean isNotFound;
    private List<CitationDto> citations;

    @Data
    public static class CitationDto {
        @JsonProperty("page_number")
        private Integer pageNumber;
        @JsonProperty("source_excerpt")
        private String sourceExcerpt;
    }
}
