package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.OffsetDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentResponseDto {

    private String id;
    private String title;
    private String content;
    private String contentType;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    // Associated Analysis details
    private String summary;
    private String sentiment;
    private Double confidenceScore;
    private List<String> entities;
    private List<String> keyTopics;
    private String documentType;
    private Double classificationConfidence;
    private Boolean reviewRequired;
    private List<ExtractedFieldDto> fields;
}
