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
public class AiQARequestDto {

    @JsonProperty("document_id")
    private String documentId;

    private String context;
    private String question;
}
