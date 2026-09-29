package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DocumentSummaryDto {
    private UUID id;
    private String fileName;
    private UUID moduleId;
    private String moduleName;
    private String documentType;
    private String processingStatus;
    private OffsetDateTime createdAt;
}
