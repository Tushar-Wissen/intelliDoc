package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FolderSectionResponseDto {

    @JsonProperty("sections_number")
    private String sectionsNumber;

    @JsonProperty("sections_name")
    private String sectionsName;
}