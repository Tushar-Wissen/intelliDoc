package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
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
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ModuleResponseDto {
    private UUID id;
    private UUID workspaceId;
    private String name;
    private String description;
    private OffsetDateTime createdAt;
    private Integer totalFiles;
    private List<ModuleFileDto> files;
}
