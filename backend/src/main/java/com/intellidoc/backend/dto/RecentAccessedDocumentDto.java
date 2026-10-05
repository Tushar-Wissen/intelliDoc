package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecentAccessedDocumentDto {
    private UUID id;
    private String name;
    private String type;
    private String folder;
    private Long size;
    private String updatedAt;
    private String createdAt;
}