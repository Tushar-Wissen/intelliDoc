package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentDetailDto {
    private UUID id;
    private String fileName;
    private String documentType;
    private Double classificationConfidence;
    private String processingStatus;
    private List<String> overview;
    private String summary;
    private String uploadedByName;
    private String fileType;
    private String extension;
    private double fileSizeMb;
    private int pageCount;
    private UUID moduleId;
    private OffsetDateTime createdAt;
}
