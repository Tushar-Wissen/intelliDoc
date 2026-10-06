package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

@Data
public class AiExtractionResponseDto {

    @JsonProperty("document_id")
    private String documentId;
    private List<ExtractedPageDto> pages;
    private String combinedText;
    @JsonProperty("ocr_pages")
    private List<Integer> ocrPages;
    @JsonProperty("native_pages")
    private List<Integer> nativePages;
    private List<ExtractedSectionDto> sections;
    private List<ExtractedChunkDto> chunks;
    @JsonProperty("extraction_version")
    private String extractionVersion;

    @Data
    public static class ExtractedPageDto {
        @JsonProperty("page_number")
        private int pageNumber;
        private String method;
        private String text;
        private Double confidence;
    }

    @Data
    public static class ExtractedSectionDto {
        @JsonProperty("section_id")
        private String sectionId;
        private String heading;
        @JsonProperty("parent_section_id")
        private String parentSectionId;
        @JsonProperty("start_page")
        private int startPage;
        @JsonProperty("end_page")
        private int endPage;
    }

    @Data
    public static class ExtractedChunkDto {
        @JsonProperty("chunk_id")
        private String chunkId;
        @JsonProperty("section_id")
        private String sectionId;
        @JsonProperty("page_number")
        private int pageNumber;
        @JsonProperty("chunk_text")
        private String chunkText;
        @JsonProperty("token_count")
        private int tokenCount;
    }
}