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
public class ExtractedFieldDto {
    private UUID id;
    private String fieldName;
    private String fieldCategory;
    private String fieldValue;
    private Double confidence;
    private Integer sourcePage;
    private String status;
}
