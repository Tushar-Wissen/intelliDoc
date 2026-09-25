package com.intellidoc.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentOriginalFileDto {
    private byte[] bytes;
    private String contentType;
    private String fileName;
}
