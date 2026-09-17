package com.intellidoc.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentUploadDto {

    @NotBlank(message = "Document title is required")
    private String title;

    @NotBlank(message = "Document text content is required")
    private String content;

    private String contentType;

    private List<AiExtractionResponseDto.ExtractedPageDto> pages;
    private List<AiExtractionResponseDto.ExtractedSectionDto> sections;
    private List<AiExtractionResponseDto.ExtractedChunkDto> chunks;
}
