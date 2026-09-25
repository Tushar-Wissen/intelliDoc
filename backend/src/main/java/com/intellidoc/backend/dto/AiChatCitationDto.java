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
public class AiChatCitationDto {
    private UUID chunkId;
    private UUID documentId;
    private String documentName;
    private Integer pageNumber;
    private String sectionHeading;
    private String sourceExcerpt;
}
