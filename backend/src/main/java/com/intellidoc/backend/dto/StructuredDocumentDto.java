package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StructuredDocumentDto {

    private String content;

    @Builder.Default
    private List<DocumentTextBlockDto> blocks =
            new ArrayList<>();
}