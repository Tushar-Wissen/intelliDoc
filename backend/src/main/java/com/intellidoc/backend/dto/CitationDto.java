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
public class CitationDto {
    private UUID citationId;
    private UUID documentId;
    private UUID chunkId;
    private Integer page;
    private String section;
    private String excerpt;
}
