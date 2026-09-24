package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SourcePassageDto {
    private UUID citationId;
    private UUID documentId;
    private String fileName;
    private Integer page;
    private String section;
    private String passage;
    private SourceHighlightDto highlight;
}
