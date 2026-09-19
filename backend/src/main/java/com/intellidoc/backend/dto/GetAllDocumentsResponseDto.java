package com.intellidoc.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GetAllDocumentsResponseDto {

    private String message;

    private List<FolderDocumentResponseDto> data;

    @JsonProperty("isError")
    private boolean isError;
}